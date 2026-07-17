# Production Hardening

Tracks this build from demo to production-ready-to-a-named-scope, against the MJ-OS
production-readiness standard (the two-layer floor: engineering + AI). The product ISA
(`ISA.md`) stays frozen at its v1 verify state; this file is the hardening spine and its
criteria live here until each is closed with tool evidence.

## Scope and the honest claim target

Production for this build is single-operator self-host. Its production is the operator's
own daily use and the evals run against it, not customer traffic. The claim, once the
floor holds, is:

> production-ready to level: single-operator self-host; scope: public read-only demo plus
> passkey-gated operator console on my own infra (automation-host VPS). Not multi-tenant,
> not customer-facing.

Until every criterion below is closed, this build is a demo with a named-scope roadmap,
not production-ready. No bare badge.

## Gap-scan result (2026-07-15)

Passing floor dimensions: deploy/rollback, disposability, testing-on-data-path,
prompt-injection surface (read-only, no tools), LLM observability (Langfuse OTel on main),
per-call spend cap (`maxBudgetUsd`), secrets out of code. Open floor items become the
criteria below.

## Criteria

Each names the probe that falsifies it. Closed only on tool evidence of the right modality.

- [ ] H-1 (Evals as gate): the golden set holds at least 100 cases across the adversarial
  tag taxonomy, and a seeded regression under threshold fails CI. Falsifier: `wc -l` on the
  golden set under 100, or a deliberately-wrong answer does not drop a metric below its gate.
  **Blocked on H-11.** Scaling the set was started on 2026-07-16 and stopped at the corpus: the
  fixture was 4/6 paraphrase (H-9), so 100 cases would have been 100 citations into text that is
  not the law. H-9 and H-10 are the fallout and are closed; H-11 is the remaining design question.
- [x] H-9 (Corpus is the source): the chunks of every fixture reconstruct a committed source
  snapshot exactly — each verbatim, in order, with nothing dropped — and that snapshot still hashes
  to its recorded provenance. Falsifier: paraphrase a chunk, delete a clause from one, or edit the
  snapshot, and the gate stays green.
  Closed: `scripts/fetch-corpus-source.ts` writes the snapshot plus `{retrievalUrl, retrievedAt,
  sha256}`; `src/modules/eval/corpus-provenance.unit.test.ts` enforces hash, verbatim-substring, and
  full reconstruction for every chunked fixture, and refuses to pass vacuously on an empty corpus
  dir. Article 50 rebuilt from the snapshot: 6 chunks (4 of them paraphrase) to 14 verbatim.
  The reconstruction check is the one that matches the harm. Substring-checking proves nothing was
  invented; it is blind to omission, and omission is what the original defect actually did — it kept
  an exception and dropped the counter-exception that re-imposes the duty. Verbatim text minus a
  clause is still a misrepresentation of the law.
  Mutation-falsified three ways: the exact historical paraphrase re-inserted (caught), the snapshot
  edited while chunks stayed substrings (caught — only the hash sees that), and the counter-exception
  deleted with everything else left verbatim (caught only by reconstruction).

  **Reopened and re-closed 2026-07-16: chunk ids had to become unique across the corpus.** The gate
  above kept a `Map` keyed on chunk id while the runtime kept an array, so a repeated id collapsed
  in the gate and survived in the corpus. Verified by injecting a second `<!-- chunk:art50-marking
  -->` whose invented text turns Article 50's marking duty into a discretion: 15 chunks loaded, two
  under that id, the fabrication citable and signable — all four tests green. Both now read the
  corpus through one `parseFixtureChunks`.
  The first fix was still too narrow, and the audit caught that too: it was per-FILE. Two files
  each carrying `<!-- chunk:dup -->` — one harmless, one fabricated banking text — got the
  out-of-corpus CRR question ANSWERED, because the fabrication opened the refusal gate while the
  citation displayed the *other* file's sentence. `reciprocalRankFusion` keys on chunk id, so the
  two texts fused into one entry. An answer whose gate was opened by text it does not cite is the
  exact failure this project exists to make impossible. `loadFixtureCorpus` now rejects duplicate
  ids across the whole corpus and names both files.
  Discovery: the fixture header and the public demo both claimed "Auszug aus Artikel 50 der
  EU-KI-Verordnung"; one chunk had widened an exception's scope from a single duty to all
  transparency duties and dropped a counter-exception outright. The demo string did not need
  weakening — the corpus was changed until the claim was true.
  Caveat: the snapshot is a mirror's rendering, not the Official Journal. EUR-Lex answers 202 to
  non-browser clients and two reputable mirrors were found to differ in wording, so provenance names
  what was retrieved and when rather than claiming OJ status.
