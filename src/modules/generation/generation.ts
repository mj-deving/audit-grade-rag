import type {
  AnswerOutcome,
  Citation,
  Claim,
  EmbeddingProfile,
  PromptTemplate,
  ProviderProfile,
  RetrievedChunk,
  ValidationError,
} from "../../domain/types.js";
import { sha256Hex, stableId } from "../../lib/hash.js";
import { defaultEmbeddingDimension, defaultEmbeddingModel } from "../ingest/embedding.js";
import type { RetrievalTrace } from "../retrieval/retrieval.js";

export type LlmRequest = {
  readonly prompt: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly temperature: 0;
  readonly seed: number | null;
  readonly validationFeedback?: readonly ValidationError[];
};

export type LlmProvider = {
  readonly profile: ProviderProfile;
  generate(request: LlmRequest): string;
};

export const defaultPromptTemplate: PromptTemplate = {
  id: "audit-rag-cited-answer",
  version: "1.0.0",
  sha256: sha256Hex("audit-rag-cited-answer:1.0.0"),
  body: [
    "Beantworte nur mit belegten Aussagen.",
    "Jede Aussage muss mindestens eine Markierung im Format [chunk:<chunk_id>] enthalten.",
    "Wenn die Evidenz nicht reicht, verweigere die Antwort.",
  ].join("\n"),
};

export const defaultProviderProfile: ProviderProfile = {
  id: "stub-llm",
  name: "Deterministic Stub LLM",
  modelVersion: "stub-llm@1.0.0",
  replayCapability: "bit_equal",
  supportsSeed: true,
  configHash: sha256Hex("stub-llm@1.0.0"),
};

export const defaultEmbeddingProfile: EmbeddingProfile = {
  id: "bge-m3",
  modelVersion: defaultEmbeddingModel,
  dimension: defaultEmbeddingDimension,
  configHash: sha256Hex(defaultEmbeddingModel),
};

export class DeterministicStubProvider implements LlmProvider {
  readonly profile: ProviderProfile;
  calls = 0;
  private readonly outputs: readonly string[];

  constructor(outputs: readonly string[], profile: ProviderProfile = defaultProviderProfile) {
    this.outputs = outputs;
    this.profile = profile;
  }

  generate(): string {
    const output = this.outputs[Math.min(this.calls, this.outputs.length - 1)];
    this.calls += 1;
    return output ?? "";
  }
}

export class EvidenceEchoProvider implements LlmProvider {
  readonly profile = defaultProviderProfile;
  calls = 0;

  generate(request: LlmRequest): string {
    this.calls += 1;
    const chunkId = request.prompt.match(/\[chunk:([A-Za-z0-9_-]+)\]/u)?.[1] ?? "missing";
    return `CLAIM: Die Antwort ist durch den Korpus belegt. [chunk:${chunkId}]`;
  }
}

export type GenerateOptions = {
  readonly query: string;
  readonly trace: RetrievalTrace;
  readonly corpusSnapshotId: string;
  readonly corpusSnapshotHash: string;
  readonly provider: LlmProvider;
  readonly promptTemplate?: PromptTemplate;
  readonly embeddingProfile?: EmbeddingProfile;
  readonly seed?: number;
};

export function generateAnswer(options: GenerateOptions): AnswerOutcome {
  const promptTemplate = options.promptTemplate ?? defaultPromptTemplate;
  const embeddingProfile = options.embeddingProfile ?? defaultEmbeddingProfile;
  if (options.trace.outOfCorpus) {
    return refusedOutcome(options, promptTemplate, embeddingProfile);
  }
  const first = runGenerationAttempt(options, promptTemplate, embeddingProfile);
  if (first.validationErrors.length === 0) {
    return first;
  }
  const second = runGenerationAttempt(
    options,
    promptTemplate,
    embeddingProfile,
    first.validationErrors,
  );
  if (second.validationErrors.length === 0) {
    return second;
  }
  return blockedOutcome(options, promptTemplate, embeddingProfile, second.validationErrors);
}

export function renderPrompt(
  query: string,
  chunks: readonly RetrievedChunk[],
  promptTemplate: PromptTemplate = defaultPromptTemplate,
): string {
  const evidence = chunks.map((chunk) => `[chunk:${chunk.chunkId}] ${chunk.chunkText}`).join("\n");
  return `${promptTemplate.body}\n\nFrage:\n${query}\n\nEvidenz:\n${evidence}`;
}

export function parseCitedClaims(output: string): readonly Claim[] {
  return output
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => parseClaimLine(line, index));
}

export function validateClaims(
  claims: readonly Claim[],
  retrievedChunks: readonly RetrievedChunk[],
  corpusSnapshotId: string,
): readonly ValidationError[] {
  const retrieved = new Map(retrievedChunks.map((chunk) => [chunk.chunkId, chunk]));
  return claims.flatMap((claim) => validateClaim(claim, retrieved, corpusSnapshotId));
}

