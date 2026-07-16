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
    expect(rare).toBeGreaterThan(3);
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

describe("refusal under corpus growth", () => {
  // THE property this file exists for. The shipped claim was "the margin widens as the corpus
  // grows". It lived in a comment, was never probed, and was backwards. Growth is exactly the
  // direction this project is about to move in (H-1), so growth is what gets asserted.
  it("holds the refusal at every corpus size, without losing margin", async () => {
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

    // Monotonic non-erosion. Under the additive length bonus this ran 0.114 → 0.026 → -0.069 →
    // -0.105, and the sign flip IS the defect: a negative margin means the demo answered a banking
    // question by citing the AI Act as its evidence. It now runs 0.196 → 0.195 → 0.195 → 0.214.
    for (const [index, margin] of margins.entries()) {
      const previous = margins[index - 1];
      if (previous !== undefined) {
        expect(
          margin,
          `margin must not erode as the corpus grows (step ${String(index)})`,
        ).toBeGreaterThan(previous - 0.01);
      }
    }
  });
});
