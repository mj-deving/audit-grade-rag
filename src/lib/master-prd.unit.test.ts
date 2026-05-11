import { describe, expect, it } from "vitest";
import { inspectMasterPrd } from "./master-prd.js";

const validPrdExcerpt = `---
Status: FROZEN
Project: audit-grade-rag
ISC count: 51
---

## §9. Acceptance Criteria

- [ ] **ISC-48**: \`pnpm check:full\` runs typecheck + Biome + ESLint + knip + Vitest (unit + integration) + e2e + eval harness, and exits 0.

## §11. Definition of Done

- [ ] \`pnpm check:full\` exits 0.
- [ ] \`pnpm build\` exits 0.

## §13. Run Log and Progress Notes
`;

describe("inspectMasterPrd", () => {
  // No mocks: this validates pure contract parsing against an in-memory PRD excerpt.
  it("extracts the frozen guardrail contract", () => {
    expect(inspectMasterPrd(validPrdExcerpt)).toMatchObject({
      status: "FROZEN",
      project: "audit-grade-rag",
      iscCount: 51,
      doneGateScript: "pnpm check:full",
    });
  });

  // No mocks: this validates the fail-closed path for contract-anchor drift.
  it("rejects an ISC count drift", () => {
    const driftedPrd = validPrdExcerpt.replace("ISC count: 51", "ISC count: 50");

    expect(() => inspectMasterPrd(driftedPrd)).toThrow(/ISC count/u);
  });
});
