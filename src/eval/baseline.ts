import { readFlag } from "../commands/args.js";
import { readMasterPrdContract } from "../lib/master-prd.js";
import { runGoldenEvaluation } from "../modules/eval/eval.js";

const args = process.argv.slice(2);
const goldenPath = readFlag(args, "--golden");
const corpusDir = readFlag(args, "--corpus");
const contract = await readMasterPrdContract();
const run = await runGoldenEvaluation({
  ...(goldenPath === null ? {} : { goldenPath }),
  ...(corpusDir === null ? {} : { corpusDir }),
});

process.stdout.write(
  `${JSON.stringify({
    eval: "audit-grade-rag-baseline",
    passed: run.status === "passed",
    doneGateScript: contract.doneGateScript,
    caseCount: run.caseCount,
    pinnedTuple: run.pinnedTuple,
    thresholds: run.thresholds,
    groundedness: run.groundedness,
    "citation-accuracy": run.citationAccuracy,
    "refusal-correctness": run.refusalCorrectness,
    perTagBreakdown: run.perTagBreakdown,
    prdSha256: contract.sha256,
  })}\n`,
);

if (run.status !== "passed") {
  process.exitCode = 1;
}
