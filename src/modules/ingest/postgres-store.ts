import { Pool, type PoolClient } from "pg";
import type { CorpusChunk, CorpusSnapshot } from "../../domain/types.js";
import { sha256Hex, stableId } from "../../lib/hash.js";
import type { Clock } from "../../lib/time.js";
import { systemClock } from "../../lib/time.js";
import type { AuditLedger } from "../audit/ledger.js";
import {
  type EmbeddingProvider,
  estimateHnswIndexBytes,
  pgVectorLiteral,
  requireConfiguredEmbeddingProvider,
} from "./embedding.js";
import type { IngestOptions, IngestResult, Revision } from "./ingest.js";
import { chunkRevision, readCorpusRevisions } from "./ingest.js";

type DocumentHashRow = {
  readonly source_path: string;
  readonly content_sha256: string;
};

type SnapshotRow = {
  readonly id: string;
  readonly sequence: number;
  readonly snapshot_hash: string;
  readonly embedding_model_version: string;
  readonly chunker_version: string;
  readonly status: CorpusSnapshot["status"];
};

const chunkerVersion = "chunker-800-100-v1";

export type PostgresIngestionStoreOptions = {
  readonly databaseUrl?: string;
  readonly pool?: Pool;
  readonly ledger: AuditLedger;
  readonly embeddingProvider?: EmbeddingProvider;
  readonly clock?: Clock;
};

export class PostgresIngestionStore {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;
  private readonly embeddingProvider: EmbeddingProvider;
  private schemaReady = false;

  constructor(private readonly options: PostgresIngestionStoreOptions) {
    this.pool = options.pool ?? new Pool({ connectionString: options.databaseUrl });
    this.ownsPool = options.pool === undefined;
    this.embeddingProvider = options.embeddingProvider ?? requireConfiguredEmbeddingProvider();
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async ingest(options: IngestOptions): Promise<IngestResult> {
    await this.ensureSchema();
    const revisions = await readCorpusRevisions(options);
    const snapshotId = await this.nextSnapshotId(revisions);
    const chunks = createChunks(revisions, snapshotId, options);
    const warnings = revisions.flatMap((revision) => revision.warnings);
    const changed = await this.changedRevisions(revisions);
    if (options.dryRun === true) {
      return result(
        true,
        revisions,
        changed,
        chunks,
        warnings,
        null,
        false,
        this.embeddingProvider,
      );
    }
    if (changed.length === 0) {
      return result(
        false,
        revisions,
        changed,
        [],
        warnings,
        await this.activeSnapshot(),
        false,
        this.embeddingProvider,
      );
    }
    return this.writeSnapshot(
      revisions,
      changed,
      chunks,
      warnings,
      options.failAfterExtract === true,
    );
  }

  async activeSnapshot(): Promise<CorpusSnapshot | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<SnapshotRow>(
      `SELECT id, sequence, snapshot_hash, embedding_model_version, chunker_version, status
       FROM corpus_snapshots
       WHERE status = 'active'
       ORDER BY sequence DESC
       LIMIT 1`,
    );
    return rows[0] === undefined ? null : snapshotFromRow(rows[0]);
  }

  async chunksForSnapshot(snapshotId: string): Promise<readonly CorpusChunk[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.query<CorpusChunkRow>(
      `SELECT chunk_id, doc_id, source_document_id, source_type, source_path, page_start,
              page_end, char_start, char_end, token_start, token_end, chunk_index,
              chunk_text, chunk_sha256, corpus_snapshot_id, corpus_snapshot_hash,
              extraction_warnings, ocr_used
       FROM corpus_chunks
       WHERE corpus_snapshot_id = $1
       ORDER BY doc_id, chunk_index`,
      [snapshotId],
    );
    return rows.map(chunkFromRow);
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) {
      return;
    }
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;

