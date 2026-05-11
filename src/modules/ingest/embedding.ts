import { createHash } from "node:crypto";

export const defaultEmbeddingModel = "bge-m3@local-1024-v1";
export const defaultEmbeddingDimension = 1024;

export type EmbeddingVector = readonly number[];

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
