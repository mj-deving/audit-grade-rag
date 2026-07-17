import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createPostgresRuntimeApp } from "../app/runtime-app.js";
import { AuditLedger } from "./audit/ledger.js";
import { verifySqliteLedger } from "./audit/ledger-verify.js";
import { EvidenceEchoProvider } from "./generation/generation.js";
import { HashEmbeddingProvider } from "./ingest/embedding.js";
import { PostgresIngestionStore } from "./ingest/postgres-store.js";
import { replayArtifactsFromEntry, replayLedgerEntry } from "./replay/replay.js";
import { retrievePostgresChunks } from "./retrieval/postgres-retrieval.js";
import type { RetrievalTrace } from "./retrieval/retrieval.js";

const execFileAsync = promisify(execFile);

// No mocks: this test writes to Postgres 16 with the pgvector extension and inspects the real HNSW index.
it("writes versioned corpus chunks and pgvector HNSW index rows", async () => {
  const database = await postgresDatabase();
  const dir = await mkdtemp(join(tmpdir(), "agr-pg-corpus-"));
  const pool = new Pool({ connectionString: database.url });
  try {
    await runIngestAssertions(pool, dir);
  } finally {
    await pool.end();
    await rm(dir, { recursive: true, force: true });
    await database.cleanup();
  }
}, 120_000);

// No mocks: retrieval reads real Postgres tsvector and pgvector indexes from a versioned corpus.
it("runs snapshot-bound BM25 plus dense retrieval with RRF and refusal", async () => {
  const database = await postgresDatabase();
  const dir = await mkdtemp(join(tmpdir(), "agr-pg-retrieval-"));
  const pool = new Pool({ connectionString: database.url });
  try {
    await runRetrievalAssertions(pool, dir);
  } finally {
    await pool.end();
    await rm(dir, { recursive: true, force: true });
    await database.cleanup();
  }
}, 120_000);

// No mocks: production runtime persists corpus in Postgres and query audit rows in SQLite.
it("serves cited Postgres queries and keeps a verifiable ledger across runtime restart", async () => {
  const database = await postgresDatabase();
  const dir = await mkdtemp(join(tmpdir(), "agr-pg-runtime-"));
  const ledgerPath = join(dir, "audit.sqlite");
  const pool = new Pool({ connectionString: database.url });
  const embeddingProvider = new HashEmbeddingProvider();
  try {
    await writeRetrievalCorpus(dir);
    const runtime = createPostgresRuntimeApp({
      databaseUrl: database.url,
      pool,
      ledgerPath,
      embeddingProvider,
    });
    await runtime.ingest.ingest({ corpusDir: dir });
    const session = runtime.bootstrapOperator("operator@example.local");
    const result = await runtime.queryAsync(session.id, "Auditpflicht beleg alpha", 4);
    const replay = replayLedgerEntry(
      new AuditLedger(undefined, ledgerPath),
      result.ledgerEntry,
      new EvidenceEchoProvider({
        id: result.ledgerEntry.providerProfileId,
        name: result.ledgerEntry.providerProfileId,
        modelVersion: result.ledgerEntry.modelVersion,
        replayCapability: result.ledgerEntry.providerReplayCapability,
        supportsSeed: result.ledgerEntry.seed !== null,
        configHash: result.ledgerEntry.providerProfileId,
      }),
      replayArtifactsFromEntry(result.ledgerEntry),
    );
    const restarted = createPostgresRuntimeApp({
      databaseUrl: database.url,
      pool,
      ledgerPath,
      embeddingProvider,
    });
    const health = await restarted.health();

    expect(result.outcome).toBe("answered");
    expect(result.claims.flatMap((claim) => claim.citations)).not.toHaveLength(0);
    expect(
      result.retrievedChunks.every((chunk) => chunk.corpusSnapshotId === health.activeSnapshotId),
    ).toBe(true);
    expect(verifySqliteLedger(ledgerPath)).toMatchObject({ ok: true });
    expect(replay.status).toBe("passed");
    expect(health.ok).toBe(true);
    expect(health.storage).toBe("postgres");
    expect(health.ledgerEntries).toBeGreaterThanOrEqual(3);
  } finally {
    await pool.end();
    await rm(dir, { recursive: true, force: true });
    await database.cleanup();
  }
}, 120_000);

