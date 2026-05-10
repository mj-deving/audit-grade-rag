import { describe, expect, it } from "vitest";
import { inspectMasterPrd } from "./master-prd.js";

const validPrdExcerpt = `# Audit-Grade RAG Master PRD

Status: FROZEN
Project: \`audit-grade-rag\`
Guardrail status: Bootstrapped
Goal status: Not launched

## Build Acceptance Criteria

1698. AC-BLD-008: \`pnpm check:full\` runs eval harness.

## Definition of Done

1758. DOD-002: \`pnpm check:full\` passes locally.
`;

describe("inspectMasterPrd", () => {
  // No mocks: this validates pure contract parsing against an in-memory PRD excerpt.
  it("extracts the frozen guardrail contract", () => {
    expect(inspectMasterPrd(validPrdExcerpt)).toMatchObject({
      status: "FROZEN",
      project: "audit-grade-rag",
      guardrailStatus: "Bootstrapped",
      goalStatus: "Not launched",
      doneGateScript: "pnpm check:full",
    });
  });

  // No mocks: this validates the fail-closed path for accidental goal launch drift.
  it("rejects a launched goal status", () => {
    const driftedPrd = validPrdExcerpt.replace(
      "Goal status: Not launched",
      "Goal status: Launched",
    );

    expect(() => inspectMasterPrd(driftedPrd)).toThrow(/Goal status/u);
  });
});