- [x] H-10 (Refusal is evidence-driven, not stopword-driven **on the in-memory fixture path**): a
  question with no content-word overlap with the corpus is refused, and the refusal stays clear of
  the bar at every corpus size — measured, the margin never falls below `0.19`, i.e. such a question
  never scores above roughly a third of the `0.3` threshold.
  This criterion said "and the margin does not shrink as the corpus grows" until 2026-07-17. That was
  the third life of the same false claim: it shipped as "the margin widens as the corpus grows", was
  retracted on 2026-07-16 when an audit disproved it, and survived here in the criterion of the very
  item that retracted it. It is false: over the sweep the margin runs `0.2195 → 0.2048 → 0.1969 →
  0.2140 → 0.2306`, so it shrinks over the first three points, which is all the claim needs to be
  wrong. The margin has no trend — it dips and recovers — and a floor is the property the sweep
  asserts.
  (This sentence read "and ends below where it started" until 2026-07-17, which was true of the
  four-point sweep it was written against and became false the moment the 2008-chunk point was added
  and the series ended at `0.2306`. A number in prose goes stale the instant the measurement behind
  it moves, and this one went stale inside the item whose whole subject is that failure. Hence the
  rule this file now follows: a documented measurement gets a test that reruns it, or it does not get
  documented.)
  (The first draft of this correction said the margin shrinks "while the refusal itself gets stronger
  at every size", which contradicts the very figures beside it: a shrinking margin *is* a weakening
  refusal. That clause is true of the H-15 re-cut — comparing the 8-chunk corpus against the 14-chunk
  one at each sweep point — and false of corpus growth, which is the subject here. Lifting a true
  sentence out of the context that made it true is the same defect as the one this paragraph
  retracts, committed while retracting it.)
  Scope is the path `/demo` and `pnpm eval` run — `retrieveChunks` over
  `loadFixtureCorpus`. The Postgres path has its own scorer and its own threshold and is NOT covered
  by this item; see H-14.
  Falsifier: neutralise the term weighting, or make the bm25 length bonus additive again, and the
  corpus-growth sweep still passes.
  Closed: `inverseDocumentFrequencies` + IDF-weighted coverage in `scoreChunk`, **plus** the bm25
  length bonus scaled by `base` instead of added to it. Found by H-9: the paraphrase's chunks were
  short enough that the CRR question scored `0.300` against the `0.3` threshold on `die`/`fuer`/`im`
  alone and was answered; the verbatim (longer) text pushed it over.
  Mutation-falsified three times (flat weights; constant unseen-term IDF; additive length bonus).

  **Closed wrongly TWICE on 2026-07-16, the second time inside the retraction of the first.** The
  re-close shipped a fresh false numeric comment in `retrieval.unit.test.ts`: it quoted the margin
  sequence as `0.196 → 0.195 → 0.195 → 0.214` where the run gives `0.1957 → 0.1928 → 0.1951 →
  0.2138`, and the "before" figures beside it came from the alien-vocabulary sweep, not the German
  one the test actually runs. Caught by a second cross-vendor audit, in the very commit whose
  purpose was to retract a false numeric claim. Same defect class, same hour.
  The fix is structural, not another correction: **no measured sequence is quoted in a comment any
  more.** Numbers that matter are `expect`ed — the sweep now pins both endpoints — because a number
  in a comment is owned by no check and rots the moment the fixture moves. That, not the arithmetic,
  is what went wrong both times.

  **Closed once wrongly, on 2026-07-16.** The first close asserted "the margin widens as the corpus
  grows" and merged it to `main` in code comments, this file, `docs/eval-harness.md` and the PR body.
  The claim was false and backwards. It survived my own cross-vendor audit and was caught by a second,
  deeper one, with a repro that reproduced exactly here: +50 unrelated chunks took the CRR question
  to `0.369` and it was answered, citing Article 50 as evidence for a banking question. Root cause was
  the additive length bonus, not IDF — it saturated at its `0.2` cap, two thirds of the threshold,
  paid out for matching stopwords. **Nothing tested the claim**: the tests asserted a relation at one
  corpus size (14 chunks) while the growth property lived only in a comment. The lesson is the rule
  this repo already had — a claim without a probe is "should work" — and a comment is not a probe.
  The sweep in `retrieval.unit.test.ts` now tests it at 8/18/58/308/2008 chunks. (2008 was added
  2026-07-17. It was quoted in the caveat below while the sweep stopped at 308, and a cross-vendor
  audit showed what that costs: a defect gated on corpus size —
  `inverseDocumentFrequencies(activeChunks.length > 1_000 ? [] : activeChunks)` — left the sweep
  entirely green, and went red only once the documented point had a test.)

  **And the first replacement assertion was wrong too**, which is the deeper half of the lesson. The
  retraction pinned the sweep with `margins.at(-1) > margins.at(0)` — "growth ends better than it
  started" — a weakened restatement of the same false claim, true only for those four sweep points on
  a 14-chunk fixture. The H-15 re-cut (14 → 8 chunks) broke it while the refusal got *stronger* at
  every size. An assertion that fails when the thing it guards improves is measuring the fixture. The
  sweep now asserts a floor — the CRR question never scores above a third of the bar at any corpus
  size — and asserts no trend, because the margin has none: it dips and recovers.

  Caveat, measured and not claimed away: the guarantee is bounded. Growth in the same language ends
  wider than it started but is not monotonic, and the shape matters more than the endpoints: measured
  over 8/18/58/308/2008 chunks the margin runs `0.2195 → 0.2048 → 0.1969 → 0.2140 → 0.2306`. It gets
  worse before it gets better, and its minimum sits at 58 chunks — inside the range H-1 is about to
  move through on the way to 100+. (This sentence read "growth in the same language widens the
  margin" until 2026-07-17. True at the endpoints, false as a trend, and misleading about precisely
  the growth this project is about to do. Fourth instance of the same defect in three days, in the
  paragraph that congratulates itself on re-measuring: the figures were right and the verb was not.)
  Growth with alien
  vocabulary erodes it (`0.2825` at 2000 added chunks — refused, but rising toward the bar as the
  corpus grows, while German filler at the same size falls to `0.0694`), because `base` is a ratio of
  IDF sums and drifts toward the query's plain matched-token fraction, which for this question is
  `3/10` — the threshold exactly. See `docs/eval-harness.md`. Mixed-language corpora are the case to
  watch; H-11. (Every figure in this paragraph was re-measured after the H-15 re-cut; the previous
  ones were taken against the 14-chunk corpus and were stale the moment it moved. Numbers in prose are
  owned by nothing — and this paragraph proved its own sentence: it carried `0.283` for a day with no
  test behind it AND no committed filler to reproduce it. Re-measured 2026-07-17 at `0.282525`
  against a filler that now lives in the test. The number was right; nothing was holding it.)
