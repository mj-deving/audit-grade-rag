import { describe, expect, it } from "vitest";
import {
  defaultEmbeddingCachePath,
  denseScoresFromCache,
  loadEmbeddingCache,
} from "../eval/embedding-cache.js";
import { defaultCorpusFixtureDir, loadFixtureCorpus, pinnedEvalTuple } from "../eval/eval.js";
import { type GateProbe, loadGateProbes } from "../eval/gate-probes.js";
import { evidenceThreshold, retrieveChunks } from "./retrieval.js";

const activeSnapshotId = pinnedEvalTuple.corpusSnapshotId;

/**
 * H-11's open half, measured rather than asserted.
 *
 * The falsifier is a GATE property: rewording a case into natural German that a competent reader
 * would use must not flip it from answered to refused. These probes measure whether ANY threshold on
 * the gate's scale could satisfy that, by scoring 12 questions Article 50 answers against 6 it does
 * not. The test asserts the wrong answers the current gate gives, on purpose — the numbers are the
 * evidence for the entry in `docs/HARDENING.md`, and every figure quoted there is pinned here at the
 * precision it is published at.
 *
 * These tests must NOT be "fixed" by loosening the bar. If a change makes the gate separable, the
 * separations below go positive and these assertions go red, which is the signal to close H-11.
 */

async function lexicalGateScores(
  probes: readonly GateProbe[],
): Promise<ReadonlyMap<string, { readonly best: number; readonly refused: boolean }>> {
  const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
  return new Map(
    probes.map((probe) => {
      const trace = retrieveChunks(probe.question, chunks, { activeSnapshotId });
      // The gate reads the bm25 pass alone (see `bestEvidenceScores`), so its input is that pass's
      // best score. Read from the trace rather than recomputed, so this cannot drift from the gate.
      const best = Math.max(0, ...trace.bm25Candidates.map((chunk) => chunk.retrievalScore));
      return [probe.id, { best, refused: trace.outOfCorpus }];
    }),
  );
}

describe("H-11: the lexical evidence gate cannot separate natural German from out-of-corpus", () => {
  it("refuses 7 of the 12 questions Article 50 answers, including both cases that were reworded to pass", async () => {
    const probes = await loadGateProbes();
    const scores = await lexicalGateScores(probes);
    const refusedButAnswerable = probes
      .filter((probe) => probe.class === "in-corpus" && scores.get(probe.id)?.refused === true)
      .map((probe) => probe.id);

    // Pinned by id, not by count: which questions the gate gets wrong is the finding.
    expect(refusedButAnswerable).toEqual([
      "in-reworded-multihop-natural",
      "in-reworded-contradictory-natural",
      "in-chatbot",
      "in-deepfake",
      "in-emotion",
      "in-marking-duty-compound",
      "in-marking-duty-systemausgaben",
    ]);
  });

  it("answers none of the 6 questions Article 50 does not answer", async () => {
    const probes = await loadGateProbes();
    const scores = await lexicalGateScores(probes);
    for (const probe of probes.filter((p) => p.class === "out-of-corpus")) {
      expect(scores.get(probe.id)?.refused, `${probe.id} must be refused`).toBe(true);
    }
  });

  // The load-bearing claim of the H-11 entry. Not "the bar is mistuned" — no bar exists. The worst
  // answerable question scores BELOW the best unanswerable one, so every threshold on this scale
  // either refuses an answerable question or answers an unanswerable one.
  it("scores the worst answerable question below the best unanswerable one, so no threshold on this scale works", async () => {
    const probes = await loadGateProbes();
    const scores = await lexicalGateScores(probes);
    const worstIn = Math.min(
      ...probes.filter((p) => p.class === "in-corpus").map((p) => scores.get(p.id)?.best ?? 0),
    );
    const bestOut = Math.max(
      ...probes.filter((p) => p.class === "out-of-corpus").map((p) => scores.get(p.id)?.best ?? 0),
    );

    expect(worstIn).toBeLessThan(bestOut);
    // The three figures docs/HARDENING.md publishes for this, at the precision it publishes them.
    expect(worstIn).toBeCloseTo(0.0874, 4);
    expect(bestOut).toBeCloseTo(0.2357, 4);
    expect(worstIn - bestOut).toBeCloseTo(-0.1483, 4);
  });

  // The compound-noun probe H-11 quotes. The entry claimed it scores 0.273 and is refused; on the
  // 8-chunk corpus H-15 cut, it scores 0.4583 and is ANSWERED. Pinned so the quoted figure cannot
  // rot again.
  it("answers the compound-noun probe on the current corpus, contrary to the figure H-11 used to quote", async () => {
    const probes = await loadGateProbes();
    const scores = await lexicalGateScores(probes);
    const compound = scores.get("in-compound-marking");

    expect(compound?.refused).toBe(false);
    expect(compound?.best).toBeCloseTo(0.4583, 4);
    expect(compound?.best).toBeGreaterThan(evidenceThreshold);
  });
});

