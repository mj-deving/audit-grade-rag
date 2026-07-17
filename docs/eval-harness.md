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

**Citation accuracy used to be weak because `topK` outran the corpus, and this section said so before
anyone acted on it.** `topK` is 8, and against the old 14-chunk corpus the provider cited more than
half of it for every question, so any expected chunk in the top 8 passed. Since 2026-07-16 a citation
must also clear the `0.3` evidence bar (H-15), so survivors per golden case are now 2, 1, 1, 5 and 0
of a possible 8, rather than 8 every time.

**That narrowed retrieval. It did not narrow this metric, and the first version of this paragraph
claimed it did** ("which makes the metric discriminating at any corpus size", written 2026-07-16,
retracted 2026-07-17). `scoreCitationAccuracy` is `expected.every((id) => cited.has(id))` — pure
recall. Extra citations are free, so a citation dump scores exactly what a precise citation scores,
and the metric is blind to the difference. Measured rather than argued: delete the filter from
`retrieveChunks`, and `pnpm eval` still reports `passed: true` at `citation-accuracy: 1`. **So the
eval cannot verify H-15.** The property is real and is guarded — by `retrieval.unit.test.ts` › "a
citation clears the same bar as the gate", which asserts it directly against the retriever and goes
red when the filter is removed. It is not guarded here, and a passing eval is not evidence for it.

What the old dump was hiding is worth keeping in view — the model was doing the selection the ranker
could not, so a passing citation score partly measured the model. The corpus is still smaller than
`topK`, H-1 is what makes this metric mean something, and a precision term is what would make it able
to see a dump at all.

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

- Growing the corpus with **more German legal prose** (what this project will actually do): the CRR
  question goes `0.080` → `0.069` as the corpus grows 8 → 2008 chunks, so the refusal ends stronger
  than it started. It does not get there in a straight line, and the two endpoints on their own are a
  misleading way to say it: measured over 8/18/58/308/2008 chunks the margin runs `0.2195 → 0.2048 →
  0.1969 → 0.2140 → 0.2306`, bottoming at 58 chunks. What holds is the floor, not a trend. Covered
  questions stay at `0.44`–`0.56`.
- Growing it with **vocabulary alien to the query's language**: the margin erodes. At 2000 added
  synthetic chunks sharing no German the question reaches `0.283`, still refused but close.
- The margin is **not monotonic** and the sweep asserts no trend, only a floor: across
  8/18/58/308/2008 chunks it runs `0.2195` → `0.2048` → `0.1969` → `0.2140` → `0.2306`, so the
  question never scores above a third of the bar. An earlier version of this section asserted that
  growth "ends better than it starts"; that was a quieter restatement of the retracted claim above and
  is gone.

The reason is structural and worth stating plainly: `base` is a ratio of IDF sums, and every IDF
grows like `ln(corpusSize)` when its document frequency stays put. Matched and unmatched weights
grow together, so `base` drifts toward the query's plain matched-**token** fraction — the unweighted
count IDF was introduced to replace. For the CRR question that fraction is `3/10`, sitting exactly on
the threshold. IDF buys a large margin at realistic sizes and within one language. It does not buy an
asymptotic guarantee, and a mixed-language corpus is the case to watch. Tracked with H-11.

### One threshold, one meaning — and why the corpus had to move first

`0.3` decides two questions and used to answer only one. It gates the *query* ("is there any
evidence?") by testing the best candidate, but `finalChunks` returned `topK` regardless of each
chunk's own score, and those chunks are what reach the prompt, the claim validator and the signed
ledger. A chunk at `0.265` was therefore not-evidence and evidence at once. Since 2026-07-16 a chunk
must clear the same bar to be cited, and a refusal cites nothing at all.

The filter could not ship on its own, and the reason is the more useful half of the story. Applied to
the corpus as it was cut, it took `pnpm eval` to `citation-accuracy: 0.8`, `passed: false`. The case
that broke was the one tagged `ambiguous` — "Muss jeder KI-generierte Text offengelegt werden, wenn er
veroeffentlicht wird?" — which kept the duty (`0.3286`) and dropped its editorial exception
(`0.0491`). The exception was then absent from the prompt, so the only answer available was "yes,
disclose": Article 50 misstated, on the single case built to test duty-versus-exception.

The cause was the chunking. Article 50 states a duty and narrows it with a clause that names its
subject anaphorically, and four of the five exception chunks opened with the identical string "Diese
Pflicht gilt nicht", the fifth with "Ist der Inhalt". None named the duty it limited. So an exception
was unreachable from its own duty's question — it shared exactly one token with it, the stopword
"wenn" — and the exceptions matched on each other's counter-clause vocabulary instead of on the duty
they limit. Measured on the `contradictory` question: the right exception ranked first at `0.9158`,
three unrelated exception chunks followed at `0.8152`, `0.7661` and `0.6623`, and `art50-deepfake` —
a duty, not an exception — landed among them at `0.6075`. All five cleared the `0.3` bar and would be
cited; four are wrong. The fifth exception, `art50-deepfake-artistic`, scored `0.0` and was invisible.
So the exceptions were not indistinguishable from each other, they were unanchored from their duties,
which is also why the one that shared no counter-clause vocabulary vanished entirely rather than
joining the pile. The corpus is now cut along the Absätze, 8 chunks instead of 14,
each duty carrying the exception that limits it. `art50-deepfake` already did this inline and was the
precedent. The provenance tests were not touched and still pass: the re-cut is verbatim and still
accounts for the whole source in order.

The cost is citation granularity: a citation points at a duty together with its carve-out rather than
either alone. For an audit-grade system that is arguably the right unit, since a duty is never shown
without what limits it, but it is a real loss of precision and it was a choice.
