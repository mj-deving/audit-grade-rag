import { createHash } from "node:crypto";
import type { EmbeddingProfile } from "../../domain/types.js";
import { sha256Hex } from "../../lib/hash.js";
import {
  isRetryableHttpStatus,
  isRetryableNetworkError,
  RetryableHttpError,
  retryAsync,
  type Sleep,
} from "../../lib/resilience.js";

export const defaultEmbeddingModel = "bge-m3@1024-v1";
export const defaultEmbeddingDimension = 1024;

export type EmbeddingVector = readonly number[];
export type EmbeddingProvider = {
  readonly profile: EmbeddingProfile;
  embed(text: string): Promise<EmbeddingVector>;
};

type EmbeddingProviderEnv = {
  readonly BGE_M3_EMBEDDING_ENDPOINT?: string;
  readonly BGE_M3_API_KEY?: string;
};

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly profile: EmbeddingProfile = {
    id: "hash-fixture",
    modelVersion: "hash-fixture@1024-v1",
    dimension: defaultEmbeddingDimension,
    configHash: sha256Hex("hash-fixture@1024-v1"),
  };

  embed(text: string): Promise<EmbeddingVector> {
    return Promise.resolve(embedText(text, this.profile.dimension));
  }
}

export type BgeM3EmbeddingOptions = {
  readonly endpoint: string;
  readonly apiKey?: string;
  // Per-call ceiling for a single embedding request; a slow endpoint fails fast (H-3).
  readonly timeoutMs?: number;
  // Retries after the first attempt on 429/5xx and network errors, backoff+jitter (H-2).
  readonly retries?: number;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: Sleep;
  readonly random?: () => number;
};

export class BgeM3EmbeddingProvider implements EmbeddingProvider {
  readonly profile: EmbeddingProfile;
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: Sleep | undefined;
  private readonly random: (() => number) | undefined;

  constructor(options: BgeM3EmbeddingOptions) {
    // Surface a misconfigured endpoint at construction time instead of retrying a doomed fetch.
    try {
      void new URL(options.endpoint);
    } catch {
      throw new Error(`BGE_M3_EMBEDDING_ENDPOINT is not a valid URL: ${options.endpoint}`);
    }
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep;
    this.random = options.random;
    this.profile = {
      id: "bge-m3",
      modelVersion: defaultEmbeddingModel,
      dimension: defaultEmbeddingDimension,
      configHash: sha256Hex(`bge-m3:${options.endpoint}`),
    };
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const embedding = await retryAsync((): Promise<EmbeddingVector> => this.fetchEmbedding(text), {
      retries: this.retries,
      baseDelayMs: 200,
      maxDelayMs: 2_000,
      isRetryable: isRetryableNetworkError,
      ...(this.sleep === undefined ? {} : { sleep: this.sleep }),
      ...(this.random === undefined ? {} : { random: this.random }),
    });
    if (embedding.length !== this.profile.dimension) {
      throw new Error(
        `bge-m3 embedding dimension ${String(embedding.length)} did not match ${String(
          this.profile.dimension,
        )}`,
      );
    }
    return embedding;
  }

  private async fetchEmbedding(text: string): Promise<EmbeddingVector> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ input: [text], model: "bge-m3" }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const detail = `bge-m3 embedding call failed with ${String(response.status)}`;
      if (isRetryableHttpStatus(response.status)) {
        throw new RetryableHttpError(response.status, detail);
      }
      throw new Error(detail);
    }
    const payload: unknown = await response.json();
    return readEmbedding(payload);
  }

  private headers(): Record<string, string> {
    if (this.apiKey !== undefined && this.apiKey.length > 0) {
      return { "content-type": "application/json", Authorization: `Bearer ${this.apiKey}` };
    }
    return { "content-type": "application/json" };
  }
}