describe("H-11: cosine separates where the lexical scale cannot, by too little to calibrate a bar in", () => {
  it("separates the two classes by 0.0180, with the nearest miss a hard negative", async () => {
    const probes = await loadGateProbes();
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const cache = await loadEmbeddingCache(defaultEmbeddingCachePath);
    const topCosine = new Map(
      probes.map((probe) => [
        probe.id,
        Math.max(...denseScoresFromCache(cache, probe.question, chunks).values()),
      ]),
    );
    const worstIn = Math.min(
      ...probes.filter((p) => p.class === "in-corpus").map((p) => topCosine.get(p.id) ?? 0),
    );
    const bestOut = Math.max(
      ...probes.filter((p) => p.class === "out-of-corpus").map((p) => topCosine.get(p.id) ?? 0),
    );

    // Unlike the lexical scale, this one IS separable — that is why Option B is about cosine at all.
    expect(worstIn).toBeGreaterThan(bestOut);
    expect(worstIn).toBeCloseTo(0.4931, 4);
    expect(bestOut).toBeCloseTo(0.4751, 4);
    expect(worstIn - bestOut).toBeCloseTo(0.018, 4);
    // The upper end of the answerable band, which H-14 quotes beside the unrelated-text floor.
    expect(
      Math.max(
        ...probes.filter((p) => p.class === "in-corpus").map((p) => topCosine.get(p.id) ?? 0),
      ),
    ).toBeCloseTo(0.7123, 4);
    // And the window is bounded by exactly these two probes, which is why the entry names them.
    expect(topCosine.get("in-reworded-contradictory-natural")).toBeCloseTo(worstIn, 10);
    expect(topCosine.get("out-dsgvo-breach")).toBeCloseTo(bestOut, 10);

    // The sharpest single illustration that the two scales disagree about the same question. This
    // probe is the WORST answerable one lexically (`0.0874`, under four of the six out-of-corpus
    // probes) and is comfortably inside the answerable band on cosine.
    expect(topCosine.get("in-marking-duty-compound")).toBeCloseTo(0.6184, 4);
  });
});

