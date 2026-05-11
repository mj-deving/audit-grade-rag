import type { Citation, ReplayCapability, RetrievedChunk } from "../../domain/types.js";
import { sha256Hex } from "../../lib/hash.js";
import type { LedgerAppendInput } from "./ledger.js";

export type NormalizedLedgerInput = {
  readonly queryText: string | null;
  readonly retrievedChunks: readonly RetrievedChunk[];
  readonly generatedAnswer: string | null;
  readonly generatedAnswerSha256: string | null;
  readonly claimCitations: readonly Citation[];
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly embeddingModelVersion: string;
  readonly providerProfileId: string;
  readonly providerReplayCapability: ReplayCapability;
  readonly seed: number | null;
  readonly temperature: number;
  readonly corpusSnapshotId: string;
  readonly corpusSnapshotHash: string;
  readonly promptHash: string;
  readonly metadata: Record<string, unknown>;
};

const emptyRetrievedChunks: readonly RetrievedChunk[] = [];
const emptyCitations: readonly Citation[] = [];
const emptyMetadata: Record<string, unknown> = {};

export function normalizeLedgerInput(input: LedgerAppendInput): NormalizedLedgerInput {
  const generatedAnswer = nullableString(input.generatedAnswer);
  return {
    queryText: nullableString(input.queryText),
    retrievedChunks: input.retrievedChunks ?? emptyRetrievedChunks,
    generatedAnswer,
    generatedAnswerSha256: hashNullable(generatedAnswer),
    claimCitations: input.claimCitations ?? emptyCitations,
    modelVersion: valueOrDefault(input.modelVersion),
    promptVersion: valueOrDefault(input.promptVersion),
    embeddingModelVersion: valueOrDefault(input.embeddingModelVersion),
    providerProfileId: valueOrDefault(input.providerProfileId),
    providerReplayCapability: input.providerReplayCapability ?? "unsupported",
    seed: nullableNumber(input.seed),
    temperature: input.temperature ?? 0,
    corpusSnapshotId: valueOrDefault(input.corpusSnapshotId),
    corpusSnapshotHash: valueOrDefault(input.corpusSnapshotHash),
    promptHash: valueOrDefault(input.promptHash),
    metadata: input.extra ?? emptyMetadata,
  };
}

function nullableString(value: string | undefined): string | null {
  return value ?? null;
}

function nullableNumber(value: number | null | undefined): number | null {
  return value ?? null;
}

function valueOrDefault(value: string | undefined): string {
  return value ?? "not-applicable";
}

function hashNullable(value: string | null): string | null {
  return value === null ? null : sha256Hex(value);
}
