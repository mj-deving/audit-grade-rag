import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./vector.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical direction", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 12);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 12);
  });

  it("is -1 for opposite direction", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 12);
  });

  it("throws on a length mismatch instead of comparing a prefix", () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(/equal-length/u);
  });

  it("throws for a zero-magnitude vector, which has no direction", () => {
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow(/zero-magnitude/u);
  });

  it("throws for empty vectors", () => {
    expect(() => cosineSimilarity([], [])).toThrow(/non-empty/u);
  });
});