type DatabaseHandle = {
  readonly url: string;
  cleanup(): Promise<void>;
};

async function runIngestAssertions(pool: Pool, dir: string): Promise<void> {
  await writeCorpus(dir);
  const ledger = new AuditLedger();
  const embeddingProvider = new HashEmbeddingProvider();
  const store = new PostgresIngestionStore({ pool, ledger, embeddingProvider });
  const dryRun = await store.ingest({ corpusDir: dir, dryRun: true });
  const ingested = await store.ingest({ corpusDir: dir });
  const unchanged = await store.ingest({ corpusDir: dir });
  await writeFile(join(dir, "policy.md"), "Geaenderte Auditpflicht mit Snapshot-Erhalt.");
  const changed = await store.ingest({ corpusDir: dir });
  const active = await store.activeSnapshot();
  const chunks = active === null ? [] : await store.chunksForSnapshot(active.id);
  const index = await hnswIndexDefinition(pool);
  const sample = await sampleStoredChunk(pool);

  expect(dryRun).toMatchObject({ dryRun: true, documentCount: 3, activated: false });
  expect(dryRun.estimatedIndexSizeBytes).toBeGreaterThan(0);
  expect(ingested).toMatchObject({ activated: true, noOp: false });
  expect(unchanged).toMatchObject({ noOp: true });
  expect(changed.snapshot?.sequence).toBe(2);
  expect(chunks.length).toBeGreaterThan(0);
  expect(sample).toMatchObject({ page: 1, char_offset: 0 });
  expect(typeof sample?.doc_id).toBe("string");
  expect(typeof sample?.chunk_text).toBe("string");
  expect(index).toContain("USING hnsw");
  expect(index).toContain("m='16'");
  expect(index).toContain("ef_construction='128'");
  expect(ledger.entries().some((entry) => entry.entryType === "corpus.ingest.completed")).toBe(
    true,
  );
}

async function runRetrievalAssertions(pool: Pool, dir: string): Promise<void> {
  await writeRetrievalCorpus(dir);
  const embeddingProvider = new HashEmbeddingProvider();
  const store = new PostgresIngestionStore({
    pool,
    ledger: new AuditLedger(),
    embeddingProvider,
  });
  const ingested = await store.ingest({ corpusDir: dir });
  await writeFile(join(dir, "doc-00.md"), "Aktualisierte Auditpflicht ohne alte Marker.");
  const changed = await store.ingest({ corpusDir: dir });
  const firstSnapshotId = requireSnapshotId(ingested.snapshot);
  const secondSnapshotId = requireSnapshotId(changed.snapshot);
  const trace = await retrievePostgresChunks(
    pool,
    "Auditpflicht beleg alpha",
    {
      activeSnapshotId: firstSnapshotId,
    },
    embeddingProvider,
  );
  const currentTrace = await retrievePostgresChunks(
    pool,
    "Aktualisierte Auditpflicht",
    {
      activeSnapshotId: secondSnapshotId,
      topK: 6,
    },
    embeddingProvider,
  );
  const refused = await retrievePostgresChunks(
    pool,
    "zzzz yyyyy xxxx",
    {
      activeSnapshotId: secondSnapshotId,
    },
    embeddingProvider,
  );

  expect(trace.vectorCandidates).toHaveLength(50);
  expect(trace.bm25Candidates).toHaveLength(50);
  expect(trace.finalChunks).toHaveLength(8);
  expect(trace.finalChunks.every((chunk) => chunk.corpusSnapshotId === firstSnapshotId)).toBe(true);
  expect(trace.finalChunks[0]).toMatchObject({
    retrievalMethod: "rrf",
    pageStart: 1,
    charStart: 0,
  });
  // This asserted 6 — `topK` — until 2026-07-17, when the evidence filter landed on this path and it
  // became 1. The drop is the finding, not a regression: of the 58 merged candidates for this query
  // exactly one is evidence (`0.691897`); the other 57 sit at `0.259`–`0.295`, just UNDER the bar,
  // and five of them were being returned as citations because `topK` was the only thing bounding the
  // result. `topK` still bounds from above — it just is not what binds here.
  //
  // Worth reading off those numbers: the dense baseline between unrelated content is ~`0.26` and the
  // bar is `0.3`, so on this path the refusal is decided by `0.04` of headroom over the noise floor.
  // That is H-14, and it is why the bar's value on this path is luck rather than calibration.
  expect(currentTrace.finalChunks).toHaveLength(1);
  expect(currentTrace.finalChunks.length).toBeLessThanOrEqual(6);
  expect(
    currentTrace.finalChunks.every((chunk) => chunk.corpusSnapshotId === secondSnapshotId),
  ).toBe(true);
  expect(refused.outOfCorpus).toBe(true);
  assertNoSubThresholdCitation(trace, currentTrace, refused);
}