      CREATE TABLE IF NOT EXISTS corpus_snapshots (
        id text PRIMARY KEY,
        sequence integer NOT NULL UNIQUE,
        snapshot_hash text NOT NULL,
        embedding_model_version text NOT NULL,
        chunker_version text NOT NULL,
        status text NOT NULL CHECK (status IN ('building', 'active', 'retired', 'failed')),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS corpus_documents (
        corpus_snapshot_id text NOT NULL REFERENCES corpus_snapshots(id),
        doc_id text NOT NULL,
        source_path text NOT NULL,
        source_type text NOT NULL,
        content_sha256 text NOT NULL,
        PRIMARY KEY (corpus_snapshot_id, doc_id)
      );

      CREATE TABLE IF NOT EXISTS corpus_chunks (
        chunk_id text PRIMARY KEY,
        doc_id text NOT NULL,
        source_document_id text NOT NULL,
        source_type text NOT NULL,
        source_path text NOT NULL,
        page integer NOT NULL,
        char_offset integer NOT NULL,
        page_start integer NOT NULL,
        page_end integer NOT NULL,
        char_start integer NOT NULL,
        char_end integer NOT NULL,
        token_start integer NOT NULL,
        token_end integer NOT NULL,
        chunk_index integer NOT NULL,
        chunk_text text NOT NULL,
        chunk_sha256 text NOT NULL,
        corpus_snapshot_id text NOT NULL REFERENCES corpus_snapshots(id),
        corpus_snapshot_hash text NOT NULL,
        extraction_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        ocr_used boolean NOT NULL,
        embedding vector(1024) NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', chunk_text)) STORED
      );

      CREATE INDEX IF NOT EXISTS corpus_chunks_snapshot_idx
        ON corpus_chunks (corpus_snapshot_id);
      CREATE INDEX IF NOT EXISTS corpus_chunks_bm25_idx
        ON corpus_chunks USING gin (search_vector);
      CREATE INDEX IF NOT EXISTS corpus_chunks_embedding_hnsw_idx
        ON corpus_chunks USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 128);
    `);
    this.schemaReady = true;
  }

  private async changedRevisions(revisions: readonly Revision[]): Promise<readonly Revision[]> {
    const hashes = await this.activeDocumentHashes();
    return revisions.filter((revision) => hashes.get(revision.path) !== revision.contentSha256);
  }

  private async activeDocumentHashes(): Promise<Map<string, string>> {
    const active = await this.activeSnapshot();
    if (active === null) {
      return new Map();
    }
    const { rows } = await this.pool.query<DocumentHashRow>(
      `SELECT source_path, content_sha256
       FROM corpus_documents
       WHERE corpus_snapshot_id = $1`,
      [active.id],
    );
    return new Map(rows.map((row) => [row.source_path, row.content_sha256]));
  }

  private async nextSnapshotId(revisions: readonly Revision[]): Promise<string> {
    const { rows } = await this.pool.query<{ readonly next_sequence: number }>(
      "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM corpus_snapshots",
    );
    return stableId("snap", [
      String(rows[0]?.next_sequence ?? 1),
      revisions.map((revision) => revision.contentSha256).join("|"),
    ]);
  }

  private async writeSnapshot(
    revisions: readonly Revision[],
    changed: readonly Revision[],
    chunks: readonly CorpusChunk[],
    warnings: readonly string[],
    failAfterExtract: boolean,
  ): Promise<IngestResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const snapshot = await insertSnapshot(
        client,
        revisions,
        chunks,
        failAfterExtract,
        this.embeddingProvider,
      );
      await insertDocuments(client, snapshot.id, revisions);
      if (!failAfterExtract) {
        await insertChunks(client, chunks, snapshot, this.embeddingProvider);
      }
      await client.query("COMMIT");
      if (!failAfterExtract) {
        this.ledgerIngestCompletion(revisions.length, chunks.length, snapshot);
      }
      return result(
        false,
        revisions,
        changed,
        chunks,
        warnings,
        snapshot,
        !failAfterExtract,
        this.embeddingProvider,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private ledgerIngestCompletion(
    documentCount: number,
    chunkCount: number,
    snapshot: CorpusSnapshot,
  ): void {
    this.options.ledger.append({
      entryType: "corpus.ingest.completed",
      outcome: "corpus-ingest-completed",
      embeddingModelVersion: this.embeddingProvider.profile.modelVersion,
      corpusSnapshotId: snapshot.id,
      corpusSnapshotHash: snapshot.snapshotHash,
      userIdHash: sha256Hex("system-ingest"),
      timestampMs: (this.options.clock ?? systemClock).now(),
      extra: { documentCount, chunkCount },
    });
  }
}

type CorpusChunkRow = {
  readonly chunk_id: string;
  readonly doc_id: string;
  readonly source_document_id: string;
  readonly source_type: CorpusChunk["sourceType"];
  readonly source_path: string;
  readonly page_start: number;
  readonly page_end: number;
  readonly char_start: number;
  readonly char_end: number;
  readonly token_start: number;
  readonly token_end: number;
  readonly chunk_index: number;
  readonly chunk_text: string;
  readonly chunk_sha256: string;
  readonly corpus_snapshot_id: string;
  readonly corpus_snapshot_hash: string;
  readonly extraction_warnings: readonly string[];
  readonly ocr_used: boolean;
};

function createChunks(
  revisions: readonly Revision[],
  snapshotId: string,
  options: IngestOptions,
): readonly CorpusChunk[] {
  return revisions.flatMap((revision) =>
    chunkRevision(revision, snapshotId, "pending", {
      window: options.chunkWindow ?? 800,
      overlap: options.chunkOverlap ?? 100,
    }),
  );
}

function result(
  dryRun: boolean,
  revisions: readonly Revision[],
  changed: readonly Revision[],
  chunks: readonly CorpusChunk[],
  warnings: readonly string[],
  snapshot: CorpusSnapshot | null,
  activated: boolean,
  embeddingProvider: EmbeddingProvider,
): IngestResult {
  return {
    dryRun,
    documentCount: revisions.length,
    changedDocumentCount: changed.length,
    chunkCount: chunks.length,
    embeddingModel: embeddingProvider.profile.modelVersion,
    estimatedIndexSizeBytes: estimateHnswIndexBytes(
      chunks.length,
      embeddingProvider.profile.dimension,
    ),
    warnings,
    snapshot,
    activated,
    noOp: !dryRun && changed.length === 0,
  };
}

async function insertSnapshot(
  client: PoolClient,
  revisions: readonly Revision[],
  chunks: readonly CorpusChunk[],
  failAfterExtract: boolean,
  embeddingProvider: EmbeddingProvider,
): Promise<CorpusSnapshot> {
  const { rows } = await client.query<{ readonly next_sequence: number }>(
    "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM corpus_snapshots",
  );
  const sequence = rows[0]?.next_sequence ?? 1;
  const baseHash = sha256Hex(revisions.map((revision) => revision.contentSha256).join("|"));
  const snapshot: CorpusSnapshot = {
    id: stableId("snap", [String(sequence), baseHash]),
    sequence,
    snapshotHash:
      chunks.length === 0 ? baseHash : sha256Hex(`${baseHash}:${String(chunks.length)}`),
    embeddingModelVersion: embeddingProvider.profile.modelVersion,
    chunkerVersion,
    status: failAfterExtract ? "failed" : "active",
  };
  await client.query(
    `INSERT INTO corpus_snapshots
       (id, sequence, snapshot_hash, embedding_model_version, chunker_version, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      snapshot.id,
      snapshot.sequence,
      snapshot.snapshotHash,
      snapshot.embeddingModelVersion,
      snapshot.chunkerVersion,
      snapshot.status,
    ],
  );
  return snapshot;
}

