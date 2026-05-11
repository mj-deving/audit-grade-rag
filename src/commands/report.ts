import process from "node:process";
import { createRuntimeApp } from "../app/runtime-app.js";
import { runGoldenEvaluation } from "../modules/eval/eval.js";
import { generateArticle50Report } from "../modules/report/report.js";
import { readFlag, requireFlag, writeJson } from "./args.js";

const args = process.argv.slice(2);
const format = requireFlag(args, "--format");
if (format !== "eu-ai-act-50") {
  throw new Error("Only eu-ai-act-50 is supported");
}
const since = requireFlag(args, "--since");
const until = requireFlag(args, "--until");
const sinceMs = Date.parse(since);
if (!Number.isFinite(sinceMs)) {
  throw new Error("--since must be an ISO timestamp");
}
const app = createRuntimeApp({ clock: { now: () => sinceMs + 1 } });
await app.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
const session = app.bootstrapOperator("operator@example.local");
app.query(session.id, "Welche Auditpflicht gilt?");
const bundle = await generateArticle50Report(
  app.ledger,
  {
    format,
    since,
    until,
    ...(readFlag(args, "--out") === null ? {} : { outDir: requireFlag(args, "--out") }),
  },
  await runGoldenEvaluation(),
);

writeJson({
  bundleSha256: bundle.bundleSha256,
  jsonSha256: bundle.jsonSha256,
  pdfSha256: bundle.pdfSha256,
  auditExcerptZipSha256: bundle.auditExcerptZipSha256,
  files: bundle.files ?? null,
});
