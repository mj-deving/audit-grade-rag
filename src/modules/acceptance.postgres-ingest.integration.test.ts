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
  // Still `topK`, and deliberately so. A per-chunk evidence filter briefly landed here on 2026-07-17
  // and took this to 1, which looked like the H-15 fix working: of the 58 merged candidates exactly
  // one clears `0.3` (`0.691897`), the other 57 sit at `0.259`–`0.295`. But on this path that filter
  // reads `max(dense, ts_rank_cd)`, and ts_rank_cd never exceeds `0.1`, so it cannot select evidence
  // — it deletes the lexical ranker, dropping an exact legal-text match with mediocre dense
  // similarity even when RRF ranks it first. It was reverted. See H-14: the bar is calibrated for a
  // scale this path does not use, and the dense baseline between unrelated content (~`0.26`) sits
  // `0.04` under it, so its placement here is luck, not calibration.
  expect(currentTrace.finalChunks).toHaveLength(6);
  expect(
    currentTrace.finalChunks.every((chunk) => chunk.corpusSnapshotId === secondSnapshotId),
  ).toBe(true);
  expect(refused.outOfCorpus).toBe(true);
  assertRefusalCitesNothing(trace, refused);
  assertH14ScaleMismatch({
    all: [trace, currentTrace, refused],
    scaleProbe: currentTrace,
    refused,
  });
}

// H-14, pinned rather than described. These four numbers are the entire argument for why the shared
// `0.3` bar is meaningless on this path, and they are quoted in `docs/HARDENING.md` — so they get
// assertions, not a comment. (They had a comment until 2026-07-17. Applying ISC-23's probe to my own
// work found them: a figure appearing in a test FILE is not a figure a test COMPUTES.)
//
// If any of these move, H-14's write-up is out of date and this fails, which is the intended
// coupling: the item stays open until the scales are normalized, and its evidence stays true until
// then.
function assertH14ScaleMismatch(probes: {
  readonly all: readonly RetrievalTrace[];
  readonly scaleProbe: RetrievalTrace;
  readonly refused: RetrievalTrace;
}): void {
  // EVERY probe, because that is the word H-14 uses. The first version of this helper took two of
  // the three traces while the docs said "across every probe, answered and refused alike" — a claim
  // quantified over a set the assertion did not cover. Caught by autoreview: the series-vs-endpoint
  // hole in yet another disguise. Assert over the same set you quantify over.
  const lexical = probes.all.flatMap((trace) =>
    trace.bm25Candidates.map((chunk) => chunk.retrievalScore),
  );
  // The finding: ts_rank_cd tops out at 0.1 against a 0.3 bar, so the lexical ranker can NEVER open
  // the gate or clear a citation filter. The served refusal is decided by the dense score alone.
  expect(Math.max(...lexical), "ts_rank_cd cannot reach the evidence bar").toBeLessThan(0.3);
  expect(round6(Math.max(...lexical))).toBe(0.1);
  // `scaleProbe` is named rather than positional because the docs' dense figures come from ONE
  // specific query ("Aktualisierte Auditpflicht"), and the first version of this took whichever
  // trace happened to be first. Tightening `toBeCloseTo(…, 5)` to an exact 6dp compare is what
  // exposed that: it failed with "expected 0.691868 to be 0.691897" — a different probe's number,
  // silently accepted by the looser assertion.
  const dense = probes.scaleProbe.vectorCandidates.map((chunk) => chunk.retrievalScore);
  // One genuinely relevant chunk, far above the bar; everything else clustered just under it. The
  // separation is real, but 0.3 sits only ~0.04 above the noise floor, and that placement is luck:
  // the bar was tuned for the in-memory scorer, which is not this.
  //
  // Each figure at the precision the docs PUBLISH it, which is the whole of ISC-24 and cuts both
  // ways. `HARDENING.md` quotes the peak as `0.691897`, so that is exact to 6dp: `toBeCloseTo(…, 5)`
  // would let it drift to `0.691901` and stay green, leaving the doc stale with a passing test.
  //
  // The floor it publishes only as "~`0.26`", never as `0.259852` — so pinning six digits there
  // guards nothing and fails CI on harmless movement. The first version of this did exactly that,
  // over-correcting the P2 above it by one turn of the same screw. Same rule, other direction:
  // assert at the precision the claim makes, not looser AND not tighter.
  expect(round6(Math.max(...dense))).toBe(0.691897);
  expect(Math.min(...dense), "the dense noise floor sits at ~0.26").toBeCloseTo(0.26, 2);
  // …and the claim that figure serves: the bar has ~0.04 of headroom over the noise, which is why
  // its placement on this path is luck rather than calibration.
  expect(0.3 - Math.min(...dense), "the bar's headroom over the noise floor").toBeLessThan(0.05);
  // pgvector's `<=>` is a cosine DISTANCE in [0,2], so `1 - (…)` lands in [-1,1] and goes negative.
  // The sign is the property; the value is what the docs quote, so both are asserted.
  const refusedDenseFloor = Math.min(
    ...probes.refused.vectorCandidates.map((chunk) => chunk.retrievalScore),
  );
  expect(refusedDenseFloor, "the dense score is not bounded below by 0").toBeLessThan(0);
  expect(round6(refusedDenseFloor)).toBe(-0.026972);
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

// H-15 on the served path, the half of it that is provable on any score scale: if the system says no
// evidence exists, it must not hand back evidence.
//
// `refused.outOfCorpus` alone passed for months while `finalChunks` still held 8 chunks — and
// `refusedOutcome` copies those into the response and into the SIGNED LEDGER, and the operator UI
// renders them, so the system refused a question and shipped eight pieces of "evidence" for the
// refusal. Measured against this same pgvector container before the fix: those 8 chunks scored
// -0.026972..0.014098, every one far under the bar. Asserting the flag without asserting the payload
// is exactly what let it stand.
//
// The OTHER half of H-15 — no sub-threshold chunk cited on an ANSWERED query — is not asserted here,
// and its absence is deliberate rather than an oversight. It holds on the in-memory path, where the
// bar and the scores are the same scale. Here they are not (H-14: ts_rank_cd tops out at 0.1 against
// a 0.3 bar), so asserting it would pin the very behaviour that made the first fix wrong: dropping
// every lexical-only match from the citations. That assertion belongs here the day H-14 closes.
//
// Mutation-falsified 2026-07-17 by removing the refusal-emptying from `postgres-retrieval.ts`, with
// the snapshot/topK assertions masked so this function had to catch it alone. It does:
// `a refusal must cite nothing: expected [ … ] to have a length of +0 but got 8`.
function assertRefusalCitesNothing(...traces: readonly [RetrievalTrace, RetrievalTrace]): void {
  const [answered, refused] = traces;
  expect(refused.finalChunks, "a refusal must cite nothing").toHaveLength(0);
  // The counterweight: emptying `finalChunks` unconditionally would satisfy the line above.
  expect(answered.finalChunks.length, "an answered query must still cite").toBeGreaterThan(0);
  expect(answered.outOfCorpus, "…and must not be refused in the first place").toBe(false);
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
