import { describe, expect, it } from "vitest";

import {
  disabledLiveProvider,
  liveProviderEnabled,
  optionalEnv,
  requiredEnv,
} from "./live-provider.js";

describe("Anthropic L4 provider contract", () => {
  it("calls the Anthropic Messages API when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("anthropic")).toMatchObject({
        category: "anthropic",
        live: false,
      });
      return;
    }

    const apiKey = requiredEnv("ANTHROPIC_API_KEY", "anthropic");
    const model = optionalEnv("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        max_tokens: 16,
        messages: [{ role: "user", content: "Return exactly: OK" }],
        model,
        temperature: 0,
      }),
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new Error(
        `Anthropic live call failed with ${String(response.status)}: ${JSON.stringify(payload)}`,
      );
    }

    expect(hasTextContent(payload)).toBe(true);
  });
});

function hasTextContent(payload: unknown): boolean {
  if (!hasContentArray(payload)) {
    return false;
  }

  return payload.content.some((item) => {
    return isTextContentItem(item);
  });
}

function hasContentArray(value: unknown): value is { content: unknown[] } {
  const candidate = value as { content?: unknown };
  return isRecord(value) && Array.isArray(candidate.content);
}

function isTextContentItem(value: unknown): value is { text: string; type: "text" } {
  const candidate = value as { text?: unknown; type?: unknown };
  return isRecord(value) && candidate.type === "text" && typeof candidate.text === "string";
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
