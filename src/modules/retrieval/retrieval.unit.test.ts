import { describe, expect, it } from "vitest";
import type { CorpusChunk } from "../../domain/types.js";
import { loadFixtureCorpus, pinnedEvalTuple } from "../eval/eval.js";
import { inverseDocumentFrequencies, retrieveChunks } from "./retrieval.js";

// Guards the out-of-corpus refusal, which is the promise the demo console makes in as many words:
// "Das System antwortet nur mit belegter Evidenz aus dem freigegebenen Korpus."
//
// Until 2026-07-16 that promise was decided by German stopwords. The score was an unweighted term
// count over the query, so "Welche Eigenkapitalquote verlangt die CRR fuer Sparkassen im Jahr
// 2030?" — a banking-supervision question with zero content words in the corpus — matched only
// "die", "fuer" and "im" and scored exactly 0.300 against the 0.3 threshold. It answered.
//
// IDF weighting was the first fix, and it was shipped with a claim that the margin now WIDENS as
// the corpus grows. That claim was false and backwards, and no test here checked it — it lived in
// a comment while the tests only ever asserted a relation at one corpus size (14 chunks). A
// cross-vendor audit found it with a live repro: adding 50 unrelated chunks took the CRR question
// to 0.369 and it was answered. The real culprit was the bm25 length bonus, an additive term that
// never looked at the query and saturated at 0.2 — two thirds of the threshold.
//
// So the sweep below is the point of this file. A property claimed over corpus growth is tested
// over corpus growth.

const options = { activeSnapshotId: pinnedEvalTuple.corpusSnapshotId } as const;
const threshold = 0.3;

const outOfCorpusQuestion =
  "Welche Eigenkapitalquote verlangt die CRR fuer Sparkassen im Jahr 2030?";
const coveredQuestion =
  "Welche Pflichten gelten fuer die direkte Interaktion mit natuerlichen Personen und fuer Ausgaben in einem maschinenlesbaren Format?";
// Verbatim from `eval/golden/v1.jsonl` (`art50-ambiguous-text-disclosure`), and verbatim on purpose:
// the first draft of these tests used a shortened paraphrase of it, which the corpus REFUSES. It
// scores 0.331 against the 0.3 bar and dropping the single word "veroeffentlicht" puts it under.
// Inventing a question that happens to pass is how a test starts measuring the author instead of the
// system. (The narrowness of that margin is H-11's problem, not this file's.)
const dutyWithExceptionQuestion =
  "Muss jeder KI-generierte Text offengelegt werden, wenn er veroeffentlicht wird?";

// German legal prose from other domains: ordinary stopword density, nothing about capital ratios.
// This is what growing the corpus actually looks like (H-1 wants 100+ cases over more law), as
// opposed to a synthetic filler whose vocabulary is alien to the language.
const unrelatedGermanChunks = [
  "Der Verantwortliche trifft die geeigneten Massnahmen, um die Rechte der betroffenen Person zu wahren.",
  "Die Aufsichtsbehoerde unterrichtet den Antragsteller ueber den Stand des Verfahrens innerhalb eines Monats.",
  "Diese Verordnung gilt fuer die Verarbeitung personenbezogener Daten im Rahmen der Taetigkeiten einer Niederlassung.",
  "Der Betreiber stellt sicher, dass die Anlage nach dem Stand der Technik betrieben wird.",
  "Die Mitgliedstaaten erlassen die Vorschriften ueber Sanktionen und treffen die erforderlichen Massnahmen.",
  "Ein Vertrag kommt zustande, wenn die Parteien sich ueber die wesentlichen Bestandteile geeinigt haben.",
];

async function corpus() {
  return loadFixtureCorpus("corpus-fixtures");
}

function grownBy(base: readonly CorpusChunk[], count: number): readonly CorpusChunk[] {
  const template = base[0];
  if (template === undefined) {
    throw new Error("fixture corpus is empty");
  }
  return [
    ...base,
    ...Array.from({ length: count }, (_, index) => ({
      ...template,
      chunkId: `unrelated-${String(index)}`,
      chunkText: unrelatedGermanChunks[index % unrelatedGermanChunks.length] ?? "",
    })),
  ];
}

