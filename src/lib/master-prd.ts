import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export type MasterPrdContract = {
  readonly status: "FROZEN";
  readonly project: "audit-grade-rag";
  readonly guardrailStatus: "Bootstrapped";
  readonly goalStatus: "Not launched";
  readonly doneGateScript: "pnpm check:full";
  readonly sha256: string;
  readonly lineCount: number;
};

const requiredMarkers = [
  "Status: FROZEN",
  "Project: `audit-grade-rag`",
  "Guardrail status: Bootstrapped",
  "Goal status: Not launched",
  "Definition of Done",
  "DOD-002: `pnpm check:full` passes locally.",
  "AC-BLD-008: `pnpm check:full` runs eval harness.",
] as const;

export async function readMasterPrdContract(
  path = "docs/MASTER_PRD.md",
): Promise<MasterPrdContract> {
  return inspectMasterPrd(await readFile(path, "utf8"));
}

export function inspectMasterPrd(content: string): MasterPrdContract {
  for (const marker of requiredMarkers) {
    requireMarker(content, marker);
  }

  const status = readField(content, "Status");
  const project = readField(content, "Project");
  const guardrailStatus = readField(content, "Guardrail status");
  const goalStatus = readField(content, "Goal status");

  if (status !== "FROZEN") {
    throw new Error(`Master PRD status must be FROZEN, found ${status}`);
  }
  if (project !== "`audit-grade-rag`") {
    throw new Error(`Master PRD project mismatch: ${project}`);
  }
  if (guardrailStatus !== "Bootstrapped") {
    throw new Error(`Guardrail status must be Bootstrapped, found ${guardrailStatus}`);
  }
  if (goalStatus !== "Not launched") {
    throw new Error(`Goal status must remain Not launched, found ${goalStatus}`);
  }

  return {
    status,
    project: "audit-grade-rag",
    guardrailStatus,
    goalStatus,
    doneGateScript: "pnpm check:full",
    sha256: createHash("sha256").update(content).digest("hex"),
    lineCount: countLines(content),
  };
}

function requireMarker(content: string, marker: string): void {
  if (!content.includes(marker)) {
    throw new Error(`Master PRD is missing required marker: ${marker}`);
  }
}

function readField(content: string, label: string): string {
  const prefix = `${label}: `;
  const line = content.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));

  if (line === undefined) {
    throw new Error(`Master PRD is missing field: ${label}`);
  }

  const value = line.slice(prefix.length).trim();
  if (value.length === 0) {
    throw new Error(`Master PRD field is empty: ${label}`);
  }

  return value;
}

function countLines(content: string): number {
  return content.endsWith("\n")
    ? content.split(/\r?\n/u).length - 1
    : content.split(/\r?\n/u).length;
}
