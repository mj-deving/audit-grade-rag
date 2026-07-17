import { describe, expect, it, vi } from "vitest";
import { BgeM3EmbeddingProvider, defaultEmbeddingDimension } from "./embedding.js";

const noSleep = (): Promise<void> => Promise.resolve();

function embeddingResponse(status: number): Response {
  // Deliberately NOT zeros, though zeros is what this said until 2026-07-17 — the vector's content
  // is incidental to a retry test, and "incidental" is exactly how it came to be the one value that
  // breaks production. An all-zero vector has no cosine direction, so pgvector returns NaN for
  // `'[0,0,0]'::vector <=> anything`, and that NaN used to defeat the out-of-corpus gate and make the
  // served path answer questions it had no evidence for. The provider now rejects such a vector, and
  // the only unit test it had was feeding it one.
  const vector = Array.from({ length: defaultEmbeddingDimension }, (_, index) => (index % 7) + 1);
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: () => Promise.resolve({ data: [{ embedding: vector }] }),
  } as unknown as Response;
}

describe("BgeM3EmbeddingProvider", () => {
  it("retries a 429 then returns the embedding on the next attempt", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(embeddingResponse(429))
      .mockResolvedValueOnce(embeddingResponse(200));
    const provider = new BgeM3EmbeddingProvider({
      endpoint: "http://embeddings.test",
      retries: 3,
      fetchImpl,
      sleep: noSleep,
    });

    const embedding = await provider.embed("audit trail integrity");

    expect(embedding).toHaveLength(defaultEmbeddingDimension);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget on a persistent 503", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(embeddingResponse(503));
    const provider = new BgeM3EmbeddingProvider({
      endpoint: "http://embeddings.test",
      retries: 2,
      fetchImpl,
      sleep: noSleep,
    });

    await expect(provider.embed("x")).rejects.toThrow(/503/u);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // first attempt + 2 retries
  });

  it("does not retry a non-retryable 400", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(embeddingResponse(400));
    const provider = new BgeM3EmbeddingProvider({
      endpoint: "http://embeddings.test",
      retries: 3,
      fetchImpl,
      sleep: noSleep,
    });

    await expect(provider.embed("x")).rejects.toThrow(/400/u);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// A degenerate vector is dimensionally valid and semantically empty, and both forms reach Postgres
// and come back as NaN from `<=>`, which defeats the out-of-corpus gate and makes the served path
// answer questions it has no evidence for. `typeof NaN === "number"`, so the pre-existing
// "non-numeric values" check admitted every case below. Rejecting here keeps the failure impossible
// rather than merely unlikely, and keeps it LOUD: a broken embedder should say so, not quietly
// become a confident answer.
describe("BgeM3EmbeddingProvider rejects a vector that has no direction", () => {
  function respondingWith(embedding: readonly unknown[]): Response {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ embedding }] }),
    } as unknown as Response;
  }

  function providerFor(embedding: readonly unknown[]): BgeM3EmbeddingProvider {
    return new BgeM3EmbeddingProvider({
      endpoint: "http://embeddings.test",
      retries: 0,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(respondingWith(embedding)),
      sleep: noSleep,
    });
  }

  const dimension = defaultEmbeddingDimension;

  it("rejects an all-zero vector", async () => {
    // `'[0,0,0]'::vector <=> '[1,2,3]'::vector` is NaN — verified against pgvector/pgvector:pg16.
    await expect(
      providerFor(Array.from({ length: dimension }, () => 0)).embed("x"),
    ).rejects.toThrow(/all zeros/u);
  });

  it("rejects a NaN anywhere in the vector", async () => {
    const withNaN = Array.from({ length: dimension }, (_, index) => (index === 5 ? Number.NaN : 1));
    await expect(providerFor(withNaN).embed("x")).rejects.toThrow(/non-finite/u);
  });

  it("rejects an Infinity anywhere in the vector", async () => {
    const withInfinity = Array.from({ length: dimension }, (_, index) =>
      index === 5 ? Number.POSITIVE_INFINITY : 1,
    );
    await expect(providerFor(withInfinity).embed("x")).rejects.toThrow(/non-finite/u);
  });

  it("accepts an ordinary vector, including one with some zeros in it", async () => {
    // The counterweight: a guard that rejected everything would satisfy all three tests above, and
    // zeros are perfectly normal in an embedding — it is ONLY the all-zero vector that has no
    // direction.
    const sparse = Array.from({ length: dimension }, (_, index) => (index % 3 === 0 ? 0 : 0.5));
    await expect(providerFor(sparse).embed("x")).resolves.toHaveLength(dimension);
  });
});