export function requireConfiguredEmbeddingProvider(
  env: EmbeddingProviderEnv = process.env,
): EmbeddingProvider {
  const endpoint = env.BGE_M3_EMBEDDING_ENDPOINT;
  if (endpoint === undefined || endpoint.length === 0) {
    throw new Error("BGE_M3_EMBEDDING_ENDPOINT is required for bge-m3 embeddings");
  }
  return new BgeM3EmbeddingProvider({
    endpoint,
    ...(env.BGE_M3_API_KEY === undefined ? {} : { apiKey: env.BGE_M3_API_KEY }),
  });
}

export function embedText(text: string, dimension = defaultEmbeddingDimension): EmbeddingVector {
  if (!Number.isInteger(dimension) || dimension < 8) {
    throw new Error("embedding dimension must be an integer >= 8");
  }
  const vector = Array.from({ length: dimension }, () => 0);
  const tokens = tokenizeForEmbedding(text);
  for (const token of tokens.length === 0 ? [""] : tokens) {
    addTokenHash(vector, token);
  }
  return normalize(vector);
}

export function pgVectorLiteral(vector: EmbeddingVector): string {
  return `[${vector.map((value) => value.toFixed(8)).join(",")}]`;
}

export function estimateHnswIndexBytes(
  chunkCount: number,
  dimension = defaultEmbeddingDimension,
): number {
  const vectorBytes = chunkCount * dimension * Float32Array.BYTES_PER_ELEMENT;
  const neighborBytes = chunkCount * 16 * Uint32Array.BYTES_PER_ELEMENT;
  return vectorBytes + neighborBytes;
}

function tokenizeForEmbedding(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/u)
    .filter((term) => term.length > 1);
}

function addTokenHash(vector: number[], token: string): void {
  const digest = createHash("sha256").update(token).digest();
  for (let offset = 0; offset < digest.length; offset += 4) {
    const bucket = digest.readUInt16BE(offset) % vector.length;
    const sign = digest.readUInt8(offset + 2) % 2 === 0 ? 1 : -1;
    const weight = 1 + (digest.readUInt8(offset + 3) % 7) / 10;
    vector[bucket] = (vector[bucket] ?? 0) + sign * weight;
  }
}

function normalize(vector: readonly number[]): EmbeddingVector {
  const norm = Math.hypot(...vector);
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

function readEmbedding(payload: unknown): EmbeddingVector {
  if (!isEmbeddingPayload(payload)) {
    throw new Error("bge-m3 response did not contain data[]");
  }
  const first = payload.data[0];
  if (first === undefined || !Array.isArray(first.embedding)) {
    throw new Error("bge-m3 response did not contain data[0].embedding[]");
  }
  const embedding = first.embedding;
  if (!embedding.every((value): value is number => typeof value === "number")) {
    throw new Error("bge-m3 embedding contains non-numeric values");
  }
  // `typeof NaN === "number"`, so the check above admits NaN and ±Infinity. That matters here more
  // than it looks: these values reach Postgres as a vector literal, and pgvector's `<=>` then yields
  // NaN, which defeats the out-of-corpus gate by making every comparison false. The refusal fails
  // OPEN — the system answers a question it has no evidence for. Rejecting at the boundary keeps that
  // impossible rather than merely unlikely.
  if (!embedding.every((value) => Number.isFinite(value))) {
    throw new Error("bge-m3 embedding contains non-finite values");
  }
  // An all-zero vector is dimensionally valid and semantically empty, and it is the other way to the
  // same NaN: cosine distance is undefined from the origin, so pgvector returns NaN for
  // `'[0,0,0]'::vector <=> anything` (verified against pgvector/pgvector:pg16). An embedder that
  // returns zeros is broken or degenerate, and this is where that gets said out loud instead of
  // becoming a confident answer downstream.
  if (embedding.every((value) => value === 0)) {
    throw new Error("bge-m3 embedding is all zeros, which has no cosine direction");
  }
  return embedding;
}

function isEmbeddingPayload(value: unknown): value is {
  readonly data: ReadonlyArray<{ readonly embedding: readonly unknown[] }>;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { readonly data?: unknown };
  return Array.isArray(candidate.data);
}
