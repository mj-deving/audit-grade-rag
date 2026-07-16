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
being decided by German stopwords, and the margin shrank as chunks got longer. Weighting by IDF
inverts that: the margin now *widens* as the corpus grows.

The margin is still corpus-size-dependent. Over only 14 chunks a stopword like `im` earns
non-trivial IDF, and that question lands near `0.19` — refused, but not by much.
`src/modules/retrieval/retrieval.unit.test.ts` guards the mechanism rather than the number.
