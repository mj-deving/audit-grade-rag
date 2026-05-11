import process from "node:process";
import { AuditLedger } from "../modules/audit/ledger.js";
import { requireFlag, writeJson } from "./args.js";

const args = process.argv.slice(2);
const outDir = requireFlag(args, "--out");
const since = Date.parse(requireFlag(args, "--since"));
const until = Date.parse(requireFlag(args, "--until"));
const ledger = new AuditLedger();

ledger.append({
  entryType: "query.answered",
  outcome: "answered",
  queryText: "audit export smoke query",
  generatedAnswer: "Audit export smoke answer",
  userIdHash: "operator-smoke-user",
  timestampMs: since + 1,
});

writeJson(await ledger.exportSealed(outDir, since, until));