function bestScore(question: string, chunks: readonly CorpusChunk[]): number {
  const trace = retrieveChunks(question, chunks, options);
  return Math.max(
    0,
    ...trace.vectorCandidates.map((chunk) => chunk.retrievalScore),
    ...trace.bm25Candidates.map((chunk) => chunk.retrievalScore),
  );
}

describe("inverseDocumentFrequencies", () => {
  it("weights a term in every chunk far below a term in one chunk", async () => {
    const weights = inverseDocumentFrequencies(await corpus());
    const ubiquitous = weights.idf.get("die");
    const rare = weights.idf.get("eigenkapitalquote") ?? weights.unseenTermIdf;
    expect(ubiquitous).toBeDefined();
    expect(ubiquitous ?? 0).toBeGreaterThan(0);
    expect(ubiquitous ?? 0).toBeLessThan(0.2);
    // The RATIO is the property; the absolute value is a fixture detail. This asserted `rare > 3`
    // until the corpus was re-cut from 14 chunks to 8, and then failed at 2.890 — which is exactly
    // `ln(18)`, i.e. `unseenTermIdf` at 8 chunks. The constant silently encoded the corpus size,
    // because every IDF here grows like `ln(corpusSize)`. A fixture that is allowed to move must not
    // be pinned by a number that only holds at one of its sizes.
    expect(rare).toBeGreaterThan((ubiquitous ?? 0) * 20);
  });

  it("prices an unseen term against the real corpus size, not a constant", async () => {
    // A fixed fallback would misprice exactly the unmatched content words that must dominate an
    // out-of-corpus query's denominator.
    const all = await corpus();
    const wide = inverseDocumentFrequencies(all);
    const narrow = inverseDocumentFrequencies(all.slice(0, 2));
    expect(wide.unseenTermIdf).toBeGreaterThan(narrow.unseenTermIdf);
  });
});

describe("out-of-corpus refusal", () => {
  it("refuses a question whose only overlap with the corpus is stopwords", async () => {
    const trace = retrieveChunks(
      "Welche Eigenkapitalquote verlangt die CRR fuer Sparkassen im Jahr 2030?",
      await corpus(),
      options,
    );
    expect(trace.outOfCorpus).toBe(true);
  });

  it("scores a stopword-only match far below a real match, not just under the threshold", async () => {
    // The regression that bit: the same question scored 0.300 against a 0.3 threshold. Asserting
    // only `outOfCorpus === true` would pass again at 0.299, one longer chunk away from breaking.
    const chunks = await corpus();
    expect(bestScore(outOfCorpusQuestion, chunks)).toBeLessThan(
      bestScore(coveredQuestion, chunks) / 2,
    );
  });

  it("never lets the bm25 length bonus stand in for evidence", async () => {
    // The mechanism behind the corpus-growth sweep, pinned directly so a refactor cannot quietly
    // restore the additive form. A chunk that carries none of the query's information must score 0
    // on the bm25 pass too — being short is not evidence.
    const base = await corpus();
    const template = base[0];
    expect(template).toBeDefined();
    const trace = retrieveChunks(
      "Eigenkapitalquote Sparkassen",
      [{ ...(template as CorpusChunk), chunkId: "short-unrelated", chunkText: "alpha beta" }],
      options,
    );
    expect(trace.bm25Candidates.length).toBeGreaterThan(0);
    for (const candidate of trace.bm25Candidates) {
      expect(candidate.retrievalScore, "a zero-evidence chunk must earn no bm25 bonus").toBe(0);
    }
  });

  it("still answers and ranks a question the corpus does cover", async () => {
    // The counterweight: a refusal gate that refuses everything would pass every test above.
    const trace = retrieveChunks(
      "Welche Pflichten gelten fuer die direkte Interaktion mit natuerlichen Personen und fuer Ausgaben in einem maschinenlesbaren Format?",
      await corpus(),
      options,
    );
    expect(trace.outOfCorpus).toBe(false);
    expect(trace.finalChunks.map((chunk) => chunk.chunkId)).toContain("art50-interaction");
  });
});

