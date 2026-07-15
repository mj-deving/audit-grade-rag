import { readFileSync } from "node:fs";
import { highOrCriticalFindings } from "../src/lib/osv-gate.js";

// CI entrypoint for the supply-chain gate (H-4). Reads an osv-scanner JSON report and exits
// non-zero when any HIGH/CRITICAL advisory is present. Usage: tsx scripts/osv-check.ts <report.json>
function main(): void {
  const reportPath = process.argv[2];
  if (reportPath === undefined) {
    process.stderr.write("usage: tsx scripts/osv-check.ts <osv-report.json>\n");
    process.exit(2);
  }
  let report: unknown;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    process.stderr.write(`osv-check: could not read report at ${reportPath}: ${String(error)}\n`);
    process.exit(2);
  }
  const findings = highOrCriticalFindings(report);
  if (findings.length === 0) {
    process.stdout.write("osv-check: no HIGH/CRITICAL advisories\n");
    return;
  }
  process.stderr.write(`osv-check: ${String(findings.length)} HIGH/CRITICAL advisory(ies):\n`);
  for (const finding of findings) {
    process.stderr.write(
      `  - ${finding.package}: ${finding.vulnerability} (${finding.severity})\n`,
    );
  }
  process.exit(1);
}

main();
