import { describe, expect, it } from "vitest";
import { highOrCriticalFindings, partitionFindings } from "./osv-gate.js";

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

describe("highOrCriticalFindings — no-CVSS label fallback", () => {
  it("flags a HIGH advisory that has a label but no CVSS max_severity", () => {
    const report = {
      results: [
        {
          packages: [
            {
              package: { name: "malware-pkg", version: "1.2.3", ecosystem: "npm" },
              vulnerabilities: [{ id: "GHSA-malware", database_specific: { severity: "HIGH" } }],
              groups: [{ ids: ["GHSA-malware"], max_severity: "" }],
            },
          ],
        },
      ],
    };
    const findings = highOrCriticalFindings(report);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toContain("HIGH");
  });

  it("does not flag a LOW-labelled advisory with no CVSS max_severity", () => {
    const report = {
      results: [
        {
          packages: [
            {
              package: { name: "minor-pkg", version: "1.0.0", ecosystem: "npm" },
              vulnerabilities: [{ id: "GHSA-low", database_specific: { severity: "LOW" } }],
              groups: [{ ids: ["GHSA-low"], max_severity: "" }],
            },
          ],
        },
      ],
    };
    expect(highOrCriticalFindings(report)).toHaveLength(0);
  });

  it("fails closed when severity cannot be established at all", () => {
    const report = {
      results: [
        {
          packages: [
            {
              package: { name: "opaque-pkg", version: "9.9.9", ecosystem: "npm" },
              groups: [{ ids: ["GHSA-opaque"], max_severity: "" }],
            },
          ],
        },
      ],
    };
    const findings = highOrCriticalFindings(report);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toContain("fail-closed");
  });
});

describe("highOrCriticalFindings — vulnerabilities without a groups array", () => {
  const pkgWith = (vulnerabilities: unknown) => ({
    results: [
      {
        packages: [{ package: { name: "no-groups", version: "1.0.0" }, vulnerabilities }],
      },
    ],
  });

  it("flags a HIGH-labelled vulnerability that osv reported with no group summary", () => {
    const findings = highOrCriticalFindings(
      pkgWith([{ id: "GHSA-ng-high", database_specific: { severity: "CRITICAL" } }]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toContain("CRITICAL");
  });

  it("does not flag LOW-only vulnerabilities with no group summary", () => {
    expect(
      highOrCriticalFindings(
        pkgWith([{ id: "GHSA-ng-low", database_specific: { severity: "LOW" } }]),
      ),
    ).toHaveLength(0);
  });

  it("fails closed on a vulnerability with no establishable label and no group", () => {
    const findings = highOrCriticalFindings(pkgWith([{ id: "GHSA-ng-opaque" }]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toContain("fail-closed");
  });
});

describe("partitionFindings — triage allowlist", () => {
  const finding = (pkg: string, vulnerability: string) => ({
    package: pkg,
    vulnerability,
    severity: "CVSS 8.2",
  });

  it("routes an allowlisted advisory to triaged, not blocking", () => {
    const { blocking, triaged } = partitionFindings([
      finding("vite@8.0.11", "GHSA-fx2h-pf6j-xcff"),
    ]);
    expect(blocking).toHaveLength(0);
    expect(triaged).toHaveLength(1);
    expect(triaged[0]?.reviewBy).toBe("2026-10-15");
  });

  it("keeps a non-allowlisted HIGH advisory blocking", () => {
    const { blocking, triaged } = partitionFindings([finding("evil@1.0.0", "GHSA-not-listed")]);
    expect(blocking).toHaveLength(1);
    expect(triaged).toHaveLength(0);
  });

  it("still blocks a bundle that mixes a triaged id with a non-triaged one", () => {
    const { blocking } = partitionFindings([
      finding("mixed@1.0.0", "GHSA-fx2h-pf6j-xcff, GHSA-not-listed"),
    ]);
    expect(blocking).toHaveLength(1);
  });
});
