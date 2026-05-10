import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createReferenceApp } from "../app/reference-app.js";
import type { CorpusChunk } from "../domain/types.js";
import { verifyExportedLedgerEntries } from "./audit/ledger.js";
import { defaultPassingEval } from "./eval/eval.js";
import { generateArticle50Report } from "./report/report.js";

// No mocks: the workflow uses real temp files, ingestion, auth, query, ledger export, report, and verification.
it("ingests fixtures, answers with citations, refuses outside corpus, exports, reports, and verifies", async () => {
  const run = await runWorkflow();

  expect(run.dryRun).toMatchObject({ dryRun: true, documentCount: 4, activated: false });
  expect(run.ingested).toMatchObject({ activated: true, noOp: false });
  expect(run.unchanged).toMatchObject({ noOp: true });
  expect(run.changed.snapshot?.sequence).toBe(2);
  expect(run.failed.activated).toBe(false);
  expect(run.failedSnapshotRecorded).toBe(true);
  expect(run.ingested.warnings).toEqual(
    expect.arrayContaining(["ocr-used", "hidden-text-warning"]),
  );
  assertChunkShape(run.firstChunk);
  expect(run.answered.outcome).toBe("answered");
  expect(run.firstCitationChunkId).toBe(run.firstRetrievedChunkId);
  expect(run.refused.outcome).toBe("refused-out-of-corpus");
  expect(verifyExportedLedgerEntries(run.exportedRows)).toMatchObject({ ok: true });
  expect(run.privateKeysIncluded).toBe(false);
  expect(run.report.report.outcomeBreakdown).toMatchObject({
    answered: 1,
    "refused-out-of-corpus": 1,
  });
  expect(run.ledgerOk).toBe(true);
});

async function runWorkflow() {
  const dir = await mkdtemp(join(tmpdir(), "agr-"));
  try {
    await writeCorpus(dir);
    const app = createReferenceApp();
    const dryRun = await app.ingest.ingest({ corpusDir: dir, dryRun: true });
    const ingested = await app.ingest.ingest({ corpusDir: dir });
    const unchanged = await app.ingest.ingest({ corpusDir: dir });
    await writeFile(
      join(dir, "policy.md"),
      "Jede beantwortete Anfrage braucht eine Audit-Zeile und Replay.",
    );
    const changed = await app.ingest.ingest({ corpusDir: dir });
    await writeFile(
      join(dir, "doc.docx"),
      "DOCX-FIXTURE WebAuthn ist erforderlich. Mutation fuer Fehlerfall.",
    );
    const failed = await app.ingest.ingest({ corpusDir: dir, failAfterExtract: true });
    const queryResults = runQueries(app);
    const exported = await exportLedger(app, dir);
    const report = await reportLedger(app);
    return {
      dryRun,
      ingested,
      unchanged,
      changed,
      failed,
      failedSnapshotRecorded: app.ingest
        .allSnapshots()
        .some((snapshot) => snapshot.status === "failed"),
      firstChunk: firstChunk(app.ingest.allChunks()),
      ...queryResults,
      ...exported,
      report,
      ledgerOk: app.ledger.verifyRows().ok,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeCorpus(dir: string): Promise<void> {
  await writeFile(join(dir, "policy.md"), "Jede beantwortete Anfrage braucht eine Audit-Zeile.");
  await writeFile(join(dir, "scan.pdf"), "SCANNED-PDF OCR-REQUIRED Auditpflicht.");
  await writeFile(join(dir, "doc.docx"), "DOCX-FIXTURE WebAuthn ist erforderlich.");
  await writeFile(join(dir, "hidden.md"), "hidden-text darf die Validierung nicht umgehen.");
}

function runQueries(app: ReturnType<typeof createReferenceApp>) {
  const session = app.bootstrapOperator("operator@example.local");
  const answered = app.query(session.id, "beantwortete Anfrage Audit-Zeile", 8);
  const refused = app.query(session.id, "zzzz yyyyy xxxx", 8);
  return {
    answered,
    refused,
    firstCitationChunkId: answered.claims[0]?.citations[0]?.chunkId,
    firstRetrievedChunkId: answered.retrievedChunks[0]?.chunkId,
  };
}

async function exportLedger(app: ReturnType<typeof createReferenceApp>, dir: string) {
  const exportDir = join(dir, "export");
  const exported = await app.ledger.exportSealed(exportDir, 0, Date.now() + 1000);
  return {
    exportedRows: parseJsonl(await readFile(exported.ledgerPath, "utf8")),
    privateKeysIncluded: exported.manifest.privateKeysIncluded,
  };
}

async function reportLedger(app: ReturnType<typeof createReferenceApp>) {
  return generateArticle50Report(
    app.ledger,
    {
      format: "eu-ai-act-50",
      since: "1970-01-01T00:00:00.000Z",
      until: "2099-01-01T00:00:00.000Z",
    },
    defaultPassingEval(),
  );
}

function assertChunkShape(chunk: CorpusChunk): void {
  expect(typeof chunk.docId).toBe("string");
  expect(chunk.pageStart).toBe(1);
  expect(typeof chunk.charStart).toBe("number");
  expect(typeof chunk.chunkText).toBe("string");
  expect(typeof chunk.chunkSha256).toBe("string");
}

function firstChunk(chunks: readonly CorpusChunk[]): CorpusChunk {
  const chunk = chunks[0];
  if (chunk === undefined) {
    throw new Error("expected ingested chunk");
  }
  return chunk;
}

function parseJsonl(text: string): readonly unknown[] {
  return text
    .trim()
    .split(/\n/u)
    .map((line) => JSON.parse(line) as unknown);
}
