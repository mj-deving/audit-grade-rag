import { describe, expect, it } from "vitest";

import type { RetrievedChunk } from "../../src/domain/types.js";
import {
  ClaudeCliJsonProvider,
  generateAnswerAsync,
} from "../../src/modules/generation/generation.js";
import { disabledLiveProvider, liveProviderEnabled, optionalEnv } from "./live-provider.js";

describe("Claude CLI OAuth L4 provider contract", () => {
  it("calls Claude Code with structured output when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("claude-cli")).toMatchObject({
        category: "claude-cli",
        live: false,
      });
      return;
    }

    const model = optionalEnv("CLAUDE_MODEL") ?? "claude-sonnet-4-6";
    const provider = new ClaudeCliJsonProvider({ model });
    const output = await generateAnswerAsync({
      query: "Welche Auditpflicht gilt laut Evidenz?",
      trace: {
        vectorCandidates: [liveChunk],
        bm25Candidates: [liveChunk],
        mergedCandidates: [liveChunk],
        finalChunks: [liveChunk],
        outOfCorpus: false,
      },
      corpusSnapshotId: liveChunk.corpusSnapshotId,
      corpusSnapshotHash: liveChunk.corpusSnapshotHash,
      provider,
    });

    expect(output.outcome).toBe("answered");
    expect(output.answer).toContain("[chunk:l4_claude_cli]");
    expect(provider.profile.id).toBe("claude-cli-oauth");
    expect(provider.profile.replayCapability).toBe("drift_detect_only");
  });
});

const liveChunk: RetrievedChunk = {
  chunkId: "l4_claude_cli",
  docId: "doc_l4",
  sourceDocumentId: "src_l4",
  sourceType: "markdown",
  sourcePath: "/corpus/l4.md",
  pageStart: 1,
  pageEnd: 1,
  charStart: 0,
  charEnd: 86,
  tokenStart: 0,
  tokenEnd: 12,
  chunkIndex: 0,
  chunkText: "Jede beantwortete Anfrage muss eine Audit-Zeile mit Zitationsnachweis schreiben.",
  chunkSha256: "sha_l4",
  corpusSnapshotId: "snap_l4",
  corpusSnapshotHash: "hash_l4",
  extractionWarnings: [],
  ocrUsed: false,
  retrievalScore: 1,
  retrievalMethod: "rrf",
};
