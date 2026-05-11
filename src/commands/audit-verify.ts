import process from "node:process";
import { verifySqliteLedger } from "../modules/audit/ledger.js";
import { requireFlag, writeJson } from "./args.js";

const ledgerPath = requireFlag(process.argv.slice(2), "--ledger");
const result = verifySqliteLedger(ledgerPath);

writeJson(result);
process.exitCode = result.ok ? 0 : 1;