- [x] H-15 (One threshold, one meaning): a chunk cited as evidence clears the same bar that decides
  whether evidence exists at all.
  Falsifier: an answered question cites a chunk whose own score would have been refused as
  out-of-corpus had it been the best candidate.
  Closed 2026-07-16 **on the in-memory fixture path only** (the served Postgres path is H-14/H-15
  Postgres and is untouched). `retrieveChunks` filters `finalChunks` to the same threshold the gate
  uses, and a refusal returns no chunks at all. Probe: `retrieval.unit.test.ts` › "a citation clears
  the same bar as the gate" (3 tests). Mutation-falsified 2026-07-17 by deleting the filter: **2 of
  the 3 go red** (`cited art50-first-contact-accessibility below the evidence bar: expected 0.218509
  to be >= 0.3`, and "cites nothing at all when it refuses"). The third, "filters on the evidence
  score, not the fused rank score", stays GREEN under that mutation and is not a guard for this item —
  it pins the RRF-scale trap, a different defect. The neighbouring describe › "a duty is never
  retrievable without its exception" (3 tests) also stays green here; it guards the corpus cut.
  (This paragraph read "(5 tests) … All were mutation-falsified" until the fifth cross-vendor audit
  counted them. Both halves were false: the describe had 3 tests, and 1 of them survives the mutation.
  A test count in prose is owned by nothing, exactly like the numbers in H-10.)
  **`pnpm eval` does not verify this item and never did** — `scoreCitationAccuracy` is recall-only, so
  deleting the filter still leaves it `passed: true` at `citation-accuracy: 1` (measured 2026-07-17).
  The unit tests are the whole guard.
  **The threshold stopped being configurable 2026-07-17, and that is the actual fix.** It had been an
  option, `outOfCorpusThreshold`, and three commits went into guarding it against values that
  disabled the bar without failing: `NaN` (every comparison false, so nothing refuses AND every
  citation drops), `0` (scores are non-negative and `bestEvidenceScore` is `Math.max(0, …)`, so
  `best < 0` never refuses and `score >= 0` filters nothing — measured, the out-of-corpus banking
  question answered citing 8 chunks of the AI Act, H-10's defect reachable by config alone),
  `1e-300` and `Number.MIN_VALUE` (the same no-op wearing a positive sign, which the interval guard
  accepted), and any value above the score ceiling (refuses EVERY question, indistinguishably from a
  legitimate refusal, because "no evidence in the corpus" is this product's normal correct output).
  Provenance, because it is the point: `NaN` came from the fourth cross-vendor audit (gpt-5.6-sol).
  `0` came from autoreview **on that fix**, which had permitted it deliberately. The ceiling came from
  autoreview **on that fix**, which had dropped the upper bound reasoning that a too-high threshold
  "fails loudly" — it does not fail loudly, it fails invisibly. The subnormals came from the fifth
  cross-vendor audit (gpt-5.6-sol, 2026-07-17) **on that fix**, which had called the guard
  "three-sided and every side a probe". Each fix was written carefully; each reintroduced the same
  class of error one layer up; a fourth guard would have closed the fourth value and missed the fifth.
  What ended it was not a better interval. **Nothing ever passed the option** — not `runtime-app.ts`,
  not `demo-app.ts`, not the eval harness, not a config file, not an env var. Every one of those
  failures was reachable only through a knob with no caller, so the knob is gone and its whole failure
  class with it. `evidenceThreshold` is now one exported constant. The lesson is not about validation:
  three careful commits went into hardening a hole that existed because the option existed, and the
  option's own callers had been saying so the entire time.
  **The Postgres path had a related hole, not the identical one**, and the first version of this
  paragraph said "identical". It had no citation filter at all (`finalChunks` was
  `mergedCandidates.slice(0, topK)`), so a bad threshold there broke only the refusal flag; the
  citations were never dropped, because they were never filtered.
  **Half-closed on the Postgres path, 2026-07-17, and the split is the finding.**
  First, the premise had to go. The initial fix declined to touch this path at all, reasoning that
  "nothing in CI exercises that path, and an unverified filter would be a guess wearing a fix's
  clothes". **That reason was false, and false in this repo's signature way — a property asserted
  instead of probed, written into the very commit that retracts the habit.**
  `.github/workflows/ci.yml` provisions `pgvector/pgvector:pg16` and runs `pnpm check:full` →
  `pnpm test:integration`, and `acceptance.postgres-ingest.integration.test.ts` calls
  `retrievePostgresChunks` three times. The path was never unreachable; it spins up its own container
  and runs in 12 seconds. Autoreview caught the claim; a `grep` and one test run settled it.
  **CLOSED: a refusal cites nothing.** Measured against that live pgvector, before the fix: the
  out-of-corpus probe returned `outOfCorpus: true` **together with 8 chunks**, every one under the bar
  (dense `-0.026972`..`0.014098`). `refusedOutcome` copies `finalChunks` into the response and into
  the SIGNED LEDGER, and the operator UI renders them — so the served path refused a question and
  shipped eight pieces of evidence for the refusal. "No evidence exists" and "here are eight pieces of
  evidence" cannot both be the output, and that contradiction needs no calibrated scale to be wrong,
  which is why it is fixed now. Mutation-falsified with the neighbouring assertions masked:
  `a refusal must cite nothing: expected [ … ] to have a length of +0 but got 8`.
  **OPEN: a sub-threshold chunk can still be cited on an ANSWERED query here.** The first version of
  this fix closed that too, by copying the in-memory per-chunk filter across, and **it was wrong and
  autoreview caught it within the hour.** On the fixture that filter took an answered trace from 6
  citations to 1, and I read the drop as the fix working; it was the bug. Applying a bar calibrated
  for another scale is H-14 wearing a fix's clothes, and it is a worse defect than the one it closes.
  Reverted.
  **The reason first given for reverting was itself false**, and a cross-vendor audit refuted it a
  day later: "ts_rank_cd never exceeds `0.1`, so the filter necessarily deletes the lexical ranker."
  It does not necessarily do anything of the kind — `ts_rank_cd` reaches `0.3` at three occurrences
  of a query term and keeps climbing (see H-14). The `0.1` was the fixture's, not the ranker's.
  The real reason is worse for the bar rather than better: `max(dense, ts_rank_cd)` compares two
  incommensurable scales against a number calibrated for a third. A lexical `0.3` means "repeated a
  term three times"; a dense `0.3` means something else; the bar means "30% IDF-weighted coverage" on
  a path that is not this one. Such a filter would neither reliably keep evidence nor reliably drop
  non-evidence — it would sort chunks by an arithmetic accident. Deferring is right; the first
  justification for deferring was a universal claim generalized from a fixture, which is the H-10
  defect again. The per-chunk half waits on H-14: normalize the rankers, or give each its own
  criterion, then filter.
  H-14 stays open and is now MEASURED rather than read off the code — see below.
  Found by the third cross-vendor audit (gpt-5.5, 2026-07-16). `0.3` was applied at the QUERY level —
  "is there any evidence?" — while `finalChunks` returned `topK` regardless of each chunk's own score.
  So a chunk at `0.265` was simultaneously not-evidence (if best) and evidence (as a citation).
  Measured on "Wie muessen synthetische Inhalte gekennzeichnet werden?": gate opened by
  `art50-marking` at `0.487`, and the answer also cited `art50-deepfake` (`0.265`) and
  `art50-first-contact-accessibility` (`0.270`).
  **Pre-existing in class, made worse by me in degree.** Before the H-10 length-bonus fix those two
  scored `0.321` and `0.342` — above the bar — and only the 4th-ranked chunk sat below it. The
  multiplicative bonus rescaled every score downward while `0.3` stayed put, taking this question
  from zero sub-threshold citations to two.
  Not the same class as the duplicate-id blocker, and the difference matters: there, the gate was
  opened by text the citation did not show, which is a provenance lie. Here every cited chunk was
  real, retrieved, and did contain the claim extracted from it. This was an internal inconsistency
  in what "evidence" means, not a fabrication.

  **The filter alone would have made the product worse, and the measurement is why it did not ship
  alone.** Applied to the corpus as it was cut, `pnpm eval` went to `citation-accuracy: 0.8`,
  `passed: false`. One case regressed — the one tagged `ambiguous`: "Muss jeder KI-generierte Text
  offengelegt werden, wenn er veroeffentlicht wird?" kept `art50-public-interest-text` (the DUTY,
  `0.3286`) and dropped `art50-editorial-exception` (the EXCEPTION, `0.0491`). Since `renderPrompt`
  reads `finalChunks`, the exception was not merely uncited, it was absent from the model's prompt,
  leaving "yes, disclose" as the only available answer. That is a misrepresentation of Article 50 on
  the single golden case built to test duty-versus-exception, and it is the same shape
  `corpus-provenance.unit.test.ts` already guards the corpus against: verbatim text minus a clause is
  still not the law. An internal inconsistency traded for an external wrongness is a bad trade;
  correctness outranks consistency.
  **Root cause was the chunking, not the scorer.** Article 50 states a duty and then narrows it with
  a counter-clause naming its subject anaphorically. Four of the five exception chunks opened with the
  identical string "Diese Pflicht gilt nicht", the fifth with "Ist der Inhalt"; none named the duty it
  limited. Two measured consequences. An exception was unreachable from its own duty's question (it
  shared exactly ONE token with it — "wenn", a stopword). And an exception drew its neighbours: on the
  `contradictory` question, which names only the law-enforcement carve-out, the intended chunk did
  rank first (`0.9158`) but three unrelated exception chunks followed at `0.8152`, `0.7661` and
  `0.6623`, and `art50-deepfake` — a duty, not an exception — landed among them at `0.6075`. All five
  cleared the `0.3` bar and would be cited; four of them are wrong. The fifth exception,
  `art50-deepfake-artistic`, scored `0.0` and was invisible. So the exception chunks were not so much
  indistinguishable from each other as unanchored: they matched on shared counter-clause vocabulary
  ("Diese Pflicht gilt nicht") rather than on the duty they limit, which is also why the one that
  shares no such vocabulary vanished entirely. So the corpus was re-cut along the Absätze: **14 chunks → 8**, each duty
  carrying the exception that limits it. `art50-deepfake` already did this inline and was the
  precedent. The four `corpus provenance` tests pass unmodified — the re-cut is still verbatim and
  still accounts for the whole source in order.
  With both changes, `pnpm eval` is `passed: true` at citation-accuracy `1.0`. That number is not
  evidence for this item and must not be read as any: `scoreCitationAccuracy` is recall-only, so
  deleting the filter entirely still yields `passed: true` at `citation-accuracy: 1` (measured
  2026-07-17). What shows the filter is doing work rather than passing vacuously is the survivor
  count — 2, 1, 1, 5 and 0 out of a possible 8, instead of 8 every time — and what *guards* it is
  `retrieval.unit.test.ts` › "a citation clears the same bar as the gate", which goes red when the
  filter is removed. The eval is blind here; see `docs/eval-harness.md`.
  **What this cost:** citation granularity. A citation now points at a duty together with its
  carve-out rather than at either alone. For an audit-grade product that is arguably the better unit —
  a duty is never displayed without what limits it — but it is a real loss of precision and it is a
  choice, not a free win.
  **What it exposed, and did not fix:** retrieval leans on the model more than the retriever. Before
  the re-cut, `topK=8` against a 14-chunk corpus returned 57% of the corpus for every query and the
  model selected; citation-accuracy of `1.0` was partly an artifact of that dump. The margins are also
  thin: the `ambiguous` question clears the bar at `0.331`, and deleting the single word
  "veroeffentlicht" from it drops it under. That is H-11. Related: H-14 is the same shape as the
  original defect — one constant carrying more than one meaning.
