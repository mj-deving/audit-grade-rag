import { describe, expect, it, vi } from "vitest";
import { BgeM3EmbeddingProvider, defaultEmbeddingDimension } from "./embedding.js";

const noSleep = (): Promise<void> => Promise.resolve();

function embeddingResponse(status: number): Response {
  const vector = Array.from({ length: defaultEmbeddingDimension }, () => 0);
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
