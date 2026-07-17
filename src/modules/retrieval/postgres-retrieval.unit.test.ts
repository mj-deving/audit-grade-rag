import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "../ingest/embedding.js";
import { retrievePostgresChunks } from "./postgres-retrieval.js";

// The served path had no unit test at all, which is why a NaN could live in it. The integration test
// needs Docker and covers the happy fixture; this file covers what the SQL can hand back when the
// world is not well-behaved. A fake pool is enough for that, and it runs in `check:fast`.
//
// The defect this file exists for, found by a cross-vendor audit: `bestEvidenceScore` was
// `Math.max(0, ...scores)`, and `Math.max` is NaN-poisoning — one NaN makes the whole max NaN, and
// `NaN < threshold` is false, so the gate concluded evidence EXISTS and answered. A refusal failing
// OPEN is the worst outcome this product has, and it was reachable from a real input: pgvector
// returns NaN for cosine distance from an all-zero vector.
//
// It is also the same NaN that the FIRST audit in this chain found in `parseThreshold`. That one was
// fixed at the config boundary, and nobody asked whether NaN could arrive in the DATA. Fixing a
// defect at one entry point is not fixing the class.

const options = { activeSnapshotId: "snap-1" } as const;

function row(id: string, score: number, method: "dense" | "bm25") {
  return {
    chunk_id: id,
    doc_id: "doc-1",
    source_document_id: "src-1",
    source_type: "txt" as const,
    source_path: "a.txt",
    page_start: 1,
    page_end: 1,
    char_start: 0,
    char_end: 10,
    token_start: 0,
    token_end: 2,
    chunk_index: 0,
    chunk_text: `text for ${id} via ${method}`,
    chunk_sha256: "sha",
    corpus_snapshot_id: "snap-1",
    corpus_snapshot_hash: "hash",
    extraction_warnings: [],
    ocr_used: false,
    retrieval_score: score,
  };
}

// The two queries are distinguished the way `postgres-retrieval.ts` builds them: the dense one
// interpolates the vector cast, the lexical one calls ts_rank_cd.
function poolReturning(
  dense: readonly (readonly [string, number])[],
  bm25: readonly (readonly [string, number])[],
): Pool {
  return {
    query: (sql: string) =>
      Promise.resolve({
        rows: sql.includes("embedding <=>")
          ? dense.map(([id, score]) => row(id, score, "dense"))
          : bm25.map(([id, score]) => row(id, score, "bm25")),
      }),
  } as unknown as Pool;
}

const embedder: EmbeddingProvider = {
  profile: { id: "fake", modelVersion: "fake@1", dimension: 3, configHash: "cfg" },
  embed: () => Promise.resolve([0.1, 0.2, 0.3]),
};

describe("the served refusal cannot fail open", () => {
  it("refuses when every dense score is NaN", async () => {
    // `'[0,0,0]'::vector <=> anything` is NaN in pgvector — verified against pgvector/pgvector:pg16.
    // So this is a real row shape, not a contrived one.
    const trace = await retrievePostgresChunks(
      poolReturning(
        [
          ["a", Number.NaN],
          ["b", Number.NaN],
        ],
        [["a", 0.05]],
      ),
      "eine Frage ohne Evidenz",
      options,
      embedder,
    );
    expect(trace.outOfCorpus, "NaN is not evidence").toBe(true);
    expect(trace.finalChunks, "and a refusal cites nothing").toHaveLength(0);
  });

  it("refuses when ONE score is NaN among real ones", async () => {
    // The poisoning case, and the one that actually shipped. Every finite score here is far below
    // the bar, so the honest answer is a refusal; the single NaN used to flip it to an answer.
    const trace = await retrievePostgresChunks(
      poolReturning(
        [
          ["a", 0.05],
          ["b", Number.NaN],
          ["c", 0.02],
        ],
        [["a", 0.01]],
      ),
      "eine Frage ohne Evidenz",
      options,
      embedder,
    );
    expect(trace.outOfCorpus, "one NaN must not defeat the gate").toBe(true);
    expect(trace.finalChunks).toHaveLength(0);
  });

  it("refuses on ±Infinity rather than answering", async () => {
    // The other end, and the more tempting bug: ±Infinity compares fine, and +Infinity would open
    // the gate on garbage. `Number.isFinite` rejects both, which is why the filter is written on
    // finiteness rather than on `Number.isNaN`.
    const trace = await retrievePostgresChunks(
      poolReturning([["a", Number.NEGATIVE_INFINITY]], [["a", Number.NEGATIVE_INFINITY]]),
      "eine Frage ohne Evidenz",
      options,
      embedder,
    );
    expect(trace.outOfCorpus).toBe(true);
  });
});

