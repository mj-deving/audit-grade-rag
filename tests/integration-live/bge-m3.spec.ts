import { describe, expect, it } from "vitest";

import {
  disabledLiveProvider,
  liveProviderEnabled,
  optionalBearerHeaders,
  optionalEnv,
  requiredEnv,
} from "./live-provider.js";

describe("bge-m3 L4 provider contract", () => {
  it("calls an OpenAI-compatible bge-m3 embedding endpoint when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("bge-m3")).toMatchObject({
        category: "bge-m3",
        live: false,
      });
      return;
    }

    const endpoint = requiredEnv("BGE_M3_EMBEDDING_ENDPOINT", "bge-m3");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...optionalBearerHeaders(optionalEnv("BGE_M3_API_KEY")),
      },
      body: JSON.stringify({
        input: ["DACH compliance query with German regulatory vocabulary."],
        model: "bge-m3",
      }),
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new Error(
        `bge-m3 live call failed with ${String(response.status)}: ${JSON.stringify(payload)}`,
      );
    }

    expect(hasNumericEmbedding(payload)).toBe(true);
  });
});

function hasNumericEmbedding(payload: unknown): boolean {
  if (!hasDataArray(payload)) {
    return false;
  }

  const first = payload.data[0];
  if (!hasEmbeddingArray(first)) {
    return false;
  }

  return first.embedding.some((value) => typeof value === "number");
}

function hasDataArray(value: unknown): value is { data: unknown[] } {
  const candidate = value as { data?: unknown };
  return isRecord(value) && Array.isArray(candidate.data);
}

function hasEmbeddingArray(value: unknown): value is { embedding: unknown[] } {
  const candidate = value as { embedding?: unknown };
  return isRecord(value) && Array.isArray(candidate.embedding);
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
