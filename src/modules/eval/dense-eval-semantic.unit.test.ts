import { describe, expect, it } from "vitest";
import { retrieveChunks } from "../retrieval/retrieval.js";
import {
  defaultEmbeddingCachePath,
  denseScoresFromCache,
  loadEmbeddingCache,
} from "./embedding-cache.js";
import {
  defaultCorpusFixtureDir,
  defaultGoldenSetPath,
  loadFixtureCorpus,
  loadGoldenSet,
  pinnedEvalTuple,
} from "./eval.js";

const activeSnapshotId = pinnedEvalTuple.corpusSnapshotId;

// H-11 ISC-7. With the committed real bge-m3 cache, the dense pass ranks by cosine, not by lexical
// term overlap. Two things must hold for the pin to be honest: the dense order is genuinely semantic
// (it diverges from the lexical order, so it is not a relabelled lexical pass), and the expected
// evidence for each answerable golden case is still surfaced by that semantic ranking.
describe("real bge-m3 dense ranking is semantic (ISC-7)", () => {
  it("orders candidates differently from the lexical pass, and still surfaces the expected evidence", async () => {
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const cases = await loadGoldenSet(defaultGoldenSetPath);
    const cache = await loadEmbeddingCache(defaultEmbeddingCachePath);
    expect(cache.provenance.embeddingModelVersion).toBe(pinnedEvalTuple.embeddingModelVersion);

    let anyOrderDiverges = false;
    let anyExpectedRankedFirst = false;
    for (const goldenCase of cases) {
      const dense = denseScoresFromCache(cache, goldenCase.question, chunks);
      const semantic = retrieveChunks(goldenCase.question, chunks, {
        activeSnapshotId,
        denseScores: dense,
      });
      const lexical = retrieveChunks(goldenCase.question, chunks, { activeSnapshotId });
      const denseOrder = semantic.vectorCandidates.map((chunk) => chunk.chunkId);
      const lexicalOrder = lexical.vectorCandidates.map((chunk) => chunk.chunkId);
      if (JSON.stringify(denseOrder) !== JSON.stringify(lexicalOrder)) {
        anyOrderDiverges = true;
      }
      for (const expected of goldenCase.expected_chunks ?? []) {
        const denseRank = denseOrder.indexOf(expected);
        // The expected evidence must be reachable by the semantic ranking, not ranked out of sight.
        expect(
          denseRank,
          `${goldenCase.id}: expected ${expected} missing from dense order ${denseOrder.join(",")}`,
        ).toBeGreaterThanOrEqual(0);
        if (denseRank === 0) {
          anyExpectedRankedFirst = true;
        }
      }
    }
    // Genuinely semantic: at least one case's cosine order is not its lexical order.
    expect(anyOrderDiverges).toBe(true);
    // Sanity that the semantic ranking is not adversarial to the evidence: on at least one answerable
    // case the expected chunk is the top dense candidate.
    expect(anyExpectedRankedFirst).toBe(true);
  });
});