describe("a chunk the ranker could not rank is not evidence", () => {
  it("does not let a NaN chunk be cited on an answered query", async () => {
    // The counterweight to the two above AND its own property: real evidence exists here, so the
    // query is answered — but the chunk the ranker could not rank must not appear as a citation.
    // This needs no calibrated scale: NaN is not a low score, it is the absence of one.
    const trace = await retrievePostgresChunks(
      poolReturning(
        [
          ["good", 0.9],
          ["nan", Number.NaN],
        ],
        [["good", 0.05]],
      ),
      "eine belegte Frage",
      options,
      embedder,
    );
    expect(trace.outOfCorpus, "real evidence must still answer").toBe(false);
    expect(trace.finalChunks.map((chunk) => chunk.chunkId)).toEqual(["good"]);
  });

  it("gives a NaN-dense chunk no rank weight from the ranker that failed on it", async () => {
    // The shape the SQL actually produces, and the one the test above misses. `bm25CandidatesFor`
    // selects 50 rows ordered by rank, so a non-matching chunk comes back with a FINITE 0 — present
    // in the lexical list, not absent from it. So `nan` here IS a legitimate lexical candidate that
    // the lexical ranker scored, honestly, as nothing.
    //
    // What must not happen is the dense pass paying it anyway. A NaN sorts unpredictably
    // (`compareRetrievedChunks` subtracts, and every comparison against NaN is false), so before the
    // fix `nan` took an arbitrary dense POSITION and RRF paid rank weight for it — fusion reads rank,
    // not score, so the NaN never had to clear anything to be rewarded. Filtering each ranker's list
    // for finiteness before fusion is what stops that; filtering after does not, and the first
    // version of this fix filtered after.
    //
    // NOTE it is still cited. That is not this defect: with a valid lexical score of 0 it is exactly
    // as citable as any 0.26-scoring chunk, i.e. the per-chunk evidence filter deferred to H-14. The
    // first version of this test asserted `["good"]` and was wrong — it demanded a property that
    // needs the deferred filter, and passed only because `nan` was missing from its bm25 rows. A
    // test can be red for the wrong reason too.
    const trace = await retrievePostgresChunks(
      poolReturning(
        [
          ["good", 0.9],
          ["nan", Number.NaN],
        ],
        [
          ["good", 0.05],
          ["nan", 0],
        ],
      ),
      "eine belegte Frage",
      options,
      embedder,
    );
    expect(trace.outOfCorpus).toBe(false);
    const fused = new Map(trace.mergedCandidates.map((chunk) => [chunk.chunkId, chunk]));
    // `good` is ranked first by both rankers: 1/(60+0+1) twice.
    expect(fused.get("good")?.retrievalScore).toBeCloseTo(2 / 61, 6);
    // `nan` is ranked second by the lexical pass and by NOTHING else: 1/(60+1+1), once. Doubling
    // this is the signature of the dense pass having paid for a score it could not compute.
    expect(fused.get("nan")?.retrievalScore, "a NaN score must buy no rank weight").toBeCloseTo(
      1 / 62,
      6,
    );
  });

  it("still answers on ordinary finite evidence", async () => {
    // A gate that refused everything would satisfy every test above.
    const trace = await retrievePostgresChunks(
      poolReturning(
        [
          ["a", 0.8],
          ["b", 0.4],
        ],
        [["a", 0.05]],
      ),
      "eine belegte Frage",
      options,
      embedder,
    );
    expect(trace.outOfCorpus).toBe(false);
    expect(trace.finalChunks.length).toBeGreaterThan(0);
  });
});