// H-15 on the served path, split out because it is its own property and the assertions above are
// about snapshot binding and topK.
//
// `refused.outOfCorpus` alone passed for months while `finalChunks` still held 8 chunks — and
// `refusedOutcome` copies those into the response and into the SIGNED LEDGER, and the operator UI
// renders them, so the system refused a question and shipped eight pieces of "evidence" for the
// refusal. Measured against this same pgvector container before the filter landed: those 8 chunks
// scored -0.026972..0.014098, every one far under the bar. Asserting the flag without asserting the
// payload is exactly what let it stand.
//
// Mutation-falsified 2026-07-17 by removing the filter from `postgres-retrieval.ts`, with the
// snapshot/topK assertions masked so this function had to catch it alone. It does:
// `a refusal must cite nothing: expected [ … ] to have a length of +0 but got 8`.
function assertNoSubThresholdCitation(
  ...traces: readonly [RetrievalTrace, RetrievalTrace, RetrievalTrace]
): void {
  const [answered, current, refused] = traces;
  expect(refused.finalChunks, "a refusal must cite nothing").toHaveLength(0);
  // The counterweight: a filter that dropped everything would satisfy the line above on every query.
  expect(answered.finalChunks.length, "an answered query must still cite").toBeGreaterThan(0);
  for (const trace of [answered, current]) {
    for (const cited of trace.finalChunks) {
      // Re-derive the cited chunk's own evidence score the way the gate does, from the ranker passes
      // rather than the post-fusion RRF value sitting in `retrievalScore`.
      const own = Math.max(
        0,
        ...[...trace.vectorCandidates, ...trace.bm25Candidates]
          .filter((candidate) => candidate.chunkId === cited.chunkId)
          .map((candidate) => candidate.retrievalScore),
      );
      expect(own, `cited ${cited.chunkId} below the evidence bar`).toBeGreaterThanOrEqual(0.3);
    }
  }
}

