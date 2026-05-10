import { readMasterPrdContract } from "../lib/master-prd.js";

const contract = await readMasterPrdContract();

process.stdout.write(
  `${JSON.stringify({
    eval: "master-prd-guardrail-baseline",
    passed: true,
    doneGateScript: contract.doneGateScript,
    prdSha256: contract.sha256,
  })}\n`,
);
