import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export type MasterPrdContract = {
  readonly status: "FROZEN";
  readonly project: "audit-grade-rag";
  readonly iscCount: 51;
  readonly doneGateScript: "pnpm check:full";
  readonly sha256: string;
  readonly lineCount: number;
};

const requiredMarkers = [
  "Status: FROZEN",
  "Project: audit-grade-rag",
  "ISC count: 51",
  "## §9. Acceptance Criteria",
  "## §11. Definition of Done",
  "`pnpm check:full` exits 0.",
  "`pnpm build` exits 0.",
  "## §13. Run Log and Progress Notes",
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
  const iscCount = readNumberField(content, "ISC count");

  if (status !== "FROZEN") {
    throw new Error(`Master PRD status must be FROZEN, found ${status}`);
  }
  if (project !== "audit-grade-rag") {
    throw new Error(`Master PRD project mismatch: ${project}`);
  }
  if (iscCount !== 51) {
    throw new Error(`Master PRD ISC count must be 51, found ${String(iscCount)}`);
  }

  return {
    status,
    project: "audit-grade-rag",
    iscCount,
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

function readNumberField(content: string, label: string): number {
  const value = Number.parseInt(readField(content, label), 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Master PRD field is not numeric: ${label}`);
  }
  return value;
}

function countLines(content: string): number {
  return content.endsWith("\n")
    ? content.split(/\r?\n/u).length - 1
    : content.split(/\r?\n/u).length;
}