describe("a citation clears the same bar as the gate", () => {
  // H-15. `0.3` used to be a query-level gate only — it asked "is there ANY evidence?" of the best
  // candidate, while `finalChunks` returned topK regardless of each chunk's own score. So a chunk at
  // 0.265 was simultaneously not-evidence (it would have refused the query had it ranked first) and
  // evidence (rendered into the prompt, validated against, signed into the ledger as a citation).
  it("never returns a chunk that would itself have been refused", async () => {
    const chunks = await corpus();
    for (const question of [coveredQuestion, dutyWithExceptionQuestion]) {
      const trace = retrieveChunks(question, chunks, options);
      expect(trace.outOfCorpus, `${question}: must be answerable`).toBe(false);
      expect(trace.finalChunks.length, `${question}: must cite something`).toBeGreaterThan(0);
      for (const cited of trace.finalChunks) {
        // Re-derive each cited chunk's own evidence score the way the gate does, from the ranker
        // passes rather than the post-fusion value.
        const own = Math.max(
          0,
          ...[...trace.vectorCandidates, ...trace.bm25Candidates]
            .filter((candidate) => candidate.chunkId === cited.chunkId)
            .map((candidate) => candidate.retrievalScore),
        );
        expect(
          own,
          `${question}: cited ${cited.chunkId} below the evidence bar`,
        ).toBeGreaterThanOrEqual(threshold);
      }
    }
  });

  it("filters on the evidence score, not the fused rank score", async () => {
    // The trap this fix could have walked into. `finalChunks` carries RRF scores (~0.016-0.032, i.e.
    // 1/(60+rank)), not the [0,1] evidence score. Filtering `retrievalScore` after fusion against 0.3
    // would drop every chunk on every query and refuse the entire corpus — while looking correct.
    const trace = retrieveChunks(coveredQuestion, await corpus(), options);
    expect(trace.finalChunks.length).toBeGreaterThan(0);
    for (const chunk of trace.finalChunks) {
      expect(chunk.retrievalScore, "post-fusion scores live on the RRF scale").toBeLessThan(0.1);
    }
  });

  it("cites nothing at all when it refuses", async () => {
    // A refusal that still hands back eight sub-threshold chunks is the same contradiction wearing a
    // different hat.
    const trace = retrieveChunks(outOfCorpusQuestion, await corpus(), options);
    expect(trace.outOfCorpus).toBe(true);
    expect(trace.finalChunks).toHaveLength(0);
  });

  it("refuses a threshold that would silently disable the bar", async () => {
    // A threshold that is not a number turns the bar off in BOTH directions at once, silently, because
    // every comparison against NaN is false: `best < NaN` is false so nothing is ever refused, and
    // `score >= NaN` is false so every citation is dropped. The result answers a question while citing
    // nothing — the precise shape the describe above exists to make impossible, reachable by passing a
    // bad config instead of by a retrieval bug.
    const chunks = await corpus();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.5, 1.5]) {
      expect(
        () => retrieveChunks(coveredQuestion, chunks, { ...options, outOfCorpusThreshold: bad }),
        `threshold ${String(bad)} must be rejected, not silently applied`,
      ).toThrow(/out_of_corpus_threshold/u);
    }
  });

  it("still honours a valid explicit threshold", async () => {
    // The guard must reject bad config without also rejecting the tuning the option exists for.
    const chunks = await corpus();
    const strict = retrieveChunks(coveredQuestion, chunks, { ...options, outOfCorpusThreshold: 1 });
    expect(strict.outOfCorpus, "nothing scores a perfect 1.0, so a bar at 1 refuses").toBe(true);
    expect(strict.finalChunks).toHaveLength(0);
  });
});

