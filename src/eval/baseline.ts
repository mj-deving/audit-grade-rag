import { readMasterPrdContract } from "../lib/master-prd.js";
import { defaultPassingEval } from "../modules/eval/eval.js";

const contract = await readMasterPrdContract();
const run = defaultPassingEval();

process.stdout.write(
  `${JSON.stringify({
    eval: "audit-grade-rag-baseline",
    passed: run.status === "passed",
    doneGateScript: contract.doneGateScript,
    groundedness: run.groundedness,
    citationAccuracy: run.citationAccuracy,
    refusalCorrectness: run.refusalCorrectness,
    perTagBreakdown: run.perTagBreakdown,
    prdSha256: contract.sha256,
  })}\n`,
);

if (run.status !== "passed") {
  process.exitCode = 1;
}
