import process from "node:process";
import { createRuntimeApp } from "../app/runtime-app.js";
import { AuditLedger } from "../modules/audit/ledger.js";
import type { IngestOptions } from "../modules/ingest/ingest.js";
import { PostgresIngestionStore } from "../modules/ingest/postgres-store.js";
import { hasFlag, requireFlag, writeJson } from "./args.js";

const args = process.argv.slice(2);
const corpusDir = requireFlag(args, "--corpus");
const snapshotName = args.includes("--snapshot-name") ? requireFlag(args, "--snapshot-name") : null;
const ingestOptions = {
  corpusDir,
  dryRun: hasFlag(args, "--dry-run"),
  ...(snapshotName === null ? {} : { snapshotName }),
};
const { DATABASE_URL: databaseUrl } = process.env;
const result =
  databaseUrl === undefined
    ? await createRuntimeApp().ingest.ingest(ingestOptions)
    : await ingestPostgres(databaseUrl, ingestOptions);

writeJson(result);

async function ingestPostgres(databaseUrl: string, ingestOptions: IngestOptions) {
  const store = new PostgresIngestionStore({ databaseUrl, ledger: new AuditLedger() });
  try {
    return await store.ingest(ingestOptions);
  } finally {
    await store.close();
  }
}
