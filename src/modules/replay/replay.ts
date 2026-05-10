import type { DriftArtifact, LedgerEntry, ProviderProfile } from "../../domain/types.js";
import { sha256Hex } from "../../lib/hash.js";
import type { AuditLedger } from "../audit/ledger.js";

export type ReplayArtifacts = {
  readonly corpusSnapshotHash: string;
  readonly promptHash: string;
  readonly embeddingModelVersion: string;
  readonly modelVersion: string;
};

export type ReplayResult = {
  readonly originalLedgerEntryId: string;
  readonly status: "passed" | "drift" | "unsupported";
  readonly providerReplayCapability: ProviderProfile["replayCapability"];
  readonly byteEqual: boolean | null;
  readonly driftArtifact: DriftArtifact | null;
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
  providerProfile: ProviderProfile,
  artifacts: ReplayArtifacts,
  regeneratedAnswer: string,
): ReplayResult {
  const drift = detectArtifactDrift(entry, artifacts);
  if (providerProfile.replayCapability === "unsupported") {
    return ledgerReplay(ledger, entry, providerProfile, "unsupported", null, drift);
  }
  if (drift !== null) {
    return ledgerReplay(ledger, entry, providerProfile, "drift", false, drift);
  }
  const byteEqual = sha256Hex(regeneratedAnswer) === entry.generatedAnswerSha256;
  if (!byteEqual) {
    return ledgerReplay(ledger, entry, providerProfile, "drift", false, "provider_infrastructure");
  }
  return ledgerReplay(ledger, entry, providerProfile, "passed", true, null);
}

export function assertReplayPass(result: ReplayResult): void {
  if (result.status === "drift") {
    throw new ReplayDriftError(result.driftArtifact ?? "unknown");
  }
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
  providerProfile: ProviderProfile,
  status: ReplayResult["status"],
  byteEqual: boolean | null,
  driftArtifact: DriftArtifact | null,
): ReplayResult {
  const replayEntry = ledger.append({
    entryType: `replay.${status}`,
    outcome:
      status === "passed"
        ? "replay-passed"
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
    extra: { originalLedgerEntryId: entry.id, byteEqual, driftArtifact },
  });
  return {
    originalLedgerEntryId: entry.id,
    status,
    providerReplayCapability: providerProfile.replayCapability,
    byteEqual,
    driftArtifact,
    operatorMessageDe: replayMessage(status, driftArtifact),
    ledgerEntryId: replayEntry.id,
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
