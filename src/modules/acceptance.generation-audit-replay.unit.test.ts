import { expect, it } from "vitest";
import type { ProviderProfile, RetrievedChunk } from "../domain/types.js";
import { sha256Hex } from "../lib/hash.js";
import { AuditLedger, verifyExportedLedgerEntries } from "./audit/ledger.js";
import {
  DeterministicStubProvider,
  defaultEmbeddingProfile,
  defaultPromptTemplate,
  generateAnswer,
  renderPrompt,
  validateClaims,
} from "./generation/generation.js";
import { assertReplayPass, ReplayDriftError, replayLedgerEntry } from "./replay/replay.js";
import { retrieveChunks } from "./retrieval/retrieval.js";

const chunks: readonly RetrievedChunk[] = [
  {
    chunkId: "chunk_a",
    docId: "doc_a",
    sourceDocumentId: "src_a",
    sourceType: "markdown",
    sourcePath: "/corpus/a.md",
    pageStart: 1,
    pageEnd: 1,
    charStart: 0,
    charEnd: 20,
    tokenStart: 0,
    tokenEnd: 4,
    chunkIndex: 0,
    chunkText: "Auditpflicht gilt fuer Antworten",
    chunkSha256: "sha_a",
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
    extractionWarnings: [],
    ocrUsed: false,
    retrievalScore: 1,
    retrievalMethod: "rrf",
  },
];

// No mocks: generation uses the real prompt renderer, parser, validator, and deterministic provider.
it("returns cited answers with pinned model, prompt, temperature, and seed", () => {
  const trace = retrieveChunks("Auditpflicht Antworten", chunks, { activeSnapshotId: "snap_a" });
  const valid = generateAnswer({
    query: "Auditpflicht Antworten",
    trace,
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
    provider: new DeterministicStubProvider(["CLAIM: Pflicht gilt. [chunk:chunk_a]"]),
  });

  expect(valid).toMatchObject({
    outcome: "answered",
    modelVersion: "stub-llm@1.0.0",
    promptVersion: "1.0.0",
    seed: 42,
    seedUnsupported: false,
  });
  expect(valid.claims[0]?.citations[0]?.chunkId).toBe("chunk_a");
  expect(renderPrompt("Q", trace.finalChunks)).toContain("[chunk:chunk_a]");
  expect(
    generateAnswer({
      query: "Auditpflicht Antworten",
      trace,
      corpusSnapshotId: "snap_a",
      corpusSnapshotHash: "hash_a",
      provider: new DeterministicStubProvider(["CLAIM: Pflicht gilt. [chunk:chunk_a]"]),
      seed: 7,
    }).seed,
  ).toBe(7);
});

// No mocks: regeneration and block behavior use real validation failures.
it("retries once and blocks the second invalid generation", () => {
  const trace = retrieveChunks("Auditpflicht Antworten", chunks, { activeSnapshotId: "snap_a" });
  const retryProvider = new DeterministicStubProvider([
    "CLAIM: Kein Zitat",
    "CLAIM: Jetzt belegt. [chunk:chunk_a]",
  ]);
  const retry = generateAnswer({
    query: "Auditpflicht",
    trace,
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
    provider: retryProvider,
  });
  const blocked = generateAnswer({
    query: "Auditpflicht",
    trace,
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
    provider: new DeterministicStubProvider(["CLAIM: Kein Zitat", "CLAIM: Falsch [chunk:missing]"]),
  });

  expect(retry.outcome).toBe("answered");
  expect(retryProvider.calls).toBe(2);
  expect(blocked.outcome).toBe("blocked-uncited");
  expect(blocked.answer).toBeUndefined();
});

// No mocks: validator checks the retrieved set and snapshot membership.
it("rejects citations outside the retrieved snapshot", () => {
  const trace = retrieveChunks("Auditpflicht Antworten", chunks, { activeSnapshotId: "snap_a" });
  const valid = generateAnswer({
    query: "Auditpflicht Antworten",
    trace,
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
    provider: new DeterministicStubProvider(["CLAIM: Pflicht gilt. [chunk:chunk_a]"]),
  });
  expect(
    validateClaims(
      valid.claims,
      [{ ...firstChunk(trace.finalChunks), corpusSnapshotId: "other" }],
      "snap_a",
    )[0]?.code,
  ).toBe("wrong_snapshot");
});

