import { readFile } from "node:fs/promises";
import process from "node:process";
import { inspectMasterPrd } from "./lib/master-prd.js";

const prdPath = process.argv[2] ?? "docs/MASTER_PRD.md";
const content = await readFile(prdPath, "utf8");
const contract = inspectMasterPrd(content);

process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
