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

// Triaged advisories: HIGH/CRITICAL findings reviewed and accepted as not applicable to this
// project. This is a fail-closed allowlist keyed on the exact advisory id, NOT a severity
// relaxation — anything not listed here still fails the gate. Each entry carries a reason and a
// review-by date so the acceptance is auditable and expires.
const triagedAdvisories = new Map<string, { readonly reason: string; readonly reviewBy: string }>([
  [
    "GHSA-fx2h-pf6j-xcff",
    {
      reason:
        "vite dev-server fs.deny bypass on Windows alternate paths. Dev/test tooling only, not in " +
        "the shipped artifact; the deploy is Linux and never runs the vite dev server. vitest 4.1.5 " +
        "pins vite 8.0.11; a clean bump requires a vitest upgrade, tracked separately.",
      reviewBy: "2026-10-15",
    },
  ],
]);

export type PartitionedFindings = {
  readonly blocking: readonly OsvFinding[];
  readonly triaged: readonly TriagedFinding[];
};

type TriagedFinding = OsvFinding & { readonly reason: string; readonly reviewBy: string };

// Splits gate findings into blocking vs triaged-and-accepted. A finding is triaged only when
// EVERY advisory id it names is allowlisted; a bundle mixing a triaged id with a non-triaged one
// still blocks, so an allowlist entry can never hide an un-reviewed advisory.
export function partitionFindings(findings: readonly OsvFinding[]): PartitionedFindings {
  const blocking: OsvFinding[] = [];
  const triaged: TriagedFinding[] = [];
  for (const finding of findings) {
    const ids = finding.vulnerability.split(",").map((entry) => entry.trim());
    const entries = ids.map((id) => triagedAdvisories.get(id));
    const firstEntry = entries[0];
    if (
      ids.length > 0 &&
      firstEntry !== undefined &&
      entries.every((entry) => entry !== undefined)
    ) {
      triaged.push({ ...finding, reason: firstEntry.reason, reviewBy: firstEntry.reviewBy });
    } else {
      blocking.push(finding);
    }
  }
  return { blocking, triaged };
}

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

const highSeverityLabels = new Set(["HIGH", "CRITICAL"]);

function collectPackageFindings(pkg: unknown, findings: OsvFinding[]): void {
  if (!isObject(pkg)) {
    return;
  }
  const name = packageName(pkg["package"]);
  const vulnerabilities = pkg["vulnerabilities"];
  const labelsById = severityLabelsById(vulnerabilities);
  const groups = pkg["groups"];
  if (!Array.isArray(groups) || groups.length === 0) {
    // osv reported vulnerabilities but no group summary; evaluate the raw vulnerability labels
    // directly so a HIGH/CRITICAL is never dropped, and fail closed when a vulnerability's
    // severity cannot be established. A group summary is a convenience, not a precondition.
    const finding = findingFromVulnerabilities(name, vulnerabilities, labelsById);
    if (finding !== null) {
      findings.push(finding);
    }
    return;
  }
  for (const group of groups) {
    const finding = evaluateGroup(group, name, labelsById);
    if (finding !== null) {
      findings.push(finding);
    }
  }
}

function findingFromVulnerabilities(
  name: string,
  vulnerabilities: unknown,
  labelsById: ReadonlyMap<string, string>,
): OsvFinding | null {
  if (!Array.isArray(vulnerabilities) || vulnerabilities.length === 0) {
    return null;
  }
  const ids = vulnerabilities
    .map((vuln) => (isObject(vuln) && isString(vuln["id"]) ? vuln["id"] : null))
    .filter(isString);
  const labels = ids.map((id) => labelsById.get(id)).filter(isString);
  const highLabels = labels.filter((entry) => highSeverityLabels.has(entry));
  if (highLabels.length > 0) {
    return { package: name, vulnerability: label(ids), severity: highLabels.join("/") };
  }
  // Some vulnerability carried no establishable severity label: fail closed.
  if (labels.length < ids.length) {
    return { package: name, vulnerability: label(ids), severity: "unknown (fail-closed)" };
  }
  return null;
}

function evaluateGroup(
  group: unknown,
  name: string,
  labelsById: ReadonlyMap<string, string>,
): OsvFinding | null {
  if (!isObject(group)) {
    return null;
  }
  const ids = idsOf(group["ids"]);
  const rawSeverity = group["max_severity"];
  const cvss =
    typeof rawSeverity === "string" && rawSeverity.length > 0
      ? Number.parseFloat(rawSeverity)
      : Number.NaN;
  if (Number.isFinite(cvss)) {
    // CVSS is established: flag only at/above the floor, otherwise it is provably below.
    return cvss >= highSeverityCvssFloor
      ? { package: name, vulnerability: label(ids), severity: `CVSS ${cvss.toFixed(1)}` }
      : null;
  }
  // No parseable CVSS (e.g. GHSA malware advisories carry only a severity label). Fall back to
  // the label; if severity cannot be established at all, FAIL CLOSED rather than pass a
  // possibly-high advisory through a gate that could not read it.
  const labels = ids.map((id) => labelsById.get(id)).filter(isString);
  const highLabels = labels.filter((entry) => highSeverityLabels.has(entry));
  if (highLabels.length > 0) {
    return { package: name, vulnerability: label(ids), severity: highLabels.join("/") };
  }
  if (labels.length === 0) {
    return { package: name, vulnerability: label(ids), severity: "unknown (fail-closed)" };
  }
  return null;
}

function severityLabelsById(vulnerabilities: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(vulnerabilities)) {
    return map;
  }
  for (const vuln of vulnerabilities) {
    if (!isObject(vuln)) {
      continue;
    }
    const id = vuln["id"];
    const dbSpecific = vuln["database_specific"];
    if (isString(id) && isObject(dbSpecific) && isString(dbSpecific["severity"])) {
      map.set(id, dbSpecific["severity"].toUpperCase());
    }
  }
  return map;
}

function idsOf(rawIds: unknown): readonly string[] {
  return Array.isArray(rawIds) ? rawIds.filter(isString) : [];
}

function label(ids: readonly string[]): string {
  return ids.join(", ") || "unknown";
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
