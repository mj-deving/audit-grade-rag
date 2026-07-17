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
  // Non-finite candidates are dropped from each ranker's list BEFORE fusion, not after. Filtering
  // afterwards was not enough and the first version of this fix did exactly that: it kept a chunk if
  // EITHER ranker scored it finitely, and `bm25CandidatesFor` returns a finite `0` for a non-match,
  // so a chunk with a NaN dense score and a 0 lexical score stayed eligible AND kept the arbitrary
  // dense rank its NaN had bought it in the sort. If any other candidate opened the gate, it reached
  // the prompt and the signed ledger. A chunk is a candidate only through a ranker that actually
  // ranked it.
  const rankedVector = vectorCandidates.filter((chunk) => Number.isFinite(chunk.retrievalScore));
  const rankedBm25 = bm25Candidates.filter((chunk) => Number.isFinite(chunk.retrievalScore));
  const mergedCandidates = reciprocalRankFusion(rankedVector, rankedBm25);
  // `Math.max(0, …)` seeds the max at zero, which matters here and not in memory: `denseCandidates`
  // selects `1 - (embedding <=> $2::vector)`, and pgvector's `<=>` is a cosine DISTANCE in [0,2], so
  // this expression lands in [-1,1] and CAN be negative. Measured, not inferred: the out-of-corpus
  // probe produced -0.026972. Seeding at 0 keeps a wholly-opposed corpus reporting 0 rather than a
  // negative best score, which is the refusing direction and therefore safe.
  //
  // Non-finite scores are dropped BEFORE the max, and that is the load-bearing part. `Math.max` is
  // NaN-poisoning: one NaN anywhere in the list makes the whole max NaN, and `NaN < threshold` is
  // false, so the gate concludes evidence EXISTS and the path answers. A refusal failing open is the
  // worst outcome this product has. pgvector reaches NaN from an all-zero query vector
  // (`'[0,0,0]'::vector <=> '[1,2,3]'::vector` → NaN, verified against pgvector/pgvector:pg16), so
  // this is a real input, not a hypothetical. `embedding.ts` now rejects such a vector at the
  // boundary; this is the second line, because a gate that depends on every upstream source being
  // well-behaved is not a gate.
  //
  // Found by a cross-vendor audit of the commit that claimed `outOfCorpus ? [] : …` closes the
  // refusal half "on any score scale". It does not. It closes it on any FINITE score scale, and NaN
  // is not a scale — it is the absence of one.
  const bestEvidenceScore = Math.max(
    0,
    ...[...rankedVector, ...rankedBm25].map((chunk) => chunk.retrievalScore),
  );
  // H-14, open. `evidenceThreshold` is calibrated on the in-memory scorer's IDF-weighted coverage
  // ratio in [0,1]. Neither ranker here produces that.
  //
  // What `0.3` means against `ts_rank_cd` depends on the query, and that is the point. Measured
  // against pgvector/pgvector:pg16, `to_tsvector('simple', …)` vs `plainto_tsquery('simple', …)`:
  //
  //   query 'auditpflicht', chunk repeats it  1x -> 0.1   5x -> 0.5   20x -> 2   100x -> 10
  //   query 'auditpflicht beleg', chunk has 'auditpflicht' 3x and no 'beleg'  -> 0
  //   query 'auditpflicht beleg', chunk has 'auditpflicht' 20x and no 'beleg' -> 0
  //   query 'auditpflicht beleg', chunk has both once                         -> 0.1
  //
  // So `plainto_tsquery` ANDs the lexemes: miss one query term and the score is 0 no matter how
  // often the rest appear. Clear that hurdle and the score is unnormalized and unbounded, rising
  // with frequency and cover density. Either way it is not a coverage RATIO, so comparing it to a
  // bar calibrated as one is a category error rather than a strict-or-lenient choice.
  //
  // Two retractions live in that table, both of them universal claims from a single probe shape:
  // this comment first said "ts_rank_cd returned 0..0.1 across every probe, so THE LEXICAL RANKER
  // CAN NEVER CLEAR THIS BAR" — refuted, the 0.1 was the fixture's, where each chunk mentions the
  // term once. Its replacement said "0.3 means the chunk repeats a query term three times" — also
  // refuted, that holds for a SINGLE-term query only, and the served questions are multi-term
  // German. Both are the H-10 defect in docs/HARDENING.md, which is generalizing from a fixture.
  //
  // The dense side is no better and differently so: `HashEmbeddingProvider` puts it at 0.259..0.692
  // in the fixture, and a real BGE-M3 embedder puts it somewhere else again. One bar, two scales,
  // neither of them its own.
  const outOfCorpus = bestEvidenceScore < evidenceThreshold;
  // H-15 on this path, closed on the half that is provable and left open on the half that is not.
  //
  // CLOSED: a refusal cites nothing. Until 2026-07-17 `finalChunks` was topK of the fusion no matter
  // what, so a refused query returned chunks anyway — `refusedOutcome` copies them into the response
  // and into the SIGNED LEDGER, and the operator UI renders them. Measured against a live pgvector:
  // `outOfCorpus: true` together with 8 chunks scoring -0.026972..0.014098. "No evidence exists" and
  // "here are eight pieces of evidence" cannot both be the output, and that holds on ANY score scale,
  // which is why it is fixed here and now. Note `bestEvidenceScore` is the max over all candidates,
  // so on a refusal every chunk is under the bar anyway: emptying the list drops nothing that a
  // per-chunk filter would have kept.
  //
  // OPEN: on an ANSWERED query, a chunk below the bar can still be cited. The in-memory path filters
  // them per-chunk; this path deliberately does not, and the first version of this fix did. It was
  // wrong, and autoreview caught it — but the reason given then was ALSO wrong, and a cross-vendor
  // audit caught that in turn. Both are worth keeping straight:
  //
  // The stated reason was "ts_rank_cd never exceeds 0.1, so the filter necessarily deletes the
  // lexical ranker". False. ts_rank_cd reaches 0.3 at three occurrences of a query term and keeps
  // climbing (see the table below). The filter does not NECESSARILY delete lexical evidence.
  //
  // The real reason is worse for the bar, not better: `max(dense, ts_rank_cd)` compares two
  // incommensurable scales against a number calibrated for a third. A lexical score of 0.3 means
  // "repeated a term three times"; a dense score of 0.3 means something else entirely; the bar means
  // "30% IDF-weighted coverage" on a path that is not this one. So the filter would neither reliably
  // keep evidence nor reliably drop non-evidence — it would sort chunks by an arithmetic accident.
  // Deferring is right; the earlier justification for deferring was a universal claim from a fixture.
  //
  // The per-chunk half therefore waits on H-14: normalize these rankers, or give each its own
  // criterion, and then filter. Not before.
  // `mergedCandidates` is already fused from the ranked lists only, so a chunk no ranker could rank
  // is gone before this point. That is NOT the per-chunk evidence filter deferred to H-14 — it needs
  // no calibrated scale, because NaN is not a low score, it is the absence of a score, and citing a
  // chunk the ranker could not rank is indefensible on every scale.
  const finalChunks = outOfCorpus ? [] : mergedCandidates.slice(0, topK);
  return {
    vectorCandidates,
    bm25Candidates,
    mergedCandidates,
    finalChunks,
    outOfCorpus,
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
