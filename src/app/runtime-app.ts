import { startObservation } from "@langfuse/tracing";
import type { Pool } from "pg";
import type { AnswerOutcome, CorpusChunk, QueryResult } from "../domain/types.js";
import { sha256Hex, stableId } from "../lib/hash.js";
import { createPgPool } from "../lib/pg-pool.js";
import type { Clock } from "../lib/time.js";
import { systemClock } from "../lib/time.js";
import { AuditLedger } from "../modules/audit/ledger.js";
import { AuthService, hashOperatorId, type Session } from "../modules/auth/auth.js";
import { createLocalPasskey } from "../modules/auth/passkey-proof.js";
import {
  defaultEmbeddingProfile,
  defaultPromptTemplate,
  EvidenceEchoProvider,
  generateAnswer,
  generateAnswerAsync,
  type LlmProvider,
} from "../modules/generation/generation.js";
import type { EmbeddingProvider } from "../modules/ingest/embedding.js";
import { IngestionStore } from "../modules/ingest/ingest.js";
import { PostgresIngestionStore } from "../modules/ingest/postgres-store.js";
import { retrievePostgresChunks } from "../modules/retrieval/postgres-retrieval.js";
import { retrieveChunks } from "../modules/retrieval/retrieval.js";

export type RuntimeApp<
  TIngest extends IngestionStore | PostgresIngestionStore = IngestionStore | PostgresIngestionStore,
> = {
  readonly ledger: AuditLedger;
  readonly auth: AuthService;
  readonly ingest: TIngest;
  query(sessionId: string | null, query: string, topK?: number): QueryResult;
  queryAsync(sessionId: string | null, query: string, topK?: number): Promise<QueryResult>;
  bootstrapOperator(email: string): Session;
  findSourceChunk(docId: string, charOffset: number): Promise<CorpusChunk | null>;
  health(): Promise<RuntimeHealth>;
  close?(): Promise<void>;
};

export type RuntimeHealth = {
  readonly ok: boolean;
  readonly storage: "memory" | "postgres";
  readonly activeSnapshotId: string | null;
  readonly activeSnapshotHash: string | null;
  readonly ledgerEntries: number;
};

export type RuntimeAppOptions = {
  readonly provider?: LlmProvider;
  readonly clock?: Clock;
  readonly ledgerPath?: string;
};

export type PostgresRuntimeAppOptions = RuntimeAppOptions & {
  readonly databaseUrl: string;
  readonly pool?: Pool;
  readonly embeddingProvider?: EmbeddingProvider;
};

export function createRuntimeApp(options: RuntimeAppOptions = {}): RuntimeApp<IngestionStore> {
  const provider = options.provider ?? new EvidenceEchoProvider();
  const clock = options.clock ?? systemClock;
  const ledger = new AuditLedger(clock, options.ledgerPath);
  const auth = new AuthService(ledger, clock);
  const ingest = new IngestionStore(ledger, clock);
  return {
    ledger,
    auth,
    ingest,
    query: (sessionId, query, topK) =>
      executeQuery({
        ledger,
        auth,
        ingest,
        provider,
        sessionId,
        query,
        ...(topK === undefined ? {} : { topK }),
      }),
    queryAsync: (sessionId, query, topK) =>
      Promise.resolve(
        executeQuery({
          ledger,
          auth,
          ingest,
          provider,
          sessionId,
          query,
          ...(topK === undefined ? {} : { topK }),
        }),
      ),
    bootstrapOperator: (email) => bootstrapOperator(auth, email),
    findSourceChunk: (docId, charOffset) =>
      Promise.resolve(
        ingest
          .allChunks()
          .find((candidate) => candidate.docId === docId && candidate.charStart >= charOffset) ??
          null,
      ),
    health: () => {
      const active = ingest.activeSnapshot();
      return Promise.resolve({
        ok: true,
        storage: "memory",
        activeSnapshotId: active?.id ?? null,
        activeSnapshotHash: active?.snapshotHash ?? null,
        ledgerEntries: ledger.entries().length,
      });
    },
  };
}