describe("H-14: the 0.3 constant, measured against a real embedder's cosine scale", () => {
  // H-14's constant, measured on the scale the served path actually applies it to. `0.3` was
  // calibrated for an IDF-weighted coverage ratio; against real bge-m3 cosine it sits at the
  // unrelated-text floor rather than above it, so it separates almost nothing.
  it("puts the 0.3 coverage-ratio constant at the unrelated-text floor of the cosine scale (H-14)", async () => {
    const probes = await loadGateProbes();
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const cache = await loadEmbeddingCache(defaultEmbeddingCachePath);
    const outOfCorpus = probes
      .filter((probe) => probe.class === "out-of-corpus")
      .map((probe) => ({
        id: probe.id,
        cosine: Math.max(...denseScoresFromCache(cache, probe.question, chunks).values()),
      }));

    const clearing = outOfCorpus.filter((row) => row.cosine >= evidenceThreshold);
    expect(clearing).toHaveLength(5);
    const missing = outOfCorpus.filter((row) => row.cosine < evidenceThreshold);
    expect(missing.map((row) => row.id)).toEqual(["out-mindestlohn"]);
    expect(evidenceThreshold - (missing[0]?.cosine ?? 0)).toBeCloseTo(0.0029, 4);
    // The floor and ceiling of unrelated German legal text on this corpus, as H-14 quotes them.
    expect(Math.min(...outOfCorpus.map((row) => row.cosine))).toBeCloseTo(0.2971, 4);
    expect(Math.max(...outOfCorpus.map((row) => row.cosine))).toBeCloseTo(0.4751, 4);
  });

  // Every normalization that would let the gate avoid an absolute constant on a scale whose baseline
  // shifts with the query. Measured, because "normalize it" is the obvious next suggestion and it
  // does not work here: each of these ranks a hard negative above an answerable question.
  it("is not rescued by any per-query normalization of the cosine distribution", async () => {
    const probes = await loadGateProbes();
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const cache = await loadEmbeddingCache(defaultEmbeddingCachePath);
    const distributions = new Map(
      probes.map((probe) => [
        probe.id,
        [...denseScoresFromCache(cache, probe.question, chunks).values()].sort((a, b) => b - a),
      ]),
    );
    const stat = (id: string, f: (values: readonly number[]) => number): number =>
      f(distributions.get(id) ?? [0]);
    const mean = (values: readonly number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const separation = (f: (values: readonly number[]) => number): number =>
      Math.min(...probes.filter((p) => p.class === "in-corpus").map((p) => stat(p.id, f))) -
      Math.max(...probes.filter((p) => p.class === "out-of-corpus").map((p) => stat(p.id, f)));

    // top - mean, and its variance-scaled form, both put an out-of-corpus probe on top.
    expect(separation((v) => (v[0] ?? 0) - mean(v))).toBeCloseTo(-0.0119, 4);
    expect(
      separation((v) => {
        const m = mean(v);
        const sd = Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
        return sd === 0 ? 0 : ((v[0] ?? 0) - m) / sd;
      }),
    ).toBeCloseTo(-0.8916, 4);
    expect(separation((v) => (v[0] ?? 0) / mean(v))).toBeCloseTo(-0.0685, 4);
    expect(separation((v) => (v[0] ?? 0) - (v[1] ?? 0))).toBeCloseTo(-0.04, 4);
    expect(separation(mean)).toBeCloseTo(-0.007, 4);
  });
});

describe("H-11/H-14: this probe set cannot tell a scale-mixed gate from a scale-respecting one", () => {
  // H-14, restated as a measurement. `max(lexical, cosine)` against one constant is the scale mix the
  // repo already reverted once on the Postgres path. This probe set CANNOT catch that defect: the mix
  // separates the two classes by exactly the cosine-only figure, because the single probe where the
  // lexical score is the larger of the two sits far inside its own class and so never touches the
  // window. A reviewer measuring only the separation would see a scale-mixed gate and a
  // scale-respecting one as the same gate. That is why this set does not close H-14, and why the mix
  // is not shipped on the strength of it.
  //
  // The first version of this test asserted the stronger claim that cosine dominates on EVERY probe,
  // generalized from the class-boundary figures. `in-golden-contradictory` refuted it on the first
  // run: lexical `0.7414` against cosine `0.6920`. Both figures are now pinned.
  it("cannot distinguish a scale-mixed gate from a cosine-only one, which is why this set does not close H-14", async () => {
    const probes = await loadGateProbes();
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const cache = await loadEmbeddingCache(defaultEmbeddingCachePath);
    const lexical = await lexicalGateScores(probes);
    const scored = probes.map((probe) => ({
      probe,
      lexical: lexical.get(probe.id)?.best ?? 0,
      cosine: Math.max(...denseScoresFromCache(cache, probe.question, chunks).values()),
    }));
    const separation = (score: (row: (typeof scored)[number]) => number): number =>
      Math.min(...scored.filter((r) => r.probe.class === "in-corpus").map(score)) -
      Math.max(...scored.filter((r) => r.probe.class === "out-of-corpus").map(score));

    expect(separation((r) => Math.max(r.lexical, r.cosine))).toBeCloseTo(
      separation((r) => r.cosine),
      10,
    );
    expect(separation((r) => Math.max(r.lexical, r.cosine))).toBeCloseTo(0.018, 4);

    // Exactly one probe is scored by the lexical half under the mix, and it is not near the window.
    const lexicalWins = scored.filter((r) => r.lexical > r.cosine);
    expect(lexicalWins.map((r) => r.probe.id)).toEqual(["in-golden-contradictory"]);
    expect(lexicalWins[0]?.lexical).toBeCloseTo(0.7414, 4);
    expect(lexicalWins[0]?.cosine).toBeCloseTo(0.692, 4);
  });
});
