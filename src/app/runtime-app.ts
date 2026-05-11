import type { QueryResult } from "../domain/types.js";
import { sha256Hex, stableId } from "../lib/hash.js";
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
  type LlmProvider,
} from "../modules/generation/generation.js";
import { IngestionStore } from "../modules/ingest/ingest.js";
import { retrieveChunks } from "../modules/retrieval/retrieval.js";

export type RuntimeApp = {
  readonly ledger: AuditLedger;
  readonly auth: AuthService;
  readonly ingest: IngestionStore;
  query(sessionId: string | null, query: string, topK?: number): QueryResult;
  bootstrapOperator(email: string): Session;
};

export type RuntimeAppOptions = {
  readonly provider?: LlmProvider;
  readonly clock?: Clock;
};

export function createRuntimeApp(options: RuntimeAppOptions = {}): RuntimeApp {
  const provider = options.provider ?? new EvidenceEchoProvider();
  const clock = options.clock ?? systemClock;
  const ledger = new AuditLedger(clock);
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
    bootstrapOperator: (email) => bootstrapOperator(auth, email),
  };
}

function executeQuery(input: {
  readonly ledger: AuditLedger;
  readonly auth: AuthService;
  readonly ingest: IngestionStore;
  readonly provider: LlmProvider;
  readonly sessionId: string | null;
  readonly query: string;
  readonly topK?: number;
}): QueryResult {
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
  const ledgerEntry = input.ledger.append(ledgerInput);
  const metadata = ledgerEntry.metadata as { readonly queryId?: unknown };
  const queryId = metadata.queryId;
  if (typeof queryId !== "string") {
    throw new Error("query id was not ledgered");
  }
  return { ...outcome, queryId, ledgerEntry };
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
