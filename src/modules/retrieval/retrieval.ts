import type { CorpusChunk, RetrievedChunk } from "../../domain/types.js";
import { foldGerman } from "../../lib/german.js";

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
  const idf = inverseDocumentFrequencies(activeChunks);
  const vectorCandidates = rankCandidates(query, activeChunks, "dense", idf).slice(
    0,
    candidateLimit,
  );
  const bm25Candidates = rankCandidates(query, activeChunks, "bm25", idf).slice(0, candidateLimit);
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

// Standard BM25 inverse document frequency over the active corpus. A term carried by every chunk
// earns almost no weight; a term carried by none earns the most.
//
// Without this the score was a plain term count over the query, so a question with zero content
// words in common with the corpus still scored on German stopwords alone: "Welche Eigenkapitalquote
// verlangt die CRR fuer Sparkassen im Jahr 2030?" matched only "die", "fuer" and "im" and scored
// exactly 0.300 against the 0.3 out-of-corpus threshold — the refusal the demo promises was being
// decided by stopwords, and it got weaker as chunks got longer. Weighting by IDF drives such a
// question to ~0 because its unmatched content words dominate the denominator.
export type CorpusTermWeights = {
  readonly idf: ReadonlyMap<string, number>;
  // Weight for a query term that appears in no chunk. Derived from the same corpus size as every
  // other weight — a constant here would misprice exactly the unmatched content words that are
  // supposed to drive an out-of-corpus question's score to zero.
  readonly unseenTermIdf: number;
};

export function inverseDocumentFrequencies(chunks: readonly CorpusChunk[]): CorpusTermWeights {
  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of new Set(terms(chunk.chunkText))) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const total = chunks.length;
  return {
    idf: new Map(
      [...documentFrequency].map(([term, frequency]) => [term, idfOf(frequency, total)]),
    ),
    unseenTermIdf: idfOf(0, total),
  };
}

// The `1 +` form keeps IDF strictly positive, so a term present in every chunk still contributes a
// little instead of flipping negative and rewarding chunks that lack it.
function idfOf(documentFrequency: number, totalChunks: number): number {
  return Math.log(1 + (totalChunks - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function rankCandidates(
  query: string,
  chunks: readonly CorpusChunk[],
  method: "dense" | "bm25",
  weights: CorpusTermWeights,
): readonly RetrievedChunk[] {
  const queryTerms = terms(query);
  return chunks
    .map((chunk) => ({
      ...chunk,
      retrievalScore: scoreChunk(queryTerms, chunk, method, weights),
      retrievalMethod: method,
    }))
    .sort(compareRetrievedChunks);
}

// IDF-weighted coverage of the query: the share of the query's *information* this chunk carries,
// not the share of its words. Stays in [0,1], so the out-of-corpus threshold keeps its meaning.
function scoreChunk(
  queryTerms: readonly string[],
  chunk: CorpusChunk,
  method: "dense" | "bm25",
  weights: CorpusTermWeights,
): number {
  const chunkTerms = new Set(terms(chunk.chunkText));
  if (queryTerms.length === 0 || chunkTerms.size === 0) {
    return 0;
  }
  let matchedWeight = 0;
  let queryWeight = 0;
  for (const term of new Set(queryTerms)) {
    // A query term absent from the corpus is maximally informative and stays in the denominator:
    // that is what pulls an out-of-corpus question's score toward zero instead of letting its
    // stopwords carry it over the threshold.
    const weight = weights.idf.get(term) ?? weights.unseenTermIdf;
    queryWeight += weight;
    if (chunkTerms.has(term)) {
      matchedWeight += weight;
    }
  }
  if (queryWeight === 0) {
    return 0;
  }
  const base = matchedWeight / queryWeight;
  const lengthBonus =
    method === "bm25" ? Math.min(0.2, matchedWeight / Math.max(10, chunkTerms.size)) : 0;
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
  return foldGerman(text.toLowerCase())
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/u)
    .filter((term) => term.length > 1);
}

function roundScore(value: number): number {
  return Number(value.toFixed(6));
}
