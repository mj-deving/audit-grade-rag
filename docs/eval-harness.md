# Eval Harness

The v1 golden set lives at `eval/golden/v1.jsonl`. The fixture corpus lives at `corpus-fixtures/`
and holds verbatim German excerpts of Regulation (EU) 2024/1689, pinned to a source snapshot by
SHA-256 (see `corpus-fixtures/README.md`).

Golden sets are JSONL files with `id`, `question`, `expected_outcome`, optional `expected_chunks`,
and `tags`. The required v1 tags are represented in the committed file: `ambiguous`,
`out-of-corpus`, `contradictory`, `multi-hop`, and `numerical`. Empty files, missing IDs, duplicate
IDs, missing questions, and missing expected outcomes fail.

The gate computes groundedness, citation accuracy, refusal correctness, and per-tag breakdown.
Thresholds are groundedness `0.95`, citation accuracy `0.95`, and refusal correctness `0.90`.
`pnpm eval` exits non-zero when any threshold is missed or the golden set is empty. `pnpm check:full`
runs the eval harness.

The default pinned tuple for `pnpm eval` is, as `pnpm eval` reports it:

- model: `eval-cited-provider@1.0.0`
- prompt: `1.0.0`
- embedding model: `bge-m3@1024-v1`
- corpus snapshot: `corpus-fixtures:v1`

The `bge-m3` entry is a label, not a description of the eval path: no embedding is computed here (see
above). `corpusSnapshotHash` is currently `sha256("corpus-fixtures:v1")` — a hash of that label, not
of the corpus. It cannot be recomputed from the source snapshot and does not move when the corpus
changes. Tracked as H-12 in `docs/HARDENING.md`.

## What this harness measures — and what it does not

Read this before trusting a green run. The eval path is deterministic and offline, which is what
makes it a CI gate, but it is narrower than the metric names suggest.

**It measures** retrieval ranking, the out-of-corpus refusal threshold, citation plumbing, and the
answer contract, end to end over a fixed corpus.

**It does not measure model answer quality.** `EvalCitedProvider` is a stub that echoes back the
chunk markers it finds in the prompt. Groundedness here means "every claim carries a citation", not
"the claim is true".

**Retrieval on this path is lexical, not dense.** Both the `dense` and `bm25` candidate passes run
the same IDF-weighted term-overlap scorer over fixture text; no embedding is computed, despite the
pinned tuple naming `bge-m3`. Matching is exact-token with umlaut folding and **no stemming**, which
bites hard in German: a question asking about `maschinenlesbare Kennzeichnung` does not match text
reading `maschinenlesbaren Format ... gekennzeichnet`. Golden questions are therefore written to be
lexically fair to this scorer. That is a real limit on what a passing score proves — it is closer to
"the ranker orders a known-answerable question correctly" than "retrieval works".

**Citation accuracy is weak while the corpus is small.** `topK` is 8. Against a 14-chunk corpus the
provider cites more than half of it for every question, so any expected chunk in the top 8 passes.
The metric only becomes discriminating once the corpus is much larger than `topK`.

## Out-of-corpus refusal

`retrieveChunks` refuses when the best candidate scores below `0.3`. The score is IDF-weighted
coverage of the query: the share of the query's *information* a chunk carries, where a term in every
chunk earns almost nothing and a term in no chunk earns the most and stays in the denominator.

This replaced an unweighted term count on 2026-07-16. Under the old scorer, "Welche
Eigenkapitalquote verlangt die CRR fuer Sparkassen im Jahr 2030?" — a banking-supervision question
with zero content words in the corpus — matched only `die`, `fuer` and `im` and scored exactly
`0.300` against the `0.3` threshold, so it was answered. The refusal the demo console promises was
being decided by German stopwords.

### Retracted: "the margin widens as the corpus grows"

An earlier revision of this page, and of the code comments, claimed IDF made the refusal margin grow
with the corpus. **That claim was false and backwards, and it shipped.** A cross-vendor audit
refuted it with a repro that reproduced exactly: adding 50 unrelated chunks took the CRR question
from `0.186` to `0.369` and it was *answered*, citing Article 50 text as its evidence.

The cause was not IDF but the bm25 length bonus sitting next to it — an additive term,
`min(0.2, matchedWeight/max(10, chunkLen))`, that never referenced the query. `matchedWeight` grows
like `ln(corpusSize)`, so the bonus saturated at its own `0.2` cap: two thirds of the refusal
threshold, awarded for matching stopwords. The IDF-weighted `base` never crossed `0.3` on its own in
that sweep. The bonus is now a multiplier on `base`, so a chunk carrying none of the query's
information earns no bonus however short it is.

### What the refusal gate actually guarantees

Measured, not asserted — the sweep lives in `src/modules/retrieval/retrieval.unit.test.ts` and fails
if any of this stops holding.

- Growing the corpus with **more German legal prose** (what this project will actually do): the
  CRR question goes `0.104` → `0.069` as the corpus grows 14 → 2014 chunks. The margin holds and
  slightly widens. Covered questions stay at `0.49`–`0.63`.
- Growing it with **vocabulary alien to the query's language**: the margin erodes. At 2000 synthetic
  chunks sharing no German the question reaches `0.274`, still refused but close.

The reason is structural and worth stating plainly: `base` is a ratio of IDF sums, and every IDF
grows like `ln(corpusSize)` when its document frequency stays put. Matched and unmatched weights
grow together, so `base` drifts toward the query's plain matched-**token** fraction — the unweighted
count IDF was introduced to replace. For the CRR question that fraction is `3/10`, sitting exactly on
the threshold. IDF buys a large margin at realistic sizes and within one language. It does not buy an
asymptotic guarantee, and a mixed-language corpus is the case to watch. Tracked with H-11.
