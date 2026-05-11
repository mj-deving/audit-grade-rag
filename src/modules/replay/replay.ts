import type { DriftArtifact, LedgerEntry } from "../../domain/types.js";
import { sha256Hex } from "../../lib/hash.js";
import type { AuditLedger } from "../audit/ledger.js";
import {
  defaultEmbeddingProfile,
  defaultPromptTemplate,
  generateAnswer,
  type LlmProvider,
} from "../generation/generation.js";
import type { RetrievalTrace } from "../retrieval/retrieval.js";

export type ReplayArtifacts = {
  readonly corpusSnapshotHash: string;
  readonly promptHash: string;
  readonly embeddingModelVersion: string;
  readonly modelVersion: string;
};

export type ReplayResult = {
  readonly originalLedgerEntryId: string;
  readonly status: "passed" | "drift" | "unsupported";
  readonly providerReplayCapability: LlmProvider["profile"]["replayCapability"];
  readonly byteEqual: boolean | null;
  readonly driftArtifact: DriftArtifact | null;
  readonly originalGeneratedAnswerSha256: string | null;
  readonly regeneratedAnswerSha256: string | null;
  readonly operatorMessageDe: string;
  readonly ledgerEntryId: string;
};

export class ReplayDriftError extends Error {
  constructor(readonly artifact: DriftArtifact) {
    super(`Replay drift detected: ${artifact}`);
    this.name = "ReplayDriftError";
  }
}

export function replayLedgerEntry(
  ledger: AuditLedger,
  entry: LedgerEntry,
  provider: LlmProvider,
  artifacts: ReplayArtifacts,
): ReplayResult {
  const providerProfile = provider.profile;
  const drift = detectArtifactDrift(entry, artifacts);
  if (providerProfile.replayCapability === "unsupported") {
    return ledgerReplay(ledger, entry, provider, "unsupported", null, null, drift);
  }
  if (drift !== null) {
    return ledgerReplay(ledger, entry, provider, "drift", false, null, drift);
  }
  const regeneratedAnswer = regenerateAnswer(entry, provider, artifacts);
  const byteEqual = regeneratedAnswer === entry.generatedAnswer;
  if (!byteEqual) {
    return ledgerReplay(
      ledger,
      entry,
      provider,
      "drift",
      false,
      regeneratedAnswer,
      "provider_infrastructure",
    );
  }
  return ledgerReplay(ledger, entry, provider, "passed", true, regeneratedAnswer, null);
}

export function assertReplayPass(result: ReplayResult): void {
  if (result.status === "drift") {
    throw new ReplayDriftError(result.driftArtifact ?? "unknown");
  }
}

export function replayArtifactsFromEntry(entry: LedgerEntry): ReplayArtifacts {
  return {
    corpusSnapshotHash: entry.corpusSnapshotHash,
    promptHash: entry.promptHash,
    embeddingModelVersion: entry.embeddingModelVersion,
    modelVersion: entry.modelVersion,
  };
}

function detectArtifactDrift(entry: LedgerEntry, artifacts: ReplayArtifacts): DriftArtifact | null {
  if (entry.corpusSnapshotHash !== artifacts.corpusSnapshotHash) {
    return "corpus_snapshot";
  }
  if (entry.promptHash !== artifacts.promptHash) {
    return "prompt";
  }
  if (entry.embeddingModelVersion !== artifacts.embeddingModelVersion) {
    return "embedding_model";
  }
  if (entry.modelVersion !== artifacts.modelVersion) {
    return "model";
  }
  return null;
}

function ledgerReplay(
  ledger: AuditLedger,
  entry: LedgerEntry,
  provider: LlmProvider,
  status: ReplayResult["status"],
  byteEqual: boolean | null,
  regeneratedAnswer: string | null,
  driftArtifact: DriftArtifact | null,
): ReplayResult {
  const providerProfile = provider.profile;
  const replayEntry = ledger.append({
    entryType: `replay.${status}`,
    outcome:
      status === "passed"
        ? "replay-success"
        : status === "drift"
          ? "replay-drift"
          : "replay-unsupported",
    generatedAnswer: status,
    modelVersion: providerProfile.modelVersion,
    promptVersion: entry.promptVersion,
    embeddingModelVersion: entry.embeddingModelVersion,
    providerProfileId: providerProfile.id,
    providerReplayCapability: providerProfile.replayCapability,
    seed: entry.seed,
    corpusSnapshotId: entry.corpusSnapshotId,
    corpusSnapshotHash: entry.corpusSnapshotHash,
    promptHash: entry.promptHash,
    userIdHash: entry.userIdHash,
    extra: {
      originalLedgerEntryId: entry.id,
      byteEqual,
      driftArtifact,
      originalGeneratedAnswerSha256: entry.generatedAnswerSha256,
      regeneratedAnswerSha256: regeneratedAnswer === null ? null : sha256Hex(regeneratedAnswer),
    },
  });
  return {
    originalLedgerEntryId: entry.id,
    status,
    providerReplayCapability: providerProfile.replayCapability,
    byteEqual,
    driftArtifact,
    originalGeneratedAnswerSha256: entry.generatedAnswerSha256,
    regeneratedAnswerSha256: regeneratedAnswer === null ? null : sha256Hex(regeneratedAnswer),
    operatorMessageDe: replayMessage(status, driftArtifact),
    ledgerEntryId: replayEntry.id,
  };
}

function regenerateAnswer(
  entry: LedgerEntry,
  provider: LlmProvider,
  artifacts: ReplayArtifacts,
): string {
  if (entry.queryText === null) {
    throw new ReplayDriftError("unknown");
  }
  if (entry.generatedAnswer === null) {
    throw new ReplayDriftError("unknown");
  }
  const outcome = generateAnswer({
    query: entry.queryText,
    trace: replayTrace(entry),
    corpusSnapshotId: entry.corpusSnapshotId,
    corpusSnapshotHash: artifacts.corpusSnapshotHash,
    provider,
    promptTemplate: {
      ...defaultPromptTemplate,
      version: entry.promptVersion,
      sha256: artifacts.promptHash,
    },
    embeddingProfile: {
      ...defaultEmbeddingProfile,
      modelVersion: artifacts.embeddingModelVersion,
    },
    ...(entry.seed === null ? {} : { seed: entry.seed }),
  });
  return outcome.answer ?? "";
}

function replayTrace(entry: LedgerEntry): RetrievalTrace {
  return {
    bm25Candidates: entry.retrievedChunks,
    vectorCandidates: entry.retrievedChunks,
    mergedCandidates: entry.retrievedChunks,
    finalChunks: entry.retrievedChunks,
    outOfCorpus: false,
  };
}

function replayMessage(status: ReplayResult["status"], artifact: DriftArtifact | null): string {
  if (status === "passed") {
    return "Replay erfolgreich: Die Antwort ist bytegleich.";
  }
  if (status === "unsupported") {
    return "Replay wird vom Providerprofil nicht unterstuetzt.";
  }
  return `Replay-Abweichung erkannt: ${artifact ?? "unbekannt"}.`;
}
