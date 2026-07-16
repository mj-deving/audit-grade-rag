import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
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
import { retryAsync } from "../../lib/resilience.js";
import { defaultEmbeddingDimension, defaultEmbeddingModel } from "../ingest/embedding.js";
import type { RetrievalTrace } from "../retrieval/retrieval.js";

const execFileAsync = promisify(execFile);

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
  generate(request: LlmRequest): string | Promise<string>;
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
  readonly profile: ProviderProfile;
  calls = 0;

  constructor(profile: ProviderProfile = defaultProviderProfile) {
    this.profile = profile;
  }

  generate(request: LlmRequest): string {
    this.calls += 1;
    const chunkId = request.prompt.match(/\[chunk:([A-Za-z0-9_-]+)\]/u)?.[1] ?? "missing";
    return `CLAIM: Die Antwort ist durch den Korpus belegt. [chunk:${chunkId}]`;
  }
}

export class AnthropicMessagesProvider implements LlmProvider {
  readonly profile: ProviderProfile;
  private readonly client: Anthropic;

  constructor(options: {
    readonly apiKey: string;
    readonly model?: string;
    readonly timeoutMs?: number;
    readonly maxRetries?: number;
  }) {
    const model = options.model ?? "claude-sonnet-4-6";
    // The SDK retries 429/5xx and connection errors with exponential backoff plus jitter;
    // set the ceiling and the per-request timeout explicitly rather than leaning on defaults (H-2/H-3).
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 60_000,
      maxRetries: options.maxRetries ?? 3,
    });
    this.profile = {
      id: "anthropic",
      name: "Anthropic Claude Messages API",
      modelVersion: model,
      replayCapability: "drift_detect_only",
      supportsSeed: false,
      configHash: sha256Hex(`anthropic:${model}`),
    };
  }

  async generate(request: LlmRequest): Promise<string> {
    // Traced automatically by the OpenInference AnthropicInstrumentation registered in
    // instrumentation.ts (model, tokens, input/output, generation type). No manual span here.
    const message = await this.client.messages.create({
      max_tokens: 512,
      messages: [{ role: "user", content: request.prompt }],
      model: this.profile.modelVersion,
      temperature: request.temperature,
    });
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
}

export class ClaudeCliJsonProvider implements LlmProvider {
  readonly profile: ProviderProfile;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly maxBudgetUsd: string;
  private readonly retries: number;

  constructor(
    options: {
      readonly command?: string;
      readonly model?: string;
      readonly timeoutMs?: number;
      readonly maxBudgetUsd?: string;
      readonly retries?: number;
    } = {},
  ) {
    const model = options.model ?? "claude-sonnet-4-6";
    this.command = options.command ?? "claude";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxBudgetUsd = options.maxBudgetUsd ?? "1.00";
    this.retries = options.retries ?? 2;
    this.profile = {
      id: "claude-cli-oauth",
      name: "Claude Code CLI OAuth",
      modelVersion: model,
      replayCapability: "drift_detect_only",
      supportsSeed: false,
      configHash: sha256Hex(`claude-cli-oauth:${model}`),
    };
  }

  async generate(request: LlmRequest): Promise<string> {
    // A timed-out CLI invocation is a transient failure; retry it with backoff. A non-zero
    // exit (bad prompt, budget exceeded) or a missing binary is deterministic and not retried.
    const result = await retryAsync(
      () =>
        execFileAsync(
          this.command,
          [
            "-p",
            "--output-format",
            "json",
            "--json-schema",
            JSON.stringify(claudeCliAnswerSchema),
            "--model",
            this.profile.modelVersion,
            "--max-budget-usd",
            this.maxBudgetUsd,
            "--no-session-persistence",
            claudeCliPrompt(request),
          ],
          { encoding: "utf8", timeout: this.timeoutMs },
        ),
      {
        retries: this.retries,
        baseDelayMs: 500,
        maxDelayMs: 4_000,
        isRetryable: isTimedOutProcess,
      },
    );
    return readClaudeCliAnswer(result.stdout);
  }
}

function isTimedOutProcess(error: unknown): boolean {
  return isObject(error) && (error as { readonly killed?: boolean }).killed === true;
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

export async function generateAnswerAsync(options: GenerateOptions): Promise<AnswerOutcome> {
  const promptTemplate = options.promptTemplate ?? defaultPromptTemplate;
  const embeddingProfile = options.embeddingProfile ?? defaultEmbeddingProfile;
  if (options.trace.outOfCorpus) {
    return refusedOutcome(options, promptTemplate, embeddingProfile);
  }
  const first = await runGenerationAttemptAsync(options, promptTemplate, embeddingProfile);
  if (first.validationErrors.length === 0) {
    return first;
  }
  const second = await runGenerationAttemptAsync(
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
  if (typeof answer !== "string") {
    throw new Error("Async LLM provider requires generateAnswerAsync");
  }
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

async function runGenerationAttemptAsync(
  options: GenerateOptions,
  promptTemplate: PromptTemplate,
  embeddingProfile: EmbeddingProfile,
  validationFeedback?: readonly ValidationError[],
): Promise<AnswerOutcome> {
  const seed = options.provider.profile.supportsSeed ? (options.seed ?? 42) : null;
  const prompt = renderPrompt(options.query, options.trace.finalChunks, promptTemplate);
  const answer = await options.provider.generate({
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

const claudeCliAnswerSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string", minLength: 1 },
  },
  required: ["answer"],
} as const;

function claudeCliPrompt(request: LlmRequest): string {
  return [
    "Return structured output that matches the supplied JSON schema.",
    "Put the complete operator-facing answer in the `answer` field.",
    "Preserve every required [chunk:<chunk_id>] citation marker exactly.",
    `Frozen model_version: ${request.modelVersion}`,
    `Frozen prompt_version: ${request.promptVersion}`,
    `Temperature: ${String(request.temperature)}`,
    `Seed: ${request.seed === null ? "unsupported-by-provider" : String(request.seed)}`,
    validationFeedbackText(request.validationFeedback),
    request.prompt,
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function validationFeedbackText(feedback: readonly ValidationError[] | undefined): string {
  if (feedback === undefined || feedback.length === 0) {
    return "";
  }
  return `Validation feedback to fix before answering: ${JSON.stringify(feedback)}`;
}

function readClaudeCliAnswer(stdout: string): string {
  const parsed: unknown = JSON.parse(stdout);
  if (!isClaudeCliEnvelope(parsed)) {
    throw new Error("Claude CLI JSON envelope was not an object");
  }
  const structured = parsed.structured_output;
  if (!isClaudeCliStructuredOutput(structured)) {
    throw new Error("Claude CLI JSON envelope did not include structured_output");
  }
  const answer = structured.answer;
  if (typeof answer !== "string" || answer.length === 0) {
    throw new Error("Claude CLI structured_output.answer was not a non-empty string");
  }
  return answer;
}

function isClaudeCliEnvelope(value: unknown): value is { readonly structured_output: unknown } {
  return isObject(value) && "structured_output" in value;
}

function isClaudeCliStructuredOutput(value: unknown): value is { readonly answer: unknown } {
  return isObject(value) && "answer" in value;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
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