function runGenerationAttempt(
  options: GenerateOptions,
  promptTemplate: PromptTemplate,
  embeddingProfile: EmbeddingProfile,
  validationFeedback?: readonly ValidationError[],
): AnswerOutcome {
  const seed = options.provider.profile.supportsSeed ? (options.seed ?? 42) : null;
  const prompt = renderPrompt(options.query, options.trace.finalChunks, promptTemplate);
  const answer = options.provider.generate({
    prompt,
    modelVersion: options.provider.profile.modelVersion,
    promptVersion: promptTemplate.version,
    temperature: 0,
    seed,
    ...(validationFeedback === undefined ? {} : { validationFeedback }),
  });
  const claims = parseCitedClaims(answer);
  const errors = validateClaims(claims, options.trace.finalChunks, options.corpusSnapshotId);
  return {
    outcome: "answered",
    answer,
    claims,
    retrievedChunks: options.trace.finalChunks,
    validationErrors: errors,
    modelVersion: options.provider.profile.modelVersion,
    promptVersion: promptTemplate.version,
    embeddingModelVersion: embeddingProfile.modelVersion,
    seed,
    seedUnsupported: !options.provider.profile.supportsSeed,
    corpusSnapshotId: options.corpusSnapshotId,
    corpusSnapshotHash: options.corpusSnapshotHash,
    providerProfileId: options.provider.profile.id,
    promptHash: promptTemplate.sha256,
    answerHash: sha256Hex(answer),
    operatorMessageDe: "Die Antwort wurde mit belegten Aussagen erstellt.",
  };
}

function refusedOutcome(
  options: GenerateOptions,
  promptTemplate: PromptTemplate,
  embeddingProfile: EmbeddingProfile,
): AnswerOutcome {
  return {
    outcome: "refused-out-of-corpus",
    claims: [],
    retrievedChunks: options.trace.finalChunks,
    validationErrors: [],
    modelVersion: options.provider.profile.modelVersion,
    promptVersion: promptTemplate.version,
    embeddingModelVersion: embeddingProfile.modelVersion,
    seed: options.provider.profile.supportsSeed ? (options.seed ?? 42) : null,
    seedUnsupported: !options.provider.profile.supportsSeed,
    corpusSnapshotId: options.corpusSnapshotId,
    corpusSnapshotHash: options.corpusSnapshotHash,
    providerProfileId: options.provider.profile.id,
    promptHash: promptTemplate.sha256,
    operatorMessageDe: "Keine ausreichend relevante Evidenz im Korpus gefunden.",
  };
}

function blockedOutcome(
  options: GenerateOptions,
  promptTemplate: PromptTemplate,
  embeddingProfile: EmbeddingProfile,
  validationErrors: readonly ValidationError[],
): AnswerOutcome {
  return {
    outcome: "blocked-uncited",
    claims: [],
    retrievedChunks: options.trace.finalChunks,
    validationErrors,
    modelVersion: options.provider.profile.modelVersion,
    promptVersion: promptTemplate.version,
    embeddingModelVersion: embeddingProfile.modelVersion,
    seed: options.provider.profile.supportsSeed ? (options.seed ?? 42) : null,
    seedUnsupported: !options.provider.profile.supportsSeed,
    corpusSnapshotId: options.corpusSnapshotId,
    corpusSnapshotHash: options.corpusSnapshotHash,
    providerProfileId: options.provider.profile.id,
    promptHash: promptTemplate.sha256,
    operatorMessageDe: "Die generierte Antwort wurde wegen fehlender Zitate blockiert.",
  };
}

function parseClaimLine(line: string, index: number): Claim {
  const citations = [...line.matchAll(/\[chunk:([A-Za-z0-9_-]+)\]/gu)].map(
    (match): Citation => ({
      claimIndex: index,
      chunkId: match[1] ?? "",
      marker: match[0],
    }),
  );
  return {
    id: stableId("claim", [String(index), line]),
    index,
    text: line
      .replace(/\s*\[chunk:[A-Za-z0-9_-]+\]/gu, "")
      .replace(/^CLAIM:\s*/iu, "")
      .trim(),
    citations,
  };
}

function validateClaim(
  claim: Claim,
  retrieved: ReadonlyMap<string, RetrievedChunk>,
  corpusSnapshotId: string,
): readonly ValidationError[] {
  if (claim.citations.length === 0) {
    return [{ code: "missing_citation", claimIndex: claim.index, detail: "claim has no citation" }];
  }
  return claim.citations.flatMap((citation) =>
    validateCitation(citation, retrieved, corpusSnapshotId),
  );
}

function validateCitation(
  citation: Citation,
  retrieved: ReadonlyMap<string, RetrievedChunk>,
  corpusSnapshotId: string,
): readonly ValidationError[] {
  const chunk = retrieved.get(citation.chunkId);
  if (chunk === undefined) {
    return [{ code: "invalid_chunk", claimIndex: citation.claimIndex, detail: citation.chunkId }];
  }
  if (chunk.corpusSnapshotId !== corpusSnapshotId) {
    return [{ code: "wrong_snapshot", claimIndex: citation.claimIndex, detail: citation.chunkId }];
  }
  return [];
}
