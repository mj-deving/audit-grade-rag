import { describe, expect, it } from "vitest";
import { readMasterPrdContract } from "./master-prd.js";

describe("docs/MASTER_PRD.md contract", () => {
  // No mocks: this reads the repository contract file exactly as check:full will see it.
  it("stays frozen, bootstrapped, and unlaunched", async () => {
    await expect(readMasterPrdContract()).resolves.toMatchObject({
      status: "FROZEN",
      project: "audit-grade-rag",
      guardrailStatus: "Bootstrapped",
      goalStatus: "Not launched",
      doneGateScript: "pnpm check:full",
    });
  });
});
