import type { Pool } from "pg";
import type { CorpusChunk, RetrievedChunk } from "../../domain/types.js";
import {
  type EmbeddingProvider,
  pgVectorLiteral,
  requireConfiguredEmbeddingProvider,
} from "../ingest/embedding.js";
import {
  bestEvidenceScores,
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
  const evidenceScores = bestEvidenceScores(vectorCandidates, bm25Candidates);
  // H-15 on this path. Until 2026-07-17 `finalChunks` was topK of the fusion regardless of any
  // chunk's own score, so a refused query returned chunks anyway: `refusedOutcome` copies them into
  // the response and into the SIGNED LEDGER, and the operator UI renders them. Measured against a
  // live pgvector before the fix, the out-of-corpus probe returned `outOfCorpus: true` together with
  // 8 chunks whose dense scores ran -0.026972..0.014098. A refusal that hands back eight
  // sub-threshold chunks as evidence is the contradiction this item is named for.
  //
  // The filter reads the pre-fusion evidence score, never `retrievalScore` after fusion, which is on
  // the RRF scale (~0.016-0.032) and would drop every chunk on every query.
  const finalChunks = mergedCandidates
    .filter((chunk) => (evidenceScores.get(chunk.chunkId) ?? 0) >= evidenceThreshold)
    .slice(0, topK);
  // `Math.max(0, …)` seeds the max at zero, which matters here and not in memory: `denseCandidates`
  // selects `1 - (embedding <=> $2::vector)`, and pgvector's `<=>` is a cosine DISTANCE in [0,2], so
  // this expression lands in [-1,1] and CAN be negative. Measured, not inferred: the out-of-corpus
  // probe above produced -0.026972. Seeding at 0 keeps a wholly-opposed corpus reporting 0 rather
  // than a negative best score, which is the refusing direction and therefore safe. The filter now
  // drops those negative candidates instead of citing them.
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
    // H-14, open, and now measured rather than read off the code. `evidenceThreshold` is calibrated
    // on the in-memory scorer's IDF-weighted coverage ratio in [0,1]. Neither ranker here produces
    // that. Against a live pgvector: `ts_rank_cd` returned 0..0.1 across every probe, answered and
    // refused alike, so THE LEXICAL RANKER CAN NEVER CLEAR THIS BAR — the gate is decided by the
    // dense score alone, and the bm25 half contributes nothing but fusion rank. The dense scores
    // above came from `HashEmbeddingProvider`; a real BGE-M3 embedder puts them somewhere else again,
    // which is the rest of H-14 and still unmeasured. One bar, two scales, both wrong for it.
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
