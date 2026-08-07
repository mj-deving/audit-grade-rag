import { describe, expect, it } from "vitest";
import {
  defaultCorpusFixtureDir,
  defaultGoldenSetPath,
  loadFixtureCorpus,
  loadGoldenSet,
  pinnedEvalTuple,
} from "../eval/eval.js";
import { retrieveChunks } from "./retrieval.js";

const activeSnapshotId = pinnedEvalTuple.corpusSnapshotId;

// H-11 Option A. Dense cosine scores from the embedding cache drive candidate ORDER, and nothing
// else. The refusal gate and the citation filter read the lexical pass alone, so no dense score can
// open a refusal or admit a chunk the lexical bar rejected. These probes assert both halves against
// the real fixture corpus.
describe("dense scores drive ranking (ISC-3)", () => {
  it("orders the dense candidate pass by the supplied cosine scores (ISC-3)", async () => {
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const [first, second] = chunks;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      return;
    }
    const preferFirst = new Map(chunks.map((chunk) => [chunk.chunkId, 0]));
    preferFirst.set(first.chunkId, 0.9);
    const preferSecond = new Map(chunks.map((chunk) => [chunk.chunkId, 0]));
    preferSecond.set(second.chunkId, 0.9);

    const a = retrieveChunks("beliebige frage", chunks, {
      activeSnapshotId,
      denseScores: preferFirst,
    });
    const b = retrieveChunks("beliebige frage", chunks, {
      activeSnapshotId,
      denseScores: preferSecond,
    });
    expect(a.vectorCandidates[0]?.chunkId).toBe(first.chunkId);
    expect(b.vectorCandidates[0]?.chunkId).toBe(second.chunkId);
  });
});

// The refusal gate and the citation filter read the lexical pass alone, so no dense score can open a
// refusal or admit a chunk the lexical bar rejected. Both halves asserted against the real corpus.
describe("dense scores never move the evidence gate (ISC-4)", () => {
  it("cannot open the refusal gate on an out-of-corpus question, even with every dense score maxed (ISC-4)", async () => {
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const cases = await loadGoldenSet(defaultGoldenSetPath);
    const refused = cases.find((c) => c.expected_outcome === "refused-out-of-corpus");
    expect(refused, "golden set has an out-of-corpus case").toBeDefined();
    if (refused === undefined) {
      return;
    }
    const baseline = retrieveChunks(refused.question, chunks, { activeSnapshotId });
    expect(baseline.outOfCorpus).toBe(true);
    // If cosine leaked into the gate, an all-1.0 dense map would flip this to answered.
    const maxed = new Map(chunks.map((chunk) => [chunk.chunkId, 1]));
    const withDense = retrieveChunks(refused.question, chunks, {
      activeSnapshotId,
      denseScores: maxed,
    });
    expect(withDense.outOfCorpus).toBe(true);
    expect(withDense.finalChunks).toHaveLength(0);
  });

  it("cannot drop citations on an answered question, even with every dense score zeroed (ISC-4)", async () => {
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const cases = await loadGoldenSet(defaultGoldenSetPath);
    const answered = cases.find((c) => c.expected_outcome === "answered");
    expect(answered, "golden set has an answered case").toBeDefined();
    if (answered === undefined) {
      return;
    }
    const baseline = retrieveChunks(answered.question, chunks, { activeSnapshotId });
    expect(baseline.outOfCorpus).toBe(false);
    const baselineCited = new Set(baseline.finalChunks.map((chunk) => chunk.chunkId));
    // If cosine leaked into the gate, an all-0 dense map would empty finalChunks and refuse. The
    // cited SET must be identical (on this <=topK-survivor corpus dense reorders nothing away).
    const zeroed = new Map(chunks.map((chunk) => [chunk.chunkId, 0]));
    const withDense = retrieveChunks(answered.question, chunks, {
      activeSnapshotId,
      denseScores: zeroed,
    });
    expect(withDense.outOfCorpus).toBe(false);
    expect(new Set(withDense.finalChunks.map((chunk) => chunk.chunkId))).toEqual(baselineCited);
  });
});
