import { createServer } from "node:http";
import process from "node:process";
import { createReferenceApp } from "../app/reference-app.js";
import { defaultPassingEval } from "../modules/eval/eval.js";
import { generateArticle50Report } from "../modules/report/report.js";
import { renderAuthOperator, renderConsole, renderReportView } from "../modules/ui/console.js";

const app = createReferenceApp();
await app.ingest.ingest({ corpusDir: "examples/demo-corpus" });
const session = app.bootstrapOperator("operator@example.local");
const query = app.query(session.id, "beantwortete Anfrage Audit-Zeile");
const report = await generateArticle50Report(
  app.ledger,
  { format: "eu-ai-act-50", since: "2026-05-10T00:00:00.000Z", until: "2026-05-10T23:59:59.999Z" },
  defaultPassingEval(),
);

const server = createServer((request, response) => {
  const path = request.url ?? "/";
  const view = path.startsWith("/auth/operator")
    ? renderAuthOperator()
    : path.startsWith("/console/reports")
      ? renderReportView(report)
      : renderConsole(query);
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": view.csp,
  });
  response.end(view.html);
});

const env: { readonly PORT?: string } = process.env;
const port = Number(env.PORT ?? "3000");
server.listen(port, () => {
  process.stdout.write(
    `audit-grade-rag dev server listening on http://127.0.0.1:${String(port)}\n`,
  );
});
