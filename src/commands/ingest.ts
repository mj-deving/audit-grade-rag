import process from "node:process";
import { createRuntimeApp } from "../app/runtime-app.js";
import { hasFlag, requireFlag, writeJson } from "./args.js";

const args = process.argv.slice(2);
const corpusDir = requireFlag(args, "--corpus");
const snapshotName = args.includes("--snapshot-name") ? requireFlag(args, "--snapshot-name") : null;
const app = createRuntimeApp();
const result = await app.ingest.ingest({
  corpusDir,
  dryRun: hasFlag(args, "--dry-run"),
  ...(snapshotName === null ? {} : { snapshotName }),
});

writeJson(result);
