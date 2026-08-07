export type Vector = readonly number[];

/**
 * Cosine similarity of two equal-length vectors.
 *
 * The dense eval pass ranks chunks by this against a query vector, both read from the committed
 * embedding cache. A length mismatch is a corpus/cache drift bug, not a degenerate score, so it
 * throws rather than silently comparing a prefix. A zero-magnitude vector has no direction — cosine
 * is undefined from the origin — and the embedding cache rejects all-zero vectors at load time, so
 * reaching one here is a caller bug and it throws for the same reason.
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity requires equal-length vectors, got ${String(a.length)} and ${String(b.length)}`,
    );
  }
  if (a.length === 0) {
    throw new Error("cosineSimilarity requires non-empty vectors");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) {
    throw new Error("cosineSimilarity is undefined for a zero-magnitude vector");
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
