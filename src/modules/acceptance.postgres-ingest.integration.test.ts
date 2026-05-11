import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { AuditLedger } from "./audit/ledger.js";
import { PostgresIngestionStore } from "./ingest/postgres-store.js";
import { retrievePostgresChunks } from "./retrieval/postgres-retrieval.js";

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

type DatabaseHandle = {
  readonly url: string;
  cleanup(): Promise<void>;
};

async function runIngestAssertions(pool: Pool, dir: string): Promise<void> {
  await writeCorpus(dir);
  const ledger = new AuditLedger();
  const store = new PostgresIngestionStore({ pool, ledger });
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
  const store = new PostgresIngestionStore({ pool, ledger: new AuditLedger() });
  const ingested = await store.ingest({ corpusDir: dir });
  await writeFile(join(dir, "doc-00.md"), "Aktualisierte Auditpflicht ohne alte Marker.");
  const changed = await store.ingest({ corpusDir: dir });
  const firstSnapshotId = requireSnapshotId(ingested.snapshot);
  const secondSnapshotId = requireSnapshotId(changed.snapshot);
  const trace = await retrievePostgresChunks(pool, "Auditpflicht beleg alpha", {
    activeSnapshotId: firstSnapshotId,
  });
  const currentTrace = await retrievePostgresChunks(pool, "Aktualisierte Auditpflicht", {
    activeSnapshotId: secondSnapshotId,
    topK: 6,
  });
  const refused = await retrievePostgresChunks(pool, "zzzz yyyyy xxxx", {
    activeSnapshotId: secondSnapshotId,
  });

  expect(trace.vectorCandidates).toHaveLength(50);
  expect(trace.bm25Candidates).toHaveLength(50);
  expect(trace.finalChunks).toHaveLength(8);
  expect(trace.finalChunks.every((chunk) => chunk.corpusSnapshotId === firstSnapshotId)).toBe(true);
  expect(trace.finalChunks[0]).toMatchObject({
    retrievalMethod: "rrf",
    pageStart: 1,
    charStart: 0,
  });
  expect(currentTrace.finalChunks).toHaveLength(6);
  expect(
    currentTrace.finalChunks.every((chunk) => chunk.corpusSnapshotId === secondSnapshotId),
  ).toBe(true);
  expect(refused.outOfCorpus).toBe(true);
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
