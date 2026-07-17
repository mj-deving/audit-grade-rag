import type { Pool } from "pg";
import type { CorpusChunk, RetrievedChunk } from "../../domain/types.js";
import {
  type EmbeddingProvider,
  pgVectorLiteral,
  requireConfiguredEmbeddingProvider,
} from "../ingest/embedding.js";
import {
  parseThreshold,
  parseTopK,
  type RetrievalOptions,
  type RetrievalTrace,
  reciprocalRankFusion,
} from "./retrieval.js";

type RetrievedChunkRow = {
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
  readonly retrieval_score: number;
};

const candidateLimit = 50;
// This path's scores are NOT the in-memory scorer's [0,1] coverage ratio, so it must not borrow that
// ceiling: `bm25CandidatesFor` selects raw `ts_rank_cd(...)` with no normalization flag, which is not
// bounded by 1, and `denseCandidates` selects `1 - (embedding <=> …)`, a pgvector cosine DISTANCE in
// [0,2] mapped to [-1,1]. A stricter cutoff above 1 can therefore be meaningful here.
// `Infinity` is honest about what is known rather than a considered bound: nobody has measured what
// these two rankers actually produce, which is precisely why the shared `0.3` default is unverified
// on this path. Do not read this as "any threshold is fine" — read it as H-14, open.
const postgresScoreCeiling = Number.POSITIVE_INFINITY;

export async function retrievePostgresChunks(
  pool: Pool,
  query: string,
  options: RetrievalOptions,
  embeddingProvider: EmbeddingProvider = requireConfiguredEmbeddingProvider(),
): Promise<RetrievalTrace> {
  const topK = parseTopK(options.topK);
  const threshold = parseThreshold(options.outOfCorpusThreshold, postgresScoreCeiling);
  const [vectorCandidates, bm25Candidates] = await Promise.all([
    denseCandidates(pool, query, options.activeSnapshotId, embeddingProvider),
    bm25CandidatesFor(pool, query, options.activeSnapshotId),
  ]);
  const mergedCandidates = reciprocalRankFusion(vectorCandidates, bm25Candidates);
  const finalChunks = mergedCandidates.slice(0, topK);
  const bestEvidenceScore = Math.max(
    0,
    ...vectorCandidates.map((chunk) => chunk.retrievalScore),
    ...bm25Candidates.map((chunk) => chunk.retrievalScore),
  );
  return {
    vectorCandidates,
    bm25Candidates,
    mergedCandidates,
    finalChunks,
    outOfCorpus: bestEvidenceScore < threshold,
  };
}

async function denseCandidates(
  pool: Pool,
  query: string,
  snapshotId: string,
  embeddingProvider: EmbeddingProvider,
): Promise<readonly RetrievedChunk[]> {
  const queryVector = pgVectorLiteral(await embeddingProvider.embed(query));
  const { rows } = await pool.query<RetrievedChunkRow>(
    `${baseChunkSelect("(1 - (embedding <=> $2::vector))")}
     WHERE corpus_snapshot_id = $1
     ORDER BY embedding <=> $2::vector ASC, chunk_id ASC
     LIMIT ${String(candidateLimit)}`,
    [snapshotId, queryVector],
  );
  return rows.map((row) => retrievedChunkFromRow(row, "dense"));
}

async function bm25CandidatesFor(
  pool: Pool,
  query: string,
  snapshotId: string,
): Promise<readonly RetrievedChunk[]> {
  const { rows } = await pool.query<RetrievedChunkRow>(
    `${baseChunkSelect("ts_rank_cd(search_vector, plainto_tsquery('simple', $2))")}
     WHERE corpus_snapshot_id = $1
     ORDER BY retrieval_score DESC, chunk_id ASC
     LIMIT ${String(candidateLimit)}`,
    [snapshotId, query],
  );
  return rows.map((row) => retrievedChunkFromRow(row, "bm25"));
}

function baseChunkSelect(scoreExpression: string): string {
  return `SELECT chunk_id, doc_id, source_document_id, source_type, source_path,
                 page_start, page_end, char_start, char_end, token_start, token_end,
                 chunk_index, chunk_text, chunk_sha256, corpus_snapshot_id,
                 corpus_snapshot_hash, extraction_warnings, ocr_used,
                 ${scoreExpression} AS retrieval_score
          FROM corpus_chunks`;
}

function retrievedChunkFromRow(row: RetrievedChunkRow, method: "dense" | "bm25"): RetrievedChunk {
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
    retrievalScore: roundScore(row.retrieval_score),
    retrievalMethod: method,
  };
}

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}