export function createPostgresRuntimeApp(
  options: PostgresRuntimeAppOptions,
): RuntimeApp<PostgresIngestionStore> {
  const provider = options.provider ?? new EvidenceEchoProvider();
  const clock = options.clock ?? systemClock;
  const ledger = new AuditLedger(clock, options.ledgerPath);
  const auth = new AuthService(ledger, clock);
  const pool = options.pool ?? createPgPool(options.databaseUrl);
  const ownsPool = options.pool === undefined;
  const ingest = createPostgresIngest(options, ledger, clock, pool);
  return {
    ledger,
    auth,
    ingest,
    query: () => {
      throw new Error("Postgres runtime requires queryAsync");
    },
    queryAsync: (sessionId, query, topK) =>
      executePostgresQuery({
        ledger,
        auth,
        ingest,
        pool,
        provider,
        sessionId,
        query,
        ...(options.embeddingProvider === undefined
          ? {}
          : { embeddingProvider: options.embeddingProvider }),
        ...(topK === undefined ? {} : { topK }),
      }),
    bootstrapOperator: (email) => bootstrapOperator(auth, email),
    findSourceChunk: (docId, charOffset) => findPostgresSourceChunk(ingest, docId, charOffset),
    health: () => postgresHealth(ingest, ledger),
    close: () => closePostgresPool(pool, ownsPool),
  };
}

function createPostgresIngest(
  options: PostgresRuntimeAppOptions,
  ledger: AuditLedger,
  clock: Clock,
  pool: Pool,
): PostgresIngestionStore {
  return new PostgresIngestionStore({
    pool,
    ledger,
    ...(options.embeddingProvider === undefined
      ? {}
      : { embeddingProvider: options.embeddingProvider }),
    clock,
  });
}

async function findPostgresSourceChunk(
  ingest: PostgresIngestionStore,
  docId: string,
  charOffset: number,
): Promise<CorpusChunk | null> {
  const active = await ingest.activeSnapshot();
  if (active === null) {
    return null;
  }
  const chunks = await ingest.chunksForSnapshot(active.id);
  return (
    chunks.find((candidate) => candidate.docId === docId && candidate.charStart >= charOffset) ??
    null
  );
}

async function postgresHealth(
  ingest: PostgresIngestionStore,
  ledger: AuditLedger,
): Promise<RuntimeHealth> {
  const active = await ingest.activeSnapshot();
  return {
    ok: true,
    storage: "postgres",
    activeSnapshotId: active?.id ?? null,
    activeSnapshotHash: active?.snapshotHash ?? null,
    ledgerEntries: ledger.entries().length,
  };
}

async function closePostgresPool(pool: Pool, ownsPool: boolean): Promise<void> {
  if (ownsPool) {
    await pool.end();
  }
}

type QueryExecutionInput = {
  readonly ledger: AuditLedger;
  readonly auth: AuthService;
  readonly ingest: IngestionStore;
  readonly provider: LlmProvider;
  readonly sessionId: string | null;
  readonly query: string;
  readonly topK?: number;
};

type PostgresQueryExecutionInput = {
  readonly ledger: AuditLedger;
  readonly auth: AuthService;
  readonly ingest: PostgresIngestionStore;
  readonly pool: Pool;
  readonly provider: LlmProvider;
  readonly embeddingProvider?: EmbeddingProvider;
  readonly sessionId: string | null;
  readonly query: string;
  readonly topK?: number;
};

function executeQuery(input: QueryExecutionInput): QueryResult {
  // ISC-23 named startActiveObservation, executeQuery must stay synchronous.
  // startObservation fits the sync lifecycle and still inherits any active OTEL context.
  const span = startObservation("query", {
    input: { query: input.query, sessionId: input.sessionId, topK: input.topK },
  });
  try {
    const result = runQuery(input);
    span.update({ output: { outcome: result.outcome, queryId: result.queryId } });
    return result;
  } catch (error) {
    span.update({
      level: "ERROR",
      statusMessage: error instanceof Error ? error.message : "Unknown query error",
      metadata: { error: traceErrorMetadata(error) },
    });
    throw error;
  } finally {
    span.end();
  }
}

function runQuery(input: QueryExecutionInput): QueryResult {
  const session = input.auth.requireSession(input.sessionId);
  const snapshot = input.ingest.activeSnapshot();
  if (snapshot === null) {
    throw new Error("No active corpus snapshot");
  }
  const trace = retrieveChunks(input.query, input.ingest.allChunks(), {
    activeSnapshotId: snapshot.id,
    ...(input.topK === undefined ? {} : { topK: input.topK }),
  });
  const outcome = generateAnswer({
    query: input.query,
    trace,
    corpusSnapshotId: snapshot.id,
    corpusSnapshotHash: snapshot.snapshotHash,
    provider: input.provider,
    promptTemplate: defaultPromptTemplate,
    embeddingProfile: defaultEmbeddingProfile,
  });
  const ledgerInput = {
    entryType: `query.${outcome.outcome.replaceAll("-", "_")}`,
    outcome: outcome.outcome,
    queryText: input.query,
    retrievedChunks: outcome.retrievedChunks,
    claimCitations: outcome.claims.flatMap((claim) => claim.citations),
    modelVersion: outcome.modelVersion,
    promptVersion: outcome.promptVersion,
    embeddingModelVersion: outcome.embeddingModelVersion,
    providerProfileId: outcome.providerProfileId,
    providerReplayCapability: input.provider.profile.replayCapability,
    seed: outcome.seed,
    corpusSnapshotId: outcome.corpusSnapshotId,
    corpusSnapshotHash: outcome.corpusSnapshotHash,
    promptHash: outcome.promptHash,
    userIdHash: hashOperatorId(session.operatorId),
    extra: { queryId: stableId("query", [sha256Hex(input.query), session.id]) },
    ...(outcome.answer === undefined ? {} : { generatedAnswer: outcome.answer }),
  };
  return appendQueryLedger(input.ledger, outcome, ledgerInput);
}

