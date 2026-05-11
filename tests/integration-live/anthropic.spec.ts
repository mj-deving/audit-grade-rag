import { describe, expect, it } from "vitest";

import { AnthropicMessagesProvider } from "../../src/modules/generation/generation.js";
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
    const provider = new AnthropicMessagesProvider({ apiKey, model });
    const output = await provider.generate({
      modelVersion: provider.profile.modelVersion,
      prompt:
        "Return one short German compliance assertion and include the marker [chunk:l4_anthropic].",
      promptVersion: "l4-anthropic@1.0.0",
      seed: null,
      temperature: 0,
    });

    expect(output).toContain("[chunk:l4_anthropic]");
    expect(provider.profile.replayCapability).toBe("drift_detect_only");
  });
});
