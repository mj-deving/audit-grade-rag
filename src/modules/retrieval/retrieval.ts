import type { CorpusChunk, RetrievedChunk } from "../../domain/types.js";
import { foldGerman } from "../../lib/german.js";

export type RetrievalOptions = {
  readonly topK?: number;
  readonly activeSnapshotId: string;
  // H-11 Option A: when present, the dense pass ranks chunks by these precomputed cosine scores
  // (chunkId -> cosine(query, chunk), read from the committed BGE-M3 embedding cache) instead of the
  // lexical fallback scorer. The map is the caller's responsibility to build completely; a chunk
  // absent from it scores 0. Cosine lives OUTSIDE this ranker so retrieval.ts stays a pure ranker
  // and the evidence gate below can never read a cosine score. Absent => unchanged lexical behavior.
  readonly denseScores?: ReadonlyMap<string, number>;
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
const rrfK = 60;

// The bar that decides both whether evidence exists and which chunks may be cited. One calibrated
// constant, deliberately not configurable.
//
// It used to be an option, `outOfCorpusThreshold`, and nothing ever passed it: not the runtime app,
// not the demo, not the eval harness, not a config file, not an env var. It existed only for the
// tests that guarded it. Three commits went into narrowing that guard, each one closing a value that
// silently disabled the bar and each one leaving another: `NaN` (every comparison false, so nothing
// refuses and every citation drops), `0` (scores are non-negative, so `best < 0` never refuses and
// `score >= 0` filters nothing), `1e-300` (the same no-op, wearing a positive sign), any value above
// the score ceiling (refuses EVERY question, and each refusal is byte-identical to a legitimate one
// because "no evidence in the corpus" is this product's normal, correct output).
//
// The interval was the wrong fix. Every one of those failures was reachable only through an option
// with no caller, so the option is gone and the failure class with it. A future caller that genuinely
// needs to tune this adds a validated surface at that point, against the range it actually measures.
//
// The value: `scoreChunk` returns an IDF-weighted coverage ratio in [0,1], and 0.3 is calibrated on
// the golden set — four answerable cases clear it with a worst-case margin of 0.031 (H-11 tracks that
// narrowness), and the out-of-corpus case sits under it at every corpus size in the sweep.
export const evidenceThreshold = 0.3;

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
  const vectorCandidates = (
    options.denseScores === undefined
      ? rankCandidates(query, activeChunks, "dense", idf)
      : rankByDenseScores(activeChunks, options.denseScores)
  ).slice(0, candidateLimit);
  const bm25Candidates = rankCandidates(query, activeChunks, "bm25", idf).slice(0, candidateLimit);
  const mergedCandidates = reciprocalRankFusion(vectorCandidates, bm25Candidates);
  const evidenceScores = bestEvidenceScores(bm25Candidates);
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
    .filter((chunk) => (evidenceScores.get(chunk.chunkId) ?? 0) >= evidenceThreshold)
    .slice(0, topK);
  return {
    vectorCandidates,
    bm25Candidates,
    mergedCandidates,
    finalChunks,
    outOfCorpus: bestEvidenceScore < evidenceThreshold,
  };
}

// The evidence score of a chunk is its LEXICAL IDF-coverage score — the bm25 pass only. That is the
// one scale `evidenceThreshold` (0.3) is calibrated against, and it is what decides both whether
// evidence exists (the refusal gate) and which chunks may be cited.
//
// It used to read `max(dense, bm25)`. On a purely lexical setup that was identical to reading bm25
// alone: bm25's score is `min(1, base + base*density)` with `density >= 0`, so it is >= the dense
// pass's `min(1, base)` for every chunk, and the per-chunk max was always the bm25 value. So dropping
// the dense pass here changes NOTHING while both passes are lexical (the retrieval sweep proves it by
// staying green). It changes everything once the dense pass carries real BGE-M3 cosine scores (H-11
// Option A): cosine lives on a different scale than a coverage ratio, and letting it into this max
// would sort chunks past the gate by an arithmetic accident — the exact scale-mixing hazard the
// postgres path documents. Cosine may reorder candidates (that is the point of Option A); it may
// never move the refusal decision or admit a chunk the lexical bar rejected. Reconciling the two
// scales into one gate is Option B, deferred with H-14.
//
// Deliberately NOT exported: `postgres-retrieval.ts` scores on ranges this bar was never calibrated
// for (`ts_rank_cd` is an unbounded cover-density rank), so sharing the FUNCTION would hide that the
// two paths do not share the SCALE. See H-14.
function bestEvidenceScores(
  bm25Candidates: readonly RetrievedChunk[],
): ReadonlyMap<string, number> {
  const scores = new Map<string, number>();
  for (const chunk of bm25Candidates) {
    scores.set(chunk.chunkId, Math.max(scores.get(chunk.chunkId) ?? 0, chunk.retrievalScore));
  }
  return scores;
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

// H-11 Option A: rank the dense pass by precomputed cosine scores from the embedding cache. A chunk
// absent from the map scores 0 — the caller (eval / demo) builds the map over exactly the active
// chunks from a cache that throws on a miss, so a 0 here means "caller passed an incomplete map", not
// "silent lexical fallback". These scores drive candidate order and thus RRF rank; they never reach
// the evidence gate, which reads the bm25 pass alone.
function rankByDenseScores(
  chunks: readonly CorpusChunk[],
  denseScores: ReadonlyMap<string, number>,
): readonly RetrievedChunk[] {
  return chunks
    .map((chunk) => ({
      ...chunk,
      retrievalScore: roundScore(denseScores.get(chunk.chunkId) ?? 0),
      retrievalMethod: "dense" as const,
    }))
    .sort(compareRetrievedChunks);
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