// No mocks: audit rows are real signed hash-chain entries.
it("verifies clean ledger rows and detects the first tampered row", () => {
  const ledger = new AuditLedger();
  const answered = appendAnswered(ledger);
  ledger.append({
    entryType: "query.refused_out_of_corpus",
    outcome: "refused-out-of-corpus",
    userIdHash: "user_hash",
  });
  ledger.append({
    entryType: "query.blocked_uncited",
    outcome: "blocked-uncited",
    userIdHash: "user_hash",
  });

  expect(ledger.verifyRows()).toEqual({ ok: true, checkedRows: 3 });
  expect(ledger.verifyRows(ledger.tamperedCopy(2, { previousHash: "bad" }))).toMatchObject({
    ok: false,
    firstInvalidSequence: 2,
  });
  expect(verifyExportedLedgerEntries(ledger.entries())).toMatchObject({ ok: true, checkedRows: 3 });
  expect(answered.generatedAnswerSha256).toBe(sha256Hex("Antwort"));
});

// No mocks: replay appends result rows and returns pass, drift, and unsupported states.
it("names replay pass, drift, cloud byte mismatch, and unsupported provider states", () => {
  const ledger = new AuditLedger();
  const answered = appendAnswered(ledger);
  const profile = providerProfile("bit_equal");
  const pass = replayLedgerEntry(ledger, answered, profile, artifacts(answered), "Antwort");
  const drift = replayLedgerEntry(
    ledger,
    answered,
    profile,
    { ...artifacts(answered), promptHash: "changed" },
    "Antwort",
  );
  const unsupported = replayLedgerEntry(
    ledger,
    answered,
    providerProfile("unsupported"),
    artifacts(answered),
    "Antwort",
  );
  const cloud = replayLedgerEntry(
    ledger,
    answered,
    providerProfile("drift_detect_only"),
    artifacts(answered),
    "changed",
  );

  expect(pass.status).toBe("passed");
  expect(() => {
    assertReplayPass(pass);
  }).not.toThrow();
  expect(drift).toMatchObject({ status: "drift", driftArtifact: "prompt" });
  expect(() => {
    assertReplayPass(drift);
  }).toThrow(ReplayDriftError);
  expect(unsupported.status).toBe("unsupported");
  expect(cloud.driftArtifact).toBe("provider_infrastructure");
});

function appendAnswered(ledger: AuditLedger) {
  return ledger.append({
    entryType: "query.answered",
    outcome: "answered",
    queryText: "Auditpflicht",
    retrievedChunks: [],
    generatedAnswer: "Antwort",
    claimCitations: [],
    modelVersion: "stub-llm@1.0.0",
    promptVersion: defaultPromptTemplate.version,
    embeddingModelVersion: defaultEmbeddingProfile.modelVersion,
    providerProfileId: "stub-llm",
    providerReplayCapability: "bit_equal",
    seed: 42,
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
    promptHash: defaultPromptTemplate.sha256,
    userIdHash: "user_hash",
  });
}

function providerProfile(replayCapability: ProviderProfile["replayCapability"]): ProviderProfile {
  return {
    id: "stub-llm",
    name: "Stub",
    modelVersion: "stub-llm@1.0.0",
    replayCapability,
    supportsSeed: true,
    configHash: "cfg",
  };
}

function artifacts(entry: {
  corpusSnapshotHash: string;
  promptHash: string;
  embeddingModelVersion: string;
  modelVersion: string;
}) {
  return {
    corpusSnapshotHash: entry.corpusSnapshotHash,
    promptHash: entry.promptHash,
    embeddingModelVersion: entry.embeddingModelVersion,
    modelVersion: entry.modelVersion,
  };
}

function firstChunk(value: readonly RetrievedChunk[]): RetrievedChunk {
  const chunk = value[0];
  if (chunk === undefined) {
    throw new Error("expected retrieved chunk");
  }
  return chunk;
}
