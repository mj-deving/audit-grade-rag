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
// `scoreChunk` returns `roundScore(Math.min(1, base + lengthBonus))` over a non-negative `base`, so
// every score this path produces is in [0,1]. Deliberately NOT exported: `postgres-retrieval.ts`
// ranks on a different scale and declares its own ceiling.
const inMemoryScoreCeiling = 1;

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
  const threshold = parseThreshold(options.outOfCorpusThreshold, inMemoryScoreCeiling);
  const evidenceScores = bestEvidenceScores(vectorCandidates, bm25Candidates);
  const bestEvidenceScore = Math.max(0, ...evidenceScores.values());
  // A cited chunk clears the same bar that decides whether evidence exists at all. `0.3` used to be a
  // QUERY-level gate only — it asked "is there any evidence?" of the best candidate, while topK came
  // back regardless of each chunk's own score. So a chunk at 0.265 was simultaneously not-evidence
  // (it would have triggered a refusal had it ranked first) and evidence (it was rendered into the
  // prompt, validated against, and signed into the ledger as a citation).
  //
  // Filtered on the PRE-FUSION evidence score, never the RRF score sitting in `retrievalScore` here:
  // fusion rescales to ~0.016-0.032, so comparing that against 0.3 would drop every chunk on every
  // query and refuse the whole corpus.
  const finalChunks = mergedCandidates
    .filter((chunk) => (evidenceScores.get(chunk.chunkId) ?? 0) >= threshold)
    .slice(0, topK);
  return {
    vectorCandidates,
    bm25Candidates,
    mergedCandidates,
    finalChunks,
    outOfCorpus: bestEvidenceScore < threshold,
  };
}

// The evidence score of a chunk is the best score either ranker gave it, which is exactly what the
// out-of-corpus gate reads via its max. Keeping one function for both means the gate and the citation
// filter can never drift apart into two notions of "evidence".
function bestEvidenceScores(
  vectorCandidates: readonly RetrievedChunk[],
  bm25Candidates: readonly RetrievedChunk[],
): ReadonlyMap<string, number> {
  const scores = new Map<string, number>();
  for (const chunk of [...vectorCandidates, ...bm25Candidates]) {
    scores.set(chunk.chunkId, Math.max(scores.get(chunk.chunkId) ?? 0, chunk.retrievalScore));
  }
  return scores;
}

// The threshold decides both whether evidence exists and which chunks may be cited, so the values
// worth rejecting are the ones that turn both off WITHOUT failing. Two of them:
//
//   NaN — every comparison against it is false, so `best < NaN` never refuses and `score >= NaN`
//   drops every citation. The result answers from zero cited chunks.
//   0 — `bestEvidenceScore` is `Math.max(0, …)` and scores are non-negative, so `best < 0` is never
//   true and `score >= 0` is always true. The gate never refuses and the filter is a no-op.
//   Measured: at `0` the out-of-corpus banking question is answered, citing 8 chunks of the AI Act.
//
// Rejecting only non-finite values would have left `0` — the plainest way to silently disable the
// property this function exists to protect. The first version of this guard did exactly that, and
// permitted `0` on purpose, reasoning it was a coherent "gate off" setting. A gate that is off is
// the defect, not a configuration.
//
// The ceiling is per-caller and has no default, because the two retrieval paths score on ranges that
// have nothing to do with each other and a shared contract is wrong for one of them whichever way it
// is written. `scoreChunk` returns a coverage ratio in [0,1], so a threshold above 1 there refuses
// every query. `postgres-retrieval.ts` compares the same option against raw `ts_rank_cd`
// (unnormalized, not bounded by 1) and `1 - (embedding <=> …)` (a cosine distance in [0,2], so
// [-1,1]), where a cutoff above 1 can be legitimate. That the two share one option at all is H-14.
//
// A previous version of this guard dropped the upper bound entirely, arguing that a too-high
// threshold "fails loudly, which is self-evident within one query". That was wrong, and wrong in this
// repo's signature way — a claim about a failure's observability, asserted rather than checked. A
// deployment at 1.5 refuses EVERY question, and each refusal is byte-identical to a legitimate one:
// "no evidence in the corpus" is this product's normal, correct output. Nothing surfaces. Both ends
// of the range are silent; that is the whole reason this function exists.
export function parseThreshold(threshold: number | undefined, scoreCeiling: number): number {
  if (threshold === undefined) {
    return defaultThreshold;
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > scoreCeiling) {
    throw new Error(
      `out_of_corpus_threshold must be a finite number greater than 0 and at most ${String(scoreCeiling)}`,
    );
  }
  return threshold;
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
// decided by stopwords, and it got weaker as chunks got longer. Weighting by IDF makes such a
// question's unmatched content words dominate the denominator.
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
//
// The known limit, measured rather than asserted (see the corpus-growth sweep in
// retrieval.unit.test.ts). `base` is a ratio of IDF sums, and every IDF grows like ln(corpusSize)
// when its document frequency stays put. So as a corpus grows with text that shares none of the
// query's vocabulary, matched and unmatched weights grow together and `base` drifts up toward the
// query's plain matched-TOKEN fraction — the very unweighted count IDF was added to replace. For
// the CRR question that fraction is 3/10, which sits exactly on the 0.3 threshold. IDF buys a large
// margin at realistic corpus sizes and in a corpus of one language; it does not buy an asymptotic
// guarantee. A corpus grown with alien vocabulary erodes it. That is a documented property of
// coverage-ratio scoring, not a claim that it cannot happen.
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
  // bm25 additionally prefers a chunk whose match is dense relative to its length. That preference
  // is a MODIFIER on evidence and must never be evidence itself, so it scales with `base`: a chunk
  // carrying none of the query's information earns no bonus, however short it is.
  //
  // It used to be an additive term, `min(0.2, matchedWeight/max(10, chunkLen))`, which never looked
  // at the query at all. `matchedWeight` grows like ln(corpusSize), so the bonus saturated at its
  // own 0.2 cap — two thirds of the 0.3 refusal threshold — handed out purely for matching
  // stopwords. Measured: with 50 unrelated chunks added, the out-of-corpus CRR question scored
  // 0.369 and was ANSWERED, citing Article 50 text as its evidence. `base` alone never crossed 0.3
  // in that sweep; the bonus did it single-handed.
  const density = Math.min(0.2, matchedWeight / Math.max(10, chunkTerms.size));
  const lengthBonus = method === "bm25" ? base * density : 0;
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
