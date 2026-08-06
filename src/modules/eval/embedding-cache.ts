import { readFile } from "node:fs/promises";
import type { CorpusChunk } from "../../domain/types.js";
import { sha256Hex } from "../../lib/hash.js";
import { cosineSimilarity, type Vector } from "../../lib/vector.js";

export const defaultEmbeddingCachePath = "eval/embeddings/bge-m3-v1.json";

/**
 * Provenance a third party needs to reproduce the cache from the published corpus + golden set: which
 * model produced it, the config hash of the endpoint it came from, the vector dimension, and how many
 * texts it covers. Keys in `vectors` are `sha256Hex(text)` so the cache is content-addressed — the
 * same text always resolves to the same vector, and a corpus edit that changes a chunk's text is a
 * cache MISS (loud) rather than a stale hit.
 */
type EmbeddingCacheProvenance = {
  readonly embeddingModelVersion: string;
  readonly endpointConfigHash: string;
  readonly dimension: number;
  readonly generatedAt: string;
  readonly textCount: number;
};

type EmbeddingCacheFile = {
  readonly provenance: EmbeddingCacheProvenance;
  readonly vectors: Readonly<Record<string, Vector>>;
};

export type EmbeddingCache = {
  readonly provenance: EmbeddingCacheProvenance;
  /** Vector for a text, keyed by sha256 of the text. Throws on a miss — never falls back to lexical. */
  lookup(text: string): Vector;
};

export async function loadEmbeddingCache(path: string): Promise<EmbeddingCache> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return buildEmbeddingCache(parsed, path);
}

export function buildEmbeddingCache(parsed: unknown, source: string): EmbeddingCache {
  const file = asCacheFile(parsed, source);
  const dimension = file.provenance.dimension;
  // Validate every vector at load, so a lookup can trust what it returns. Same rejection rules as the
  // live embedding client (finite, non-zero, right dimension): an all-zero or NaN vector defeats
  // cosine downstream, and a wrong dimension is a model/cache drift bug.
  for (const [key, vector] of Object.entries(file.vectors)) {
    if (vector.length !== dimension) {
      throw new Error(
        `${source}: cached vector ${key} has dimension ${String(vector.length)}, expected ${String(dimension)}`,
      );
    }
    if (!vector.every((value) => Number.isFinite(value))) {
      throw new Error(`${source}: cached vector ${key} contains a non-finite value`);
    }
    if (vector.every((value) => value === 0)) {
      throw new Error(
        `${source}: cached vector ${key} is all zeros, which has no cosine direction`,
      );
    }
  }
  return {
    provenance: file.provenance,
    lookup(text: string): Vector {
      const key = sha256Hex(text);
      const vector = file.vectors[key];
      if (vector === undefined) {
        throw new Error(
          `${source}: no cached embedding for text sha256 ${key}. Regenerate the cache with scripts/generate-eval-embeddings.ts — the eval never falls back to a lexical vector.`,
        );
      }
      return vector;
    },
  };
}

/**
 * Build the dense-score map `retrieveChunks` consumes: chunkId -> cosine(query, chunk), both vectors
 * read from the cache. Every active chunk is looked up, so a chunk missing from the cache throws here
 * rather than silently scoring 0 downstream.
 */
export function denseScoresFromCache(
  cache: EmbeddingCache,
  query: string,
  chunks: readonly CorpusChunk[],
): ReadonlyMap<string, number> {
  const queryVector = cache.lookup(query);
  return new Map(
    chunks.map((chunk) => [
      chunk.chunkId,
      cosineSimilarity(queryVector, cache.lookup(chunk.chunkText)),
    ]),
  );
}

function asCacheFile(parsed: unknown, source: string): EmbeddingCacheFile {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${source}: embedding cache must be a JSON object`);
  }
  const candidate = parsed as { readonly provenance?: unknown; readonly vectors?: unknown };
  const provenance = asProvenance(candidate.provenance, source);
  const vectors = asVectors(candidate.vectors, source);
  return { provenance, vectors };
}

function asProvenance(value: unknown, source: string): EmbeddingCacheProvenance {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${source}: embedding cache is missing a provenance object`);
  }
  const candidate = value as Record<string, unknown>;
  const dimension = candidate["dimension"];
  if (typeof dimension !== "number" || !Number.isInteger(dimension) || dimension < 8) {
    throw new Error(`${source}: provenance.dimension must be an integer >= 8`);
  }
  const embeddingModelVersion = candidate["embeddingModelVersion"];
  const endpointConfigHash = candidate["endpointConfigHash"];
  const generatedAt = candidate["generatedAt"];
  const textCount = candidate["textCount"];
  if (
    typeof embeddingModelVersion !== "string" ||
    typeof endpointConfigHash !== "string" ||
    typeof generatedAt !== "string" ||
    typeof textCount !== "number"
  ) {
    throw new Error(`${source}: provenance is missing required string/number fields`);
  }
  return { embeddingModelVersion, endpointConfigHash, dimension, generatedAt, textCount };
}

function asVectors(value: unknown, source: string): Readonly<Record<string, Vector>> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${source}: embedding cache is missing a vectors object`);
  }
  const out: Record<string, Vector> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(raw) || !raw.every((v): v is number => typeof v === "number")) {
      throw new Error(`${source}: cached vector ${key} is not an array of numbers`);
    }
    out[key] = raw;
  }
  return out;
}