async function executePostgresQuery(input: PostgresQueryExecutionInput): Promise<QueryResult> {
  const span = startObservation("query", {
    input: { query: input.query, sessionId: input.sessionId, topK: input.topK },
  });
  try {
    const session = input.auth.requireSession(input.sessionId);
    const snapshot = await input.ingest.activeSnapshot();
    if (snapshot === null) {
      throw new Error("No active corpus snapshot");
    }
    const trace = await retrievePostgresChunks(
      input.pool,
      input.query,
      {
        activeSnapshotId: snapshot.id,
        ...(input.topK === undefined ? {} : { topK: input.topK }),
      },
      input.embeddingProvider,
    );
    const outcome = await generateAnswerAsync({
      query: input.query,
      trace,
      corpusSnapshotId: snapshot.id,
      corpusSnapshotHash: snapshot.snapshotHash,
      provider: input.provider,
      promptTemplate: defaultPromptTemplate,
      embeddingProfile: input.embeddingProvider?.profile ?? defaultEmbeddingProfile,
    });
    const result = appendQueryLedger(input.ledger, outcome, {
      entryType: `query.${outcome.outcome.replaceAll("-", "_")}`,
      outcome: outcome.outcome,
      queryText: input.query,
      retrievedChunks: outcome.retrievedChunks,
      claimCitations: outcome.claims.flatMap((claim) => claim.citations),
      modelVersion: outcome.modelVersion,
      promptVersion: outcome.promptVersion,
      embeddingModelVersion: outcome.embeddingModelVersion,
      providerProfileId: outcome.providerProfileId,
      providerReplayCapability: input.provider.profile.replayCapability,
      seed: outcome.seed,
      corpusSnapshotId: outcome.corpusSnapshotId,
      corpusSnapshotHash: outcome.corpusSnapshotHash,
      promptHash: outcome.promptHash,
      userIdHash: hashOperatorId(session.operatorId),
      extra: { queryId: stableId("query", [sha256Hex(input.query), session.id]) },
      ...(outcome.answer === undefined ? {} : { generatedAnswer: outcome.answer }),
    });
    span.update({ output: { outcome: result.outcome, queryId: result.queryId } });
    return result;
  } catch (error) {
    span.update({
      level: "ERROR",
      statusMessage: error instanceof Error ? error.message : "Unknown query error",
      metadata: { error: traceErrorMetadata(error) },
    });
    throw error;
  } finally {
    span.end();
  }
}

function appendQueryLedger(
  ledger: AuditLedger,
  outcome: AnswerOutcome,
  ledgerInput: Parameters<AuditLedger["append"]>[0],
): QueryResult {
  const ledgerEntry = ledger.append(ledgerInput);
  const metadata = ledgerEntry.metadata as { readonly queryId?: unknown };
  const queryId = metadata.queryId;
  if (typeof queryId !== "string") {
    throw new Error("query id was not ledgered");
  }
  return { ...outcome, queryId, ledgerEntry };
}

function traceErrorMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  return { message: String(error) };
}

function bootstrapOperator(auth: AuthService, email: string): Session {
  const request = auth.requestMagicLink(email);
  const consumed = auth.consumeMagicLink(request.token);
  const passkey = createLocalPasskey();
  const registration = auth.createPasskeyRegistrationOptions(consumed.operatorId);
  auth.registerPasskey({
    operatorId: consumed.operatorId,
    credentialId: passkey.credentialId,
    publicKeyPem: passkey.publicKeyPem,
    challenge: registration.challenge,
    signatureBase64Url: passkey.signChallenge(registration.challenge),
  });
  const authentication = auth.createPasskeyAuthenticationOptions(consumed.operatorId);
  return auth.loginWithPasskey({
    operatorId: consumed.operatorId,
    credentialId: passkey.credentialId,
    challenge: authentication.challenge,
    signatureBase64Url: passkey.signChallenge(authentication.challenge),
  });
}
