import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createRuntimeApp } from "../app/runtime-app.js";
import type { CorpusChunk } from "../domain/types.js";
import {
  AuditLedger,
  readSqliteLedgerEntries,
  verifyExportedLedgerEntries,
  verifySqliteLedger,
} from "./audit/ledger.js";
import { defaultPassingEval } from "./eval/eval.js";
import { defaultPromptTemplate } from "./generation/generation.js";
import { generateArticle50Report } from "./report/report.js";

const execFileAsync = promisify(execFile);

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
  expect(run.exportVerification).toMatchObject({ ok: true });
  expect(run.tamperedVerification).toMatchObject({ ok: false, firstInvalidSequence: 1 });
  expect(run.detachedSignatureLength).toBeGreaterThan(64);
  expect(run.zipHeader).toBe("PK");
  expect(run.privateKeysIncluded).toBe(false);
  expect(run.report.report.outcomeBreakdown).toMatchObject({
    answered: 1,
    "refused-out-of-corpus": 1,
  });
  expect(run.ledgerOk).toBe(true);
});

// No mocks: the replay CLI opens a writable SQLite ledger, regenerates from ledgered evidence, and appends replay rows.
it("replays a ledgered answer through the CLI and ledgers pass and drift outcomes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agr-replay-"));
  try {
    const ledgerPath = join(dir, "audit.sqlite");
    const entry = seedReplayLedger(ledgerPath);
    const pass = await runAuditReplay([ledgerPath, entry.id]);
    expect(pass.exitCode).toBe(0);
    expect(pass.json).toMatchObject({ status: "passed", byteEqual: true });

    const drift = await runAuditReplay([ledgerPath, entry.id, "--prompt-hash", "changed"]);
    expect(drift.exitCode).toBe(2);
    expect(drift.json).toMatchObject({
      status: "drift",
      driftArtifact: "prompt",
      error: { name: "ReplayDriftError", artifact: "prompt" },
    });

    const rows = readSqliteLedgerEntries(ledgerPath);
    expect(rows.map((row) => row.outcome)).toEqual(["answered", "replay-success", "replay-drift"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function runWorkflow() {
  const dir = await mkdtemp(join(tmpdir(), "agr-"));
  try {
    await writeCorpus(dir);
    const app = createRuntimeApp();
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

function runQueries(app: ReturnType<typeof createRuntimeApp>) {
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

async function exportLedger(app: ReturnType<typeof createRuntimeApp>, dir: string) {
  const exportDir = join(dir, "export");
  const exported = await app.ledger.exportSealed(exportDir, 0, Date.now() + 1000);
  const tamperedPath = join(dir, "tampered.sqlite");
  await copyFile(exported.ledgerPath, tamperedPath);
  await flipOneByte(tamperedPath);
  const signature = await readFile(exported.signaturePath, "utf8");
  const zipBytes = await readFile(exported.zipPath);
  return {
    exportedRows: readSqliteLedgerEntries(exported.ledgerPath),
    exportVerification: verifySqliteLedger(exported.ledgerPath),
    tamperedVerification: verifySqliteLedger(tamperedPath),
    detachedSignatureLength: signature.trim().length,
    zipHeader: zipBytes.subarray(0, 2).toString("utf8"),
    privateKeysIncluded: exported.manifest.privateKeysIncluded,
  };
}

async function flipOneByte(path: string): Promise<void> {
  const bytes = await readFile(path);
  const index = Math.floor(bytes.length / 2);
  bytes[index] = (bytes[index] ?? 0) ^ 1;
  await writeFile(path, bytes);
}

async function reportLedger(app: ReturnType<typeof createRuntimeApp>) {
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

function seedReplayLedger(ledgerPath: string) {
  const ledger = new AuditLedger(undefined, ledgerPath);
  return ledger.append({
    entryType: "query.answered",
    outcome: "answered",
    queryText: "Welche Auditpflicht gilt?",
    retrievedChunks: [
      {
        chunkId: "chunk_a",
        docId: "doc_a",
        sourceDocumentId: "src_a",
        sourceType: "markdown",
        sourcePath: "/corpus/a.md",
        pageStart: 1,
        pageEnd: 1,
        charStart: 0,
        charEnd: 48,
        tokenStart: 0,
        tokenEnd: 8,
        chunkIndex: 0,
        chunkText: "Auditpflicht gilt fuer jede beantwortete Anfrage.",
        chunkSha256: "sha_a",
        corpusSnapshotId: "snap_a",
        corpusSnapshotHash: "hash_a",
        extractionWarnings: [],
        ocrUsed: false,
        retrievalScore: 1,
        retrievalMethod: "rrf",
      },
    ],
    generatedAnswer: "CLAIM: Die Antwort ist durch den Korpus belegt. [chunk:chunk_a]",
    claimCitations: [{ claimIndex: 0, chunkId: "chunk_a", marker: "[chunk:chunk_a]" }],
    modelVersion: "stub-llm@1.0.0",
    promptVersion: "1.0.0",
    embeddingModelVersion: "bge-m3@local-1024-v1",
    providerProfileId: "stub-llm",
    providerReplayCapability: "bit_equal",
    seed: 42,
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
    promptHash: defaultPromptTemplate.sha256,
    userIdHash: "user_hash",
  });
}

async function runAuditReplay(args: readonly string[]): Promise<{
  readonly exitCode: number;
  readonly json: Record<string, unknown>;
}> {
  try {
    const result = await execFileAsync("pnpm", ["--silent", "audit:replay", ...args], {
      cwd: process.cwd(),
    });
    return { exitCode: 0, json: JSON.parse(result.stdout) as Record<string, unknown> };
  } catch (error) {
    if (isExecError(error)) {
      return {
        exitCode: error.code ?? 1,
        json: JSON.parse(error.stdout) as Record<string, unknown>,
      };
    }
    throw error;
  }
}

function isExecError(error: unknown): error is {
  readonly code?: number;
  readonly stdout: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "stdout" in error &&
    typeof (error as { readonly stdout?: unknown }).stdout === "string"
  );
}

function firstChunk(chunks: readonly CorpusChunk[]): CorpusChunk {
  const chunk = chunks[0];
  if (chunk === undefined) {
    throw new Error("expected ingested chunk");
  }
  return chunk;
}
