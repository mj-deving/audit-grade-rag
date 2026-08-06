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

The `bge-m3` entry names the model that ranks: since H-11 the dense candidate pass reads real
`bge-m3@1024-v1` vectors from a committed cache (see below), so the pin is no longer a label over a
lexical path. `corpusSnapshotHash` is derived from the corpus content, not its label. It is a SHA-256 over
a canonical-JSON manifest of every chunk's id paired with the SHA-256 of its text, sorted so read
order cannot change it and folded with the chunk count. A third party can recompute it from the
published corpus, and it moves when any corpus byte changes. Closed as H-12 in `docs/HARDENING.md`;
probes in `src/modules/eval/corpus-snapshot-hash.unit.test.ts`.

## What this harness measures — and what it does not

Read this before trusting a green run. The eval path is deterministic and offline, which is what
makes it a CI gate, but it is narrower than the metric names suggest.

**It measures** retrieval ranking, the out-of-corpus refusal threshold, citation plumbing, and the
answer contract, end to end over a fixed corpus.

**It does not measure model answer quality.** `EvalCitedProvider` is a stub that echoes back the
chunk markers it finds in the prompt. Groundedness here means "every claim carries a citation", not
"the claim is true".

**Retrieval ranking is dense; the evidence gate is not.** Since H-11 (Option A) the `dense` candidate
pass ranks by real `bge-m3@1024-v1` cosine similarity, read from a committed cache
(`eval/embeddings/bge-m3-v1.json`) computed once at author time over the fixed corpus and golden set
against a real endpoint. So the eval ranks with the same modality production retrieves with, still
offline and deterministic, and the pinned `bge-m3` entry names the model that ranks. Regenerate the
cache with `scripts/generate-eval-embeddings.ts` when the corpus or golden set changes; a text whose
bytes changed is a cache MISS the loader throws on, never a silent lexical fallback.

What stayed lexical is the **evidence gate**. The out-of-corpus refusal and the citation filter read
the IDF-weighted coverage score alone — the one scale `0.3` is calibrated on — so no cosine score can
open a refusal or admit a chunk the lexical bar rejected (`retrieval/dense-eval.unit.test.ts` asserts
this against an adversarial dense map). Reconciling the two scales into one gate, so the refusal
decision is also semantic, is the deferred Option B tracked with H-14. The gate's matching is still
exact-token with umlaut folding and **no stemming**, so the mixed-language erosion documented below is
a property of the gate, not of the ranking. On the current 8-chunk corpus, where every answerable
case has at most `topK` chunks clearing the bar, dense ranking reorders candidates without changing
which chunks are cited, so it does not move the aggregate score; its value here is modality fidelity
and a semantically-ordered candidate list (`eval/dense-eval-semantic.unit.test.ts`), not a score bump.

**A green `pnpm eval` does not mean the gate can read natural German, and the golden set's wording is
part of why it is green.** Two of the five cases are phrased in the statute's own inflections because
the gate refuses them otherwise, and they were left that way on 2026-08-06 when Option B was attempted
and did not close: restoring their natural wording turns this eval red. Measured on
`eval/probes/gate-separation-v1.jsonl` (16 probes, asserted in
`src/modules/retrieval/gate-separation.unit.test.ts`), the gate refuses 5 of 10 questions Article 50
answers, and its scale is not merely mistuned but non-separating — the worst answerable probe scores
`0.0951` against the best unanswerable one at `0.2357`, so no threshold satisfies both. Cosine does
separate the two classes, by `0.0180`, which is too narrow a window to place a constant in honestly
and is in any case unavailable to a per-query gate from a cache keyed on texts computed at author
time. Full reasoning, including the rejected German-stemming attempt, is in `docs/HARDENING.md` H-11.

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
- Growing it with **vocabulary alien to the query's language**: the margin erodes, and this is the one
  documented limit of the guarantee. The two fillers go opposite ways as the corpus grows: alien rises
  `0.2154` → `0.2654` → `0.2825` toward the bar at 50/500/2000 added chunks, while German legal prose
  falls `0.1031` → `0.0813` → `0.0694` away from it. Still refused at 2000, but the direction is the
  point, so mixed-language corpora are the case to watch (H-11). (This bullet claimed `0.283` from
  2026-07-16 with no test behind it, and the filler that produced it was never committed — the figure
  named a corpus that existed nowhere. Re-measured 2026-07-17 against a committed filler: `0.282525`,
  so the old number was right and merely unguarded. It now has a test.)
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
