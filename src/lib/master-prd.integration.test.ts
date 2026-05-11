import { describe, expect, it } from "vitest";
import { readMasterPrdContract } from "./master-prd.js";

describe("docs/MASTER_PRD.md contract", () => {
  // No mocks: this reads the repository contract file exactly as check:full will see it.
  it("stays frozen and ISC-anchored", async () => {
    await expect(readMasterPrdContract()).resolves.toMatchObject({
      status: "FROZEN",
      project: "audit-grade-rag",
      iscCount: 51,
      doneGateScript: "pnpm check:full",
    });
  });
});