async function insertDocuments(
  client: PoolClient,
  snapshotId: string,
  revisions: readonly Revision[],
): Promise<void> {
  for (const revision of revisions) {
    await client.query(
      `INSERT INTO corpus_documents
         (corpus_snapshot_id, doc_id, source_path, source_type, content_sha256)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        snapshotId,
        stableId("doc", [revision.path]),
        revision.path,
        revision.sourceType,
        revision.contentSha256,
      ],
    );
  }
}

async function insertChunks(
  client: PoolClient,
  chunks: readonly CorpusChunk[],
  snapshot: CorpusSnapshot,
  embeddingProvider: EmbeddingProvider,
): Promise<void> {
  for (const chunk of chunks) {
    const embedding = await embeddingProvider.embed(chunk.chunkText);
    await client.query(
      `INSERT INTO corpus_chunks
         (chunk_id, doc_id, source_document_id, source_type, source_path, page, char_offset,
          page_start, page_end, char_start, char_end, token_start, token_end, chunk_index,
          chunk_text, chunk_sha256, corpus_snapshot_id, corpus_snapshot_hash,
          extraction_warnings, ocr_used, embedding)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19::jsonb, $20, $21::vector)`,
      [
        chunk.chunkId,
        chunk.docId,
        chunk.sourceDocumentId,
        chunk.sourceType,
        chunk.sourcePath,
        chunk.pageStart,
        chunk.charStart,
        chunk.pageStart,
        chunk.pageEnd,
        chunk.charStart,
        chunk.charEnd,
        chunk.tokenStart,
        chunk.tokenEnd,
        chunk.chunkIndex,
        chunk.chunkText,
        chunk.chunkSha256,
        snapshot.id,
        snapshot.snapshotHash,
        JSON.stringify(chunk.extractionWarnings),
        chunk.ocrUsed,
        pgVectorLiteral(embedding),
      ],
    );
  }
}

function snapshotFromRow(row: SnapshotRow): CorpusSnapshot {
  return {
    id: row.id,
    sequence: row.sequence,
    snapshotHash: row.snapshot_hash,
    embeddingModelVersion: row.embedding_model_version,
    chunkerVersion: row.chunker_version,
    status: row.status,
  };
}

function chunkFromRow(row: CorpusChunkRow): CorpusChunk {
  return {
    chunkId: row.chunk_id,
    docId: row.doc_id,
    sourceDocumentId: row.source_document_id,
    sourceType: row.source_type,
    sourcePath: row.source_path,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    charStart: row.char_start,
    charEnd: row.char_end,
    tokenStart: row.token_start,
    tokenEnd: row.token_end,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    chunkSha256: row.chunk_sha256,
    corpusSnapshotId: row.corpus_snapshot_id,
    corpusSnapshotHash: row.corpus_snapshot_hash,
    extractionWarnings: row.extraction_warnings,
    ocrUsed: row.ocr_used,
  };
}
