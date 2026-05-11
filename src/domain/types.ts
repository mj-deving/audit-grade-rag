export type Role = "operator" | "auditor" | "admin";

export type Outcome =
  | "answered"
  | "refused-out-of-corpus"
  | "blocked-uncited"
  | "provider-error"
  | "replay-success"
  | "replay-drift"
  | "replay-unsupported"
  | "report-generated"
  | "operator-login-success"
  | "corpus-ingest-completed"
  | "operator-identity-deleted";

export type SourceType = "pdf" | "docx" | "markdown";

export type ReplayCapability = "bit_equal" | "drift_detect_only" | "unsupported";

export type DriftArtifact =
  | "prompt"
  | "model"
  | "embedding_model"
  | "corpus_snapshot"
  | "provider_infrastructure"
  | "unknown";

export type ProviderProfile = {
  readonly id: string;
  readonly name: string;
  readonly modelVersion: string;
  readonly replayCapability: ReplayCapability;
  readonly supportsSeed: boolean;
  readonly configHash: string;
};

export type EmbeddingProfile = {
  readonly id: string;
  readonly modelVersion: string;
  readonly dimension: number;
  readonly configHash: string;
};

export type PromptTemplate = {
  readonly id: string;
  readonly version: string;
  readonly sha256: string;
  readonly body: string;
};

export type CorpusSnapshot = {
  readonly id: string;
  readonly sequence: number;
  readonly snapshotHash: string;
  readonly embeddingModelVersion: string;
  readonly chunkerVersion: string;
  readonly status: "building" | "active" | "retired" | "failed";
};

export type CorpusChunk = {
  readonly chunkId: string;
  readonly docId: string;
  readonly sourceDocumentId: string;
  readonly sourceType: SourceType;
  readonly sourcePath: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly chunkIndex: number;
  readonly chunkText: string;
  readonly chunkSha256: string;
  readonly corpusSnapshotId: string;
  readonly corpusSnapshotHash: string;
  readonly extractionWarnings: readonly string[];
  readonly ocrUsed: boolean;
};

export type RetrievedChunk = CorpusChunk & {
  readonly retrievalScore: number;
  readonly retrievalMethod: "dense" | "bm25" | "rrf";
};

export type Citation = {
  readonly claimIndex: number;
  readonly chunkId: string;
  readonly marker: string;
};

export type Claim = {
  readonly id: string;
  readonly index: number;
  readonly text: string;
  readonly citations: readonly Citation[];
};

export type ValidationErrorCode =
  | "missing_citation"
  | "invalid_chunk"
  | "wrong_snapshot"
  | "malformed_citation";

export type ValidationError = {
  readonly code: ValidationErrorCode;
  readonly claimIndex: number;
  readonly detail: string;
};

export type AnswerOutcome = {
  readonly outcome: "answered" | "refused-out-of-corpus" | "blocked-uncited" | "provider-error";
  readonly answer?: string;
  readonly claims: readonly Claim[];
  readonly retrievedChunks: readonly RetrievedChunk[];
  readonly validationErrors: readonly ValidationError[];
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly embeddingModelVersion: string;
  readonly seed: number | null;
  readonly seedUnsupported: boolean;
  readonly corpusSnapshotId: string;
  readonly corpusSnapshotHash: string;
  readonly providerProfileId: string;
  readonly promptHash: string;
  readonly answerHash?: string;
  readonly operatorMessageDe: string;
};

export type LedgerEntry = {
  readonly id: string;
  readonly previousHash: string;
  readonly sequence: number;
  readonly entryType: string;
  readonly outcome: Outcome;
  readonly canonicalPayload: string;
  readonly queryText: string | null;
  readonly querySha256: string;
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
  readonly timestampMs: number;
  readonly userIdHash: string;
  readonly metadata: Record<string, unknown>;
  readonly signature: string;
  readonly signatureKeyId: string;
};

export type QueryResult = AnswerOutcome & {
  readonly queryId: string;
  readonly ledgerEntry: LedgerEntry;
};
