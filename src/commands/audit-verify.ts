import { readFile } from "node:fs/promises";
import process from "node:process";
import { verifyExportedLedgerEntries } from "../modules/audit/ledger.js";
import { requireFlag, writeJson } from "./args.js";

const ledgerPath = requireFlag(process.argv.slice(2), "--ledger");
const rows = (await readFile(ledgerPath, "utf8"))
  .split(/\r?\n/u)
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as unknown);
const result = verifyExportedLedgerEntries(rows);

writeJson(result);
process.exitCode = result.ok ? 0 : 1;
