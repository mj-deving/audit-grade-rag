import { describe, expect, it } from "vitest";
import { highOrCriticalFindings } from "./osv-gate.js";

const critical = {
  results: [
    {
      packages: [
        {
          package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
          groups: [{ ids: ["GHSA-xxxx-yyyy-zzzz"], max_severity: "9.8" }],
        },
      ],
    },
  ],
};

const lowOnly = {
  results: [
    {
      packages: [
        {
          package: { name: "trivial", version: "2.0.0", ecosystem: "npm" },
          groups: [{ ids: ["GHSA-aaaa-bbbb-cccc"], max_severity: "3.1" }],
        },
      ],
    },
  ],
};

describe("highOrCriticalFindings", () => {
  it("flags a CRITICAL advisory above the CVSS floor", () => {
    const findings = highOrCriticalFindings(critical);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.package).toBe("left-pad@1.0.0");
    expect(findings[0]?.vulnerability).toContain("GHSA-xxxx-yyyy-zzzz");
  });

  it("ignores a low-severity advisory below the floor", () => {
    expect(highOrCriticalFindings(lowOnly)).toHaveLength(0);
  });

  it("returns nothing for an empty or malformed report", () => {
    expect(highOrCriticalFindings({ results: [] })).toHaveLength(0);
    expect(highOrCriticalFindings(null)).toHaveLength(0);
    expect(highOrCriticalFindings({ garbage: true })).toHaveLength(0);
  });
});
