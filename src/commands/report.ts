import process from "node:process";
import { createReferenceApp } from "../app/reference-app.js";
import { defaultPassingEval } from "../modules/eval/eval.js";
import { generateArticle50Report } from "../modules/report/report.js";
import { readFlag, requireFlag, writeJson } from "./args.js";

const args = process.argv.slice(2);
const format = requireFlag(args, "--format");
if (format !== "eu-ai-act-50") {
  throw new Error("Only eu-ai-act-50 is supported");
}
const app = createReferenceApp();
await app.ingest.ingest({ corpusDir: "examples/demo-corpus" });
const session = app.bootstrapOperator("operator@example.local");
app.query(session.id, "Welche Auditpflicht gilt?");
const bundle = await generateArticle50Report(
  app.ledger,
  {
    format,
    since: requireFlag(args, "--since"),
    until: requireFlag(args, "--until"),
    ...(readFlag(args, "--out") === null ? {} : { outDir: requireFlag(args, "--out") }),
  },
  defaultPassingEval(),
);

writeJson({
  bundleSha256: bundle.bundleSha256,
  jsonSha256: bundle.jsonSha256,
  pdfSha256: bundle.pdfSha256,
  auditExcerptZipSha256: bundle.auditExcerptZipSha256,
  files: bundle.files ?? null,
});