- [ ] H-14 (The Postgres path's refusal threshold means something): the served API path refuses an
  out-of-corpus question, verified against a real question rather than gibberish.
  Falsifier: ask `retrievePostgresChunks` the CRR question against the Article 50 snapshot and watch
  it answer.
  **Measured 2026-07-17 against a live `pgvector/pgvector:pg16`.** This entry said "read from the
  code, not measured — no Postgres and no `BGE_M3_EMBEDDING_ENDPOINT` are reachable here" from
  2026-07-16 until then, and the first half of that was simply untrue: `pnpm test:integration` starts
  its own pgvector container and runs in 12 seconds, and CI has been provisioning one all along. The
  item did not need a new environment, it needed someone to run it. What IS still unreachable is a
  real BGE-M3 endpoint, so the dense figures below come from `HashEmbeddingProvider` and the item
  stays open on that ground — the *lexical* figures do not depend on the embedder and are production-
  real.
  - **`0.3` against `ts_rank_cd` means "repeats a query term three times".** Measured against
    `pgvector/pgvector:pg16`: one occurrence scores `0.1`, five score `0.5`, twenty score `2`, a
    hundred score `10`. `ts_rank_cd` is unnormalized and unbounded and rises linearly with term
    frequency, so comparing it to a coverage RATIO is not a strict-or-lenient question, it is a
    category error. Word count is not evidence, and that is the sharpest statement of this item.
    (This bullet read "**`ts_rank_cd` can never clear this bar** … the lexical ranker contributes
    nothing to the gate" until 2026-07-17, generalized from the fixture's `0`–`0.1`. A cross-vendor
    audit refuted it with the table above. The `0.1` was never a property of `ts_rank_cd` — it is a
    property of this fixture, where every chunk mentions a query term exactly once. A universal claim
    from three queries is the H-10 defect above, committed inside the item that documents it, in
    capitals.)
  - **The bar sits `0.04` above the dense noise floor.** Unrelated content scored ~`0.26` and the one
    genuinely relevant chunk scored `0.691897`, against a bar of `0.3`. The separation is real but the
    bar's placement inside it is luck, not calibration: it was tuned for a different scorer entirely.
  - **The dense score goes negative**, as predicted from the algebra and now observed: `-0.026972` on
    the out-of-corpus probe.
  The rest of the item, read from the code and still unverified against a real embedder:
  - `src/modules/retrieval/postgres-retrieval.ts` never calls the `retrieveChunks` that H-10 fixed:
    it runs its own SQL rankers and only shares the fusion and the bar. `/demo` is hardened; the API
    routes in `runtime-app.ts` are not. Both are served by `src/commands/server.ts`. (This bullet
    read "redeclares `defaultThreshold = 0.3` (line 38)" until 2026-07-17. That duplicate constant is
    gone — both paths now read the one exported `evidenceThreshold` — but the item is unchanged by
    that: sharing the constant does not make it mean the same thing on both sides, which is precisely
    what this item is.)
  - The constant `0.3` was calibrated for an IDF-weighted coverage ratio in `[0,1]`. It is applied
    to two other scales: `1 - (embedding <=> $2::vector)` (pgvector's `<=>` is a cosine DISTANCE in
    `[0,2]`, so this lands in `[-1,1]` and can be NEGATIVE, and its baseline between unrelated German
    sentences is high) and `ts_rank_cd(...)` (unbounded, typically an order of magnitude smaller).
    `bestEvidenceScore` takes the `max` of the two seeded at 0, so the larger-scaled dense score
    decides the gate and a negative dense score is hidden from it. Three scales, one constant.
    **This is why the citation filter cannot simply be copied from the other path**, which was tried
    on 2026-07-17 and reverted the same hour: `max(dense, ts_rank_cd)` against `0.3` compares two
    incommensurable scales against a number calibrated for a third, so it sorts chunks by an
    arithmetic accident rather than selecting evidence. Closing that half of H-15 here requires
    closing this item first.
  - `plainto_tsquery('simple', ...)` applies no stemming and no stopword removal, so the lexical
    half carries the same German-stopword exposure H-10 just fixed on the other path.
  - The only refusal probe is still `"zzzz yyyyy xxxx"`
    (`acceptance.postgres-ingest.integration.test.ts`) — noise that yields an empty tsquery, and
    measurement confirms it: its bm25 scores are `0`..`0` exactly. It cannot distinguish a working
    gate from an absent one, and this item does not close until a real German question with no
    evidence in the snapshot is refused here, the way H-10's CRR question is on the other path. What
    the probe DID earn once assertions were put on its payload is the H-15 closure above: it proved
    the refusal was returning 8 chunks.
  Found by the same cross-vendor audit as the H-10 retraction.
- [x] H-13 (The required check is not load-flaky): no unit test spawns a subprocess under the unit
  project's 5s default timeout. Falsifier: run `pnpm check:fast` under CPU contention and watch a
  timeout fail the build.
  Closed 2026-07-16. The six subprocess/ingest tests in
  `acceptance.eval-report-ui-security.unit.test.ts` carry an explicit 30s timeout; the other three are
  synchronous and keep the 5s default. Verified against the falsifier on the same loaded machine that
  produced the failures below: five consecutive runs at the DEFAULT timeout, 9 of 9 green each time.
  The file stays in the `unit` project deliberately — moving it to `integration`, the other fix path,
  would have dropped it out of `check:fast` and called that a fix.
  Was open and pre-existing, and **the falsifier fired**. Surfaced by the cross-vendor audit, which
  saw `acceptance.eval-report-ui-security.unit.test.ts:101` and `:137` time out at 5000ms while
  running concurrently with other work. They were green in 6 of 6 runs when first investigated, at
  2194ms and 2056ms.
  Reproduced under real CPU contention on 2026-07-16, on a **clean `origin/main` worktree with no
  local changes**, three consecutive runs of the same untouched code: 4 failed, 5 failed, 3 failed of
  9 — every failure `Test timed out in 5000ms`. A fourth run passed 9 of 9. Same code, different
  outcome per run, which is the definition of the defect. At `--testTimeout=30000` all 9 pass. The
  measurement matters beyond this item: during the H-15 work these timeouts appeared in the suite and
  looked exactly like a regression, and the only way to tell was to run untouched `main` beside it.
  A flaky required check does not merely fail builds, it launders real regressions as noise and noise
  as regressions.
  They shell out to `pnpm eval` and `pnpm report` inside the *unit* project, leaving ~2.3x margin on a
  5s default, which is not enough for a required status check on a shared runner.
  Fixed in its own commit rather than bundled into H-15, because it is a separate criterion and
  bundling it would have hidden it. It stopped being deferrable when it blocked the H-15 commit twice
  through the pre-commit hook — the honest options there were to fix the gate or to bypass it with
  `--no-verify`, and weakening a gate to get past it is how gates die.
- [ ] H-12 (The ledger attests the corpus, not its name): `corpusSnapshotHash` — carried by fixture
  chunks, eval outcomes and every demo ledger row — is recomputable from the corpus it claims to
  pin. Falsifier: change a byte of the corpus and the hash the ledger records does not move.
  Open. Found by the cross-vendor audit (gpt-5.5 via `codex exec`, 2026-07-16); missed by both the
  Claude executor and its own H-9 work. `src/modules/eval/eval.ts:65` sets
  `fixtureCorpusSnapshotHash = sha256Hex(pinnedEvalTuple.corpusSnapshotId)`, so the hash is
  `sha256("corpus-fixtures:v1") = 06f96f902c45…` — a hash of the label's own spelling. The demo
  prints it as "Korpusstand: corpus-fixtures:v1 · 06f96f902c45" and the Ed25519 chain signs it. The
  actual source snapshot hashes to `036d4f54d609…`, which appears nowhere in the ledger.
  This is the seam H-9 does not reach: H-9 proves the fixture matches its snapshot, but the chain
  from snapshot to signed ledger row is a constant, so a third party cannot verify the corpus from
  the artefact the product exists to produce. Pre-existing, not introduced by this wave, and the
  most load-bearing open item on the thesis — a hash-chained ledger attesting a string literal is
  the failure mode the whole project is a rebuttal to.
  Fix path: derive the hash from a canonical manifest over the source snapshots' SHA-256 values and
  thread it through `loadFixtureCorpus`, eval, and the demo ledger rows.
- [ ] H-11 (The eval measures retrieval, not vocabulary): the golden set is answerable by the eval's
  retrieval path without being written in the corpus's exact inflections. Falsifier: rewording a
  case into natural German that a competent reader would use flips it from answered to refused.
  Open, and it gates H-1. Both eval candidate passes (`dense` and `bm25`) run the same lexical
  scorer over fixture text — no embedding is computed, despite the pinned tuple naming `bge-m3` —
  and matching is exact-token with no stemming. In German that is brittle: `maschinenlesbare
  Kennzeichnung` does not match `maschinenlesbaren Format ... gekennzeichnet`. Two of the five
  existing cases had to be reworded into the law's own inflections to pass, which is the tell. A
  100-case set authored this way would measure whether questions echo the statute's wording, not
  whether retrieval works.
  German compounds are the sharpest edge of this and the H-10 fix exposed a third instance:
  "Wie muessen **KI-Ausgaben** gekennzeichnet werden?" cannot match a corpus that says "Ausgaben",
  because nothing splits the compound. It scores `0.273` and is refused, though Article 50 plainly
  answers it. It had been passing in `demo.integration.test.ts` purely on the additive bm25 length
  bonus — the same artifact that let a banking question be answered with AI-Act text. Every question
  that bonus was propping up is a question this path cannot actually retrieve: the demo chip
  (2026-07-16, reworded), this test, and any of the 100 to come. That is the concrete cost of
  leaving H-11 open, and the reason it gates H-1. Resolution is a design call (real embeddings on the eval path vs German
  stemming vs an explicitly lexical harness with the limit stated); see `docs/eval-harness.md`
  § What this harness measures.
- [x] H-2 (AI reliability): every model and embedding call retries 429 and 5xx with bounded
  exponential backoff plus jitter, under a per-call timeout, with a defined fallback.
  Falsifier: a simulated 429 crashes the call, or no retry path exists in the provider.
  Closed: `src/lib/resilience.ts` (backoff+jitter), embedding fetch wrapped and unit-tested
  (429-then-200 retries, 503 exhausts, 400 does not); Anthropic SDK client sets explicit
  `maxRetries`+`timeout`; the Claude-CLI provider retries on a timed-out invocation (transient),
  not on a deterministic non-zero exit. Mutation-falsified: disabling the retry guard turns 4
  tests red.
- [x] H-3 (Fault tolerance): every outbound network call (Postgres, embedding endpoint,
  model) carries a timeout; a dead dependency fails fast instead of hanging. Falsifier: a
  call constructed with no timeout, or a stalled dependency hangs the request.
  Closed: embedding fetch uses `AbortSignal.timeout`; `src/lib/pg-pool.ts` sets
  `connectionTimeoutMillis` + `statement_timeout` + `query_timeout` on both pools; Anthropic
  client `timeout`.
- [x] H-4 (Supply chain): a dependency scan runs in CI and fails the build on a high or
  critical advisory. Falsifier: no dependency-scan step in CI, or a seeded high advisory does
  not fail it. Closed: `pnpm audit` targets an npm endpoint that now returns 410, so CI runs
  osv-scanner (pinned image) over `pnpm-lock.yaml` and gates on HIGH/CRITICAL via
  `scripts/osv-check.ts` (`src/lib/osv-gate.ts`, unit-tested against seeded critical/low/
  malformed fixtures). Fails closed: advisories with no CVSS `max_severity` fall back to the
  severity label, and an advisory whose severity cannot be established at all is flagged rather
  than passed; CI treats any osv-scanner exit other than 0/1 as an infra failure. CI-run
  caveat: the gate logic is unit-verified; the osv-scanner invocation itself proves on the
  first CI run of this branch. First real run flagged two HIGH advisories already on main: hono
  (CVSS 7.1, shipped web framework) was bumped to 4.12.30; the vite dev-server advisory
  (GHSA-fx2h-pf6j-xcff, dev/test-only, not on the shipped Linux surface, vitest 4.1.5 pins the
  vulnerable version) is a fail-closed triage allowlist entry in `osv-gate.ts` with a reason and
  a 2026-10-15 review date. `partitionFindings` blocks any advisory not on that list.
- [ ] H-5 (Alerting): a health and error-rate alert fires without a user reporting the break.
  Falsifier: no alert wired; a downed container is learned from a visitor.
- [ ] H-6 (Data durability): an automated backup of the ledger and Postgres exists with a
  tested restore that re-verifies the signed chain. Falsifier: no automated backup, or a
  restore that has never been exercised end to end.
- [ ] H-7 (Reliability SLO): a written, measured success target (p95 latency and success
  rate) exists and is measured against the running deploy. Falsifier: a target with no
  measurement, or no target at all.
- [ ] H-8 (DDL vs fault-tolerance timeout): schema and index DDL (notably the HNSW build) is
  not governed by the short pool `statement_timeout`/`query_timeout`, so a one-time index
  build on a populated table cannot fail as if it were a slow runtime query. Falsifier:
  `CREATE INDEX ... USING hnsw` on a populated `corpus_chunks` exceeds the pool timeout and
  `ensureSchema()` fails. Deferred from wave 1 (Forge audit NF-2, low live exposure: the index
  is built `IF NOT EXISTS` against an empty table and filled by fast incremental inserts). Fix
  path: lift the timeout for the DDL transaction only (`SET LOCAL statement_timeout = 0` plus a
  per-query `query_timeout` override), verified against a real Postgres.

## Test strategy

| ISC | type | check | threshold | tool |
|---|---|---|---|---|
| H-1 | eval | golden-set size and a seeded-regression run | >=100 cases; regression fails gate | `wc -l`, `pnpm eval` |
| H-2 | unit | fake transport returns 429 then 200; assert retried | retries, succeeds, bounded | vitest + mutation-falsify |
| H-3 | unit | call with a stalled fake dependency | rejects on timeout, no hang | vitest + mutation-falsify |
| H-4 | ci | audit step present and fails on a seeded advisory | non-zero exit on high+ | CI run |
| H-5 | manual | kill a container, confirm the alert fires | alert observed | deploy-side, Marius gate |
| H-6 | integration | back up, wipe, restore, verify chain | chain verifies post-restore | `pnpm audit:verify` |
| H-7 | manual | SLO doc plus a measured sample from the deploy | target stated and measured | runbook + probe |

## Waves

Ordered by dependency and blast radius (self-contained code first, deploy-side infra last).

- **Wave 1 (self-contained code, no infra):** H-2, H-3, H-4. Landed 2026-07-15 (PR #16).
- **Wave 2 (evals, the single most load-bearing item):** H-1. Dataset authoring; own PR.
  Wave 2a landed the corpus foundation the dataset has to stand on: H-9 and H-10, both found by
  trying to author the dataset and discovering what was underneath it. H-1 itself is blocked on the
  H-11 design call.
- **Wave 3 (deploy-side, needs an operator hand on the VPS/CF):** H-5, H-6, H-7. Backup
  cron, alert wiring, SLO measurement against the live deploy.

Each wave: code and test together, mutation-falsify the test, full gate green, mandatory
cross-vendor audit (model id read from the auditing vendor's own banner, builder never the
auditor), remediate first-hand, then land. No wave closes the production-ready claim on its
own; the claim holds only when every criterion above is checked.