async function postgresDatabase(): Promise<DatabaseHandle> {
  const { DATABASE_URL, TEST_DATABASE_URL } = process.env;
  const configured = TEST_DATABASE_URL ?? DATABASE_URL;
  if (configured !== undefined) {
    return { url: configured, cleanup: () => Promise.resolve() };
  }
  const dockerConfigDir = await mkdtemp(join(tmpdir(), "agr-docker-config-"));
  await writeFile(join(dockerConfigDir, "config.json"), "{}");
  const name = `agr-pgvector-${String(process.pid)}-${String(Date.now())}`;
  await docker(
    "run",
    [
      "--rm",
      "-d",
      "--name",
      name,
      "-e",
      "POSTGRES_DB=audit_grade_rag",
      "-e",
      "POSTGRES_USER=audit_grade_rag",
      "-e",
      "POSTGRES_PASSWORD=audit_grade_rag",
      "-p",
      "127.0.0.1::5432",
      "pgvector/pgvector:pg16",
    ],
    dockerConfigDir,
  );
  const port = await dockerPort(name, dockerConfigDir);
  await waitForPostgres(name, dockerConfigDir);
  const url = `postgres://audit_grade_rag:audit_grade_rag@127.0.0.1:${port}/audit_grade_rag`;
  await waitForSql(url);
  return {
    url,
    cleanup: async () => {
      await docker("rm", ["-f", name], dockerConfigDir);
      await rm(dockerConfigDir, { recursive: true, force: true });
    },
  };
}

async function waitForSql(url: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const pool = new Pool({ connectionString: url });
    try {
      await pool.query("SELECT 1");
      await pool.end();
      return;
    } catch {
      await pool.end();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("postgres did not accept SQL connections");
}

async function docker(
  command: string,
  args: readonly string[],
  dockerConfigDir?: string,
): Promise<string> {
  const env =
    dockerConfigDir === undefined
      ? process.env
      : { ...process.env, DOCKER_CONFIG: dockerConfigDir };
  const result = await execFileAsync("docker", [command, ...args], { encoding: "utf8", env });
  return result.stdout.trim();
}

async function dockerPort(containerName: string, dockerConfigDir: string): Promise<string> {
  const output = await docker("port", [containerName, "5432/tcp"], dockerConfigDir);
  const port = output.match(/:(\d+)$/u)?.[1];
  if (port === undefined) {
    throw new Error(`could not discover postgres port for ${containerName}`);
  }
  return port;
}

async function waitForPostgres(containerName: string, dockerConfigDir: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await docker(
        "exec",
        [containerName, "pg_isready", "-U", "audit_grade_rag", "-d", "audit_grade_rag"],
        dockerConfigDir,
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`postgres container ${containerName} did not become ready`);
}

async function writeCorpus(dir: string): Promise<void> {
  await writeFile(join(dir, "policy.md"), "Jede beantwortete Anfrage braucht Auditpflicht.");
  await writeFile(join(dir, "scan.pdf"), "SCANNED-PDF OCR-REQUIRED Auditpflicht.");
  await writeFile(join(dir, "handbuch.docx"), "DOCX-FIXTURE WebAuthn ist erforderlich.");
}

async function writeRetrievalCorpus(dir: string): Promise<void> {
  for (let index = 0; index < 60; index += 1) {
    await writeFile(
      join(dir, `doc-${String(index).padStart(2, "0")}.md`),
      `Auditpflicht beleg alpha nummer ${String(index)} fuer versionierte Korpusabfrage.`,
    );
  }
}

function requireSnapshotId(snapshot: { readonly id: string } | null): string {
  if (snapshot === null) {
    throw new Error("expected snapshot");
  }
  return snapshot.id;
}

async function hnswIndexDefinition(pool: Pool): Promise<string> {
  const { rows } = await pool.query<{ readonly indexdef: string }>(
    "SELECT indexdef FROM pg_indexes WHERE indexname = 'corpus_chunks_embedding_hnsw_idx'",
  );
  return rows[0]?.indexdef ?? "";
}

async function sampleStoredChunk(pool: Pool): Promise<StoredChunkSample | null> {
  const { rows } = await pool.query<StoredChunkSample>(
    `SELECT doc_id, page, char_offset, chunk_text
     FROM corpus_chunks
     ORDER BY chunk_id
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

type StoredChunkSample = {
  readonly doc_id: string;
  readonly page: number;
  readonly char_offset: number;
  readonly chunk_text: string;
};
