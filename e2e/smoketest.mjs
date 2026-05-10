import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const { stdout } = await execFileAsync(process.execPath, ["dist/src/cli.js", "docs/MASTER_PRD.md"]);
const result = JSON.parse(stdout);

if (
  result.status !== "FROZEN" ||
  result.project !== "audit-grade-rag" ||
  result.guardrailStatus !== "Bootstrapped" ||
  result.goalStatus !== "Not launched" ||
  result.doneGateScript !== "pnpm check:full"
) {
  throw new Error(`Built CLI contract smoke test failed: ${stdout}`);
}

process.stdout.write(
  `${JSON.stringify({
    e2e: "built-cli-master-prd-contract",
    passed: true,
    prdSha256: result.sha256,
  })}\n`,
);
