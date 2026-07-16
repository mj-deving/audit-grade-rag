import { describe, expect, it } from "vitest";
import { loadFixtureCorpus, pinnedEvalTuple } from "../eval/eval.js";
import { inverseDocumentFrequencies, retrieveChunks } from "./retrieval.js";

// Guards the out-of-corpus refusal, which is the promise the demo console makes in as many words:
// "Das System antwortet nur mit belegter Evidenz aus dem freigegebenen Korpus."
//
// Until 2026-07-16 that promise was decided by German stopwords. The score was an unweighted term
// count over the query, so "Welche Eigenkapitalquote verlangt die CRR fuer Sparkassen im Jahr
// 2030?" — a banking-supervision question with zero content words in the corpus — matched only
// "die", "fuer" and "im" and scored exactly 0.300 against the 0.3 threshold. It answered. The
// defect was masked by a paraphrased corpus whose chunks were short enough to stay under the line;
// restoring the verbatim (longer) regulation text pushed it over.
//
// The failure mode is silent and gets worse as the corpus grows, so these tests assert the
// mechanism (weighting), not just the current verdict.

const options = { activeSnapshotId: pinnedEvalTuple.corpusSnapshotId } as const;

async function corpus() {
  return loadFixtureCorpus("corpus-fixtures");
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
    //
    // The relation is asserted rather than an absolute number, because the absolute score depends
    // on corpus size: with only 14 chunks a stopword like "im" still earns real IDF, and this
    // question lands at ~0.19 — refused, but with less margin than the ratio suggests. That
    // margin widens as the corpus grows (a stopword's IDF falls as its document frequency rises),
    // which is the opposite of the pre-IDF behaviour, where growth ate the margin.
    const chunks = await corpus();
    const best = (question: string): number => {
      const trace = retrieveChunks(question, chunks, options);
      return Math.max(
        0,
        ...trace.vectorCandidates.map((chunk) => chunk.retrievalScore),
        ...trace.bm25Candidates.map((chunk) => chunk.retrievalScore),
      );
    };
    const stopwordsOnly = best(
      "Welche Eigenkapitalquote verlangt die CRR fuer Sparkassen im Jahr 2030?",
    );
    const covered = best(
      "Welche Pflichten gelten fuer die direkte Interaktion mit natuerlichen Personen und fuer Ausgaben in einem maschinenlesbaren Format?",
    );
    expect(stopwordsOnly).toBeLessThan(covered / 2);
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