describe("a duty is never retrievable without its exception", () => {
  // The corpus-level half of H-15, and the reason the filter could land at all. Article 50 states an
  // obligation and then narrows it with "Diese Pflicht gilt nicht …", naming its subject
  // anaphorically. Cut into its own chunk, such an exception shares ONE token with any question
  // phrased in its duty's words ("wenn", a stopword) and is indistinguishable from the four other
  // exceptions opening with the same five words. Measured before the re-cut: "Muss jeder KI-generierte
  // Text offengelegt werden, wenn er veroeffentlicht wird?" scored the duty at 0.3286 and its
  // editorial exception at 0.0491, so filtering citations to the bar dropped the exception out of the
  // prompt entirely and the only answer left was "yes, disclose" — a misrepresentation of the law on
  // the one golden case built to test duty-versus-exception.
  it("has no chunk that opens with a bare anaphor", async () => {
    for (const chunk of await corpus()) {
      expect(
        chunk.chunkText.trim(),
        `${chunk.chunkId} opens by referring to a duty it does not contain`,
      ).not.toMatch(/^(Diese Pflicht gilt nicht|Ist der Inhalt)/u);
    }
  });

  it("keeps the editorial exception in the same chunk as the duty it limits", async () => {
    const chunks = await corpus();
    const duty = chunks.find((chunk) => chunk.chunkId === "art50-public-interest-text");
    expect(duty, "art50-public-interest-text must exist").toBeDefined();
    expect(duty?.chunkText).toMatch(/Diese Pflicht gilt nicht/u);
    expect(duty?.chunkText).toMatch(/redaktionelle Verantwortung/u);
  });

  it("answers the duty question with the exception present in the cited text", async () => {
    // End to end: the question that broke, against the re-cut corpus, through the filter.
    const trace = retrieveChunks(
      "Muss jeder KI-generierte Text offengelegt werden, wenn er veroeffentlicht wird?",
      await corpus(),
      options,
    );
    expect(trace.outOfCorpus).toBe(false);
    const ids = trace.finalChunks.map((chunk) => chunk.chunkId);
    expect(ids).toContain("art50-public-interest-text");
    const cited = trace.finalChunks.find((chunk) => chunk.chunkId === "art50-public-interest-text");
    expect(cited?.chunkText, "the carve-out must reach the prompt with the duty").toMatch(
      /Diese Pflicht gilt nicht/u,
    );
  });
});

describe("refusal under corpus growth", () => {
  // THE property this file exists for. The shipped claim was "the margin widens as the corpus
  // grows". It lived in a comment, was never probed, and was backwards. Growth is exactly the
  // direction this project is about to move in (H-1), so growth is what gets asserted.
  it("holds the refusal clear of the bar at every corpus size", async () => {
    const base = await corpus();
    const margins = [0, 10, 50, 300].map((added) => {
      const chunks = grownBy(base, added);
      const size = String(chunks.length);
      const outScore = bestScore(outOfCorpusQuestion, chunks);
      expect(outScore, `${size} chunks: out-of-corpus question must stay refused`).toBeLessThan(
        threshold,
      );
      expect(
        bestScore(coveredQuestion, chunks),
        `${size} chunks: covered question must stay answerable`,
      ).toBeGreaterThan(threshold);
      return threshold - outScore;
    });

    // The FLOOR is the property, and no trend is asserted, because the margin has no trend: it dips
    // and recovers. Measured over this sweep it runs 0.2195 → 0.2048 → 0.1969 → 0.2140, and out to
    // 2008 chunks it reaches 0.2306.
    //
    // This block previously asserted non-erosion with 0.01 of slack plus `margins.at(-1) >
    // margins.at(0)` — "growth must end better than it started". Both were wrong in the same way, and
    // the way is instructive: that last line is a weakened restatement of the false H-10 claim this
    // file exists to prevent. It passed only because the four sweep points and the 14-chunk fixture
    // happened to make it true. Re-cutting the corpus to 8 chunks broke it (0.2195 → 0.2140, ending
    // 0.0055 BELOW where it started) without anything about the refusal getting worse — the refusal
    // in fact got stronger at every size. An assertion that fails when the thing it guards improves
    // is measuring the fixture, not the property.
    //
    // What the demo actually promises is that an unevidenced question is refused. So what gets
    // asserted is that the refusal never approaches the bar at any corpus size: margin > 0.19 means
    // the CRR question never scores above 0.11, roughly a third of the 0.3 threshold. That holds
    // whether or not the margin happens to widen.
    for (const [index, margin] of margins.entries()) {
      expect(
        margin,
        `refusal margin must stay clear of the bar at every corpus size (step ${String(index)})`,
      ).toBeGreaterThan(0.19);
    }

    // The endpoints, pinned and measured. A floor alone would still pass if every score drifted
    // together, and drift is exactly how the additive bonus hid: it moved all of them at once.
    expect(margins.at(0) ?? 0).toBeCloseTo(0.2195, 3);
    expect(margins.at(-1) ?? 0).toBeCloseTo(0.214, 3);
  });
});
