import process from "node:process";
import { startActiveObservation } from "@langfuse/tracing";
import { langfuseSpanProcessor } from "../../instrumentation.js";
import { createRuntimeApp } from "../app/runtime-app.js";

async function main(): Promise<void> {
  const app = createRuntimeApp({ clock: { now: () => Date.parse("2026-05-10T12:00:00.000Z") } });
  await app.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
  const session = app.bootstrapOperator("operator@example.local");
  startActiveObservation("trace-probe", () => {
    app.query(session.id, "beantwortete Anfrage Audit-Zeile");
  });
  await langfuseSpanProcessor.forceFlush();
  process.stdout.write("trace:probe ok, query trace flushed to Langfuse\n");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
