// Supply-chain gate (H-4). `pnpm audit` targets an npm endpoint that now returns 410, so
// CI scans the lockfile with osv-scanner and applies this severity gate to its JSON output.
// The standard fails the build on HIGH or CRITICAL only (CVSS >= 7.0), so a low-severity
// transitive advisory does not break an unrelated PR. Falsifier: a seeded high advisory
// does not fail the gate.

const highSeverityCvssFloor = 7.0;

type OsvFinding = {
  readonly package: string;
  readonly vulnerability: string;
  readonly severity: string;
};

// Returns HIGH/CRITICAL findings in an osv-scanner JSON report. Shape is defensive: the
// report is untrusted tool output, so every level is type-guarded and unknown shapes yield
// no findings (the scanner's own non-zero exit still surfaces infra failures separately).
export function highOrCriticalFindings(report: unknown): readonly OsvFinding[] {
  const findings: OsvFinding[] = [];
  if (!isObject(report)) {
    return findings;
  }
  const results = report["results"];
  if (!Array.isArray(results)) {
    return findings;
  }
  for (const result of results) {
    if (!isObject(result)) {
      continue;
    }
    const packages = result["packages"];
    if (!Array.isArray(packages)) {
      continue;
    }
    for (const pkg of packages) {
      collectPackageFindings(pkg, findings);
    }
  }
  return findings;
}

function collectPackageFindings(pkg: unknown, findings: OsvFinding[]): void {
  if (!isObject(pkg)) {
    return;
  }
  const name = packageName(pkg["package"]);
  const groups = pkg["groups"];
  if (!Array.isArray(groups)) {
    return;
  }
  for (const group of groups) {
    if (!isObject(group)) {
      continue;
    }
    const rawSeverity = group["max_severity"];
    const cvss = typeof rawSeverity === "string" ? Number.parseFloat(rawSeverity) : Number.NaN;
    if (Number.isFinite(cvss) && cvss >= highSeverityCvssFloor) {
      const rawIds = group["ids"];
      const ids = Array.isArray(rawIds) ? rawIds.filter(isString) : [];
      findings.push({
        package: name,
        vulnerability: ids.join(", ") || "unknown",
        severity: `CVSS ${cvss.toFixed(1)}`,
      });
    }
  }
}

function packageName(value: unknown): string {
  if (!isObject(value)) {
    return "unknown";
  }
  const rawName = value["name"];
  const rawVersion = value["version"];
  const name = typeof rawName === "string" ? rawName : "unknown";
  const version = typeof rawVersion === "string" ? `@${rawVersion}` : "";
  return `${name}${version}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
