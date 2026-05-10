import type { CorpusChunk, RetrievedChunk } from "../../domain/types.js";

export type RetrievalOptions = {
  readonly topK?: number;
  readonly activeSnapshotId: string;
  readonly outOfCorpusThreshold?: number;
};

export type RetrievalTrace = {
  readonly vectorCandidates: readonly RetrievedChunk[];
  readonly bm25Candidates: readonly RetrievedChunk[];
  readonly mergedCandidates: readonly RetrievedChunk[];
  readonly finalChunks: readonly RetrievedChunk[];
  readonly outOfCorpus: boolean;
};

const candidateLimit = 50;
const defaultTopK = 8;
const defaultThreshold = 0.3;
const rrfK = 60;

export function retrieveChunks(
  query: string,
  chunks: readonly CorpusChunk[],
  options: RetrievalOptions,
): RetrievalTrace {
  const topK = parseTopK(options.topK);
  const activeChunks = chunks.filter(
    (chunk) => chunk.corpusSnapshotId === options.activeSnapshotId,
  );
  const vectorCandidates = rankCandidates(query, activeChunks, "dense").slice(0, candidateLimit);
  const bm25Candidates = rankCandidates(query, activeChunks, "bm25").slice(0, candidateLimit);
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
    outOfCorpus: bestEvidenceScore < (options.outOfCorpusThreshold ?? defaultThreshold),
  };
}

export function parseTopK(topK: number | undefined): number {
  if (topK === undefined) {
    return defaultTopK;
  }
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new Error("top_k must be an integer from 1 through 20");
  }
  return topK;
}

export function reciprocalRankFusion(
  vectorCandidates: readonly RetrievedChunk[],
  bm25Candidates: readonly RetrievedChunk[],
): readonly RetrievedChunk[] {
  const scores = new Map<string, { readonly chunk: RetrievedChunk; score: number }>();
  addRrfScores(scores, vectorCandidates);
  addRrfScores(scores, bm25Candidates);
  return [...scores.values()]
    .map(({ chunk, score }) => ({
      ...chunk,
      retrievalScore: roundScore(score),
      retrievalMethod: "rrf" as const,
    }))
    .sort(compareRetrievedChunks);
}

function rankCandidates(
  query: string,
  chunks: readonly CorpusChunk[],
  method: "dense" | "bm25",
): readonly RetrievedChunk[] {
  const queryTerms = terms(query);
  return chunks
    .map((chunk) => ({
      ...chunk,
      retrievalScore: scoreChunk(queryTerms, chunk, method),
      retrievalMethod: method,
    }))
    .sort(compareRetrievedChunks);
}

function scoreChunk(
  queryTerms: readonly string[],
  chunk: CorpusChunk,
  method: "dense" | "bm25",
): number {
  const chunkTerms = terms(chunk.chunkText);
  if (queryTerms.length === 0 || chunkTerms.length === 0) {
    return 0;
  }
  const overlap = queryTerms.filter((term) => chunkTerms.includes(term)).length;
  const base = overlap / queryTerms.length;
  const lengthBonus =
    method === "bm25" ? Math.min(0.2, overlap / Math.max(10, chunkTerms.length)) : 0;
  return roundScore(Math.min(1, base + lengthBonus));
}

function addRrfScores(
  scores: Map<string, { readonly chunk: RetrievedChunk; score: number }>,
  candidates: readonly RetrievedChunk[],
): void {
  candidates.forEach((chunk, index) => {
    const current = scores.get(chunk.chunkId);
    const score = (current?.score ?? 0) + 1 / (rrfK + index + 1);
    scores.set(chunk.chunkId, { chunk, score });
  });
}

function compareRetrievedChunks(left: RetrievedChunk, right: RetrievedChunk): number {
  if (right.retrievalScore !== left.retrievalScore) {
    return right.retrievalScore - left.retrievalScore;
  }
  return left.chunkId.localeCompare(right.chunkId);
}

function terms(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/u)
    .filter((term) => term.length > 1);
}

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}
