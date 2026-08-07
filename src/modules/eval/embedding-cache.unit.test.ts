import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../lib/hash.js";
import { buildEmbeddingCache, denseScoresFromCache } from "./embedding-cache.js";
import { defaultCorpusFixtureDir, loadFixtureCorpus } from "./eval.js";

const dimension = 8;

function unit(index: number): readonly number[] {
  const vector = Array.from({ length: dimension }, () => 0);
  vector[index % dimension] = 1;
  return vector;
}

function cacheFile(vectors: Record<string, readonly number[]>) {
  return {
    provenance: {
      embeddingModelVersion: "bge-m3@1024-v1",
      endpointConfigHash: "sha256:test",
      dimension,
      generatedAt: "2026-07-17T00:00:00.000Z",
      textCount: Object.keys(vectors).length,
    },
    vectors,
  };
}

describe("embedding cache", () => {
  it("looks up a vector by the sha256 of its text", () => {
    const cache = buildEmbeddingCache(cacheFile({ [sha256Hex("hallo")]: unit(0) }), "test");
    expect(cache.lookup("hallo")).toEqual(unit(0));
  });

  it("throws on a miss instead of falling back to a lexical vector", () => {
    const cache = buildEmbeddingCache(cacheFile({ [sha256Hex("hallo")]: unit(0) }), "test");
    expect(() => cache.lookup("welt")).toThrow(/no cached embedding/u);
  });

  it("rejects a vector whose dimension disagrees with provenance", () => {
    expect(() => buildEmbeddingCache(cacheFile({ [sha256Hex("x")]: [1, 0] }), "test")).toThrow(
      /dimension 2, expected 8/u,
    );
  });

  it("rejects an all-zero vector at load", () => {
    expect(() =>
      buildEmbeddingCache(
        cacheFile({ [sha256Hex("x")]: Array.from({ length: dimension }, () => 0) }),
        "test",
      ),
    ).toThrow(/all zeros/u);
  });

  it("rejects a non-finite vector at load", () => {
    const bad = [...unit(0)];
    bad[1] = Number.NaN;
    expect(() => buildEmbeddingCache(cacheFile({ [sha256Hex("x")]: bad }), "test")).toThrow(
      /non-finite/u,
    );
  });

  it("builds cosine dense scores over every active chunk, and throws if a chunk is uncached", async () => {
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const query = "Wie muessen synthetische Inhalte gekennzeichnet werden?";
    const vectors: Record<string, readonly number[]> = { [sha256Hex(query)]: unit(0) };
    chunks.forEach((chunk, index) => {
      vectors[sha256Hex(chunk.chunkText)] = unit(index);
    });
    const cache = buildEmbeddingCache(cacheFile(vectors), "test");
    const scores = denseScoresFromCache(cache, query, chunks);
    expect(scores.size).toBe(chunks.length);
    for (const chunk of chunks) {
      expect(scores.has(chunk.chunkId)).toBe(true);
    }

    const missing = buildEmbeddingCache(cacheFile({ [sha256Hex(query)]: unit(0) }), "test");
    expect(() => denseScoresFromCache(missing, query, chunks)).toThrow(/no cached embedding/u);
  });
});
