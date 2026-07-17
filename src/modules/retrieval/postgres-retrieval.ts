import type { Pool } from "pg";
import type { CorpusChunk, RetrievedChunk } from "../../domain/types.js";
import {
  type EmbeddingProvider,
  pgVectorLiteral,
  requireConfiguredEmbeddingProvider,
} from "../ingest/embedding.js";
import {
  evidenceThreshold,
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

export async function retrievePostgresChunks(
  pool: Pool,
  query: string,
  options: RetrievalOptions,
  embeddingProvider: EmbeddingProvider = requireConfiguredEmbeddingProvider(),
): Promise<RetrievalTrace> {
  const topK = parseTopK(options.topK);
  const [vectorCandidates, bm25Candidates] = await Promise.all([
    denseCandidates(pool, query, options.activeSnapshotId, embeddingProvider),
    bm25CandidatesFor(pool, query, options.activeSnapshotId),
  ]);
  const mergedCandidates = reciprocalRankFusion(vectorCandidates, bm25Candidates);
  // H-15 is closed on the in-memory path only. There, a chunk below the evidence bar cannot be cited;
  // here `finalChunks` is topK of the fusion regardless of any chunk's own score, so this path can
  // still refuse a query and hand back chunks at the same time. The filter is not copied across on
  // the reasoning that it would be untested: this path needs a live Postgres and pgvector, nothing in
  // CI exercises it, and an unverified filter against the scale problem below is a guess wearing a
  // fix's clothes. Tracked as H-15/Postgres, open.
  const finalChunks = mergedCandidates.slice(0, topK);
  // `Math.max(0, …)` seeds the max at zero, which matters here and not in memory: `denseCandidates`
  // selects `1 - (embedding <=> $2::vector)`, and pgvector's `<=>` is a cosine DISTANCE in [0,2], so
  // this expression lands in [-1,1] and CAN be negative. A corpus whose every chunk opposes the query
  // therefore reports a best evidence score of 0 rather than something negative. That is the refusing
  // direction, so it is safe, but the negative candidates it hides stay eligible for fusion and for
  // `finalChunks` above.
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
    // H-14, and the reason it is a hardening item rather than a detail. `evidenceThreshold` is
    // calibrated on the in-memory scorer's IDF-weighted coverage ratio in [0,1]. Neither ranker here
    // produces that: `ts_rank_cd` is selected with no normalization flag and is not bounded by 1, and
    // the dense expression above is a rescaled cosine distance. So 0.3 means one thing in memory and
    // an unmeasured thing here, and nobody has run the measurement — this path has no CI coverage.
    // The shared constant is the honest form of that: one bar, two scales, visible in the diff. An
    // option per path would have hidden the same problem behind a knob.
    outOfCorpus: bestEvidenceScore < evidenceThreshold,
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
