import type {
  AnswerOutcome,
  CorpusChunk,
  EmbeddingProfile,
  LedgerEntry,
  ProviderProfile,
} from "../domain/types.js";
import { sha256Hex } from "../lib/hash.js";
import type { Clock } from "../lib/time.js";
import { systemClock } from "../lib/time.js";
import { AuditLedger, type LedgerVerification } from "../modules/audit/ledger.js";
import { loadFixtureCorpus, pinnedEvalTuple } from "../modules/eval/eval.js";
import { EvidenceExtractProvider } from "../modules/generation/extractive.js";
import { defaultPromptTemplate, generateAnswer } from "../modules/generation/generation.js";
import {
  type ReplayResult,
  replayArtifactsFromEntry,
  replayLedgerEntry,
} from "../modules/replay/replay.js";
import { retrieveChunks } from "../modules/retrieval/retrieval.js";

const demoSnapshotId = pinnedEvalTuple.corpusSnapshotId;
const demoSnapshotHash = sha256Hex(demoSnapshotId);
export const demoMaxQueryLength = 300;
const demoTopK = 4;

const lexicalRetrievalVersion = "lexical-bm25-rrf@1.0.0";

/**
 * The demo runs the in-memory retrieval path, which scores by term overlap and fuses with RRF. It
 * loads no embedding model. Writing the repo's `bge-m3@1024-v1` default into the ledger here would
 * make the row claim an embedding profile that never ran, and a ledger that misreports how an
 * answer was produced is worth nothing. So the demo declares what it actually used.
 */
const demoEmbeddingProfile: EmbeddingProfile = {
  id: "lexical-rrf",
  modelVersion: lexicalRetrievalVersion,
  dimension: 0,
  configHash: sha256Hex(lexicalRetrievalVersion),
};

/**
 * The public demo has no operator and never gets one. Every row it writes is attributed to this
 * one constant hash, so the ledger records that a demo visitor asked without recording who.
 */
const demoUserIdHash = sha256Hex("public-demo");

const rateLimitWindowMs = 5 * 60 * 1000;
const rateLimitMaxQueries = 20;
const rateLimitMaxKeys = 5000;

/**
 * The per-client cap is keyed on `x-forwarded-for`, which the caller controls: anyone can cycle the
 * header and mint a fresh bucket per request. It is a speed bump against casual abuse, not a bound.
 * This global cap is the bound. It is keyless, so no header trick evades it, and it is what limits
 * how fast a public visitor can grow an append-only ledger on disk.
 */
const rateLimitMaxGlobalWrites = 60;
const globalRateLimitKey = "__global__";

type DemoAnswer = {
  readonly outcome: AnswerOutcome;
  readonly entry: LedgerEntry;
};

type DemoReplay = {
  readonly entry: LedgerEntry;
  readonly result: ReplayResult;
};

export type DemoApp = {
  readonly ledger: AuditLedger;
  readonly chunks: readonly CorpusChunk[];
  readonly providerProfile: ProviderProfile;
  readonly examples: readonly string[];
  ask(query: string): DemoAnswer;
  replay(entryId: string): DemoReplay;
  entryById(entryId: string): LedgerEntry;
  verify(): LedgerVerification;
  allow(clientKey: string): boolean;
};

export type DemoAppOptions = {
  readonly corpusDir?: string;
  readonly ledgerPath?: string;
  readonly clock?: Clock;
};

/**
 * Questions worded to match the corpus. `foldGerman` lets these carry real umlauts even though the
 * fixture stores Article 50 transliterated. The last one has no answer in the corpus on purpose:
 * the demo has to be able to show a refusal, not only a hit.
 */
const demoExamples: readonly string[] = [
  "Muss offengelegt werden, dass ein Text künstlich erzeugt wurde?",
  "Wie müssen synthetische Inhalte gekennzeichnet werden?",
  "Wann müssen Personen über die Interaktion informiert werden?",
  "Welche Ausnahme gilt für die Strafverfolgung?",
  "Welche Eigenkapitalquote verlangt die CRR für Sparkassen im Jahr 2030?",
];

export async function createDemoApp(options: DemoAppOptions = {}): Promise<DemoApp> {
  const clock = options.clock ?? systemClock;
  const ledger = new AuditLedger(clock, options.ledgerPath);
  const chunks = await loadFixtureCorpus(options.corpusDir ?? "corpus-fixtures");
  const provider = new EvidenceExtractProvider();
  const limiter = new RateLimiter(clock);
  return {
    ledger,
    chunks,
    providerProfile: provider.profile,
    examples: demoExamples,
    ask: (query) => ask(ledger, chunks, provider, query),
    replay: (entryId) => replay(ledger, provider, entryId),
    entryById: (entryId) => ledger.findById(entryId),
    verify: () => ledger.verifyRows(),
    allow: (clientKey) => limiter.allow(clientKey),
  };
}

function ask(
  ledger: AuditLedger,
  chunks: readonly CorpusChunk[],
  provider: EvidenceExtractProvider,
  query: string,
): DemoAnswer {
  const trace = retrieveChunks(query, chunks, {
    activeSnapshotId: demoSnapshotId,
    topK: demoTopK,
  });
  const outcome = generateAnswer({
    query,
    trace,
    corpusSnapshotId: demoSnapshotId,
    corpusSnapshotHash: demoSnapshotHash,
    provider,
    promptTemplate: defaultPromptTemplate,
    embeddingProfile: demoEmbeddingProfile,
  });
  return { outcome, entry: ledger.append(ledgerInput(outcome, query, provider.profile)) };
}

function ledgerInput(outcome: AnswerOutcome, query: string, profile: ProviderProfile) {
  return {
    entryType: `query.${outcome.outcome.replaceAll("-", "_")}`,
    outcome: outcome.outcome,
    queryText: query,
    retrievedChunks: outcome.retrievedChunks,
    claimCitations: outcome.claims.flatMap((claim) => claim.citations),
    modelVersion: outcome.modelVersion,
    promptVersion: outcome.promptVersion,
    embeddingModelVersion: outcome.embeddingModelVersion,
    providerProfileId: outcome.providerProfileId,
    providerReplayCapability: profile.replayCapability,
    seed: outcome.seed,
    corpusSnapshotId: outcome.corpusSnapshotId,
    corpusSnapshotHash: outcome.corpusSnapshotHash,
    promptHash: outcome.promptHash,
    userIdHash: demoUserIdHash,
    ...(outcome.answer === undefined ? {} : { generatedAnswer: outcome.answer }),
  };
}

function replay(
  ledger: AuditLedger,
  provider: EvidenceExtractProvider,
  entryId: string,
): DemoReplay {
  const entry = ledger.findById(entryId);
  return {
    entry,
    result: replayLedgerEntry(ledger, entry, provider, replayArtifactsFromEntry(entry)),
  };
}

/**
 * Fixed-window cap over the demo's write paths. Every answer AND every replay appends a signed row
 * to an append-only ledger, so both must pass through here: an unthrottled replay would let anyone
 * take one entry id off the public page and grow the ledger without limit.
 *
 * Two windows, and only one of them is a real bound. The per-client window is keyed on a header the
 * caller controls, so a spoofer mints a fresh bucket per request and walks through it. The global
 * window is keyless and is what actually bounds disk growth.
 */
class RateLimiter {
  private readonly windows = new Map<string, { startMs: number; count: number }>();

  constructor(private readonly clock: Clock) {}

  allow(clientKey: string): boolean {
    const now = this.clock.now();
    this.prune(now);
    if (!this.wouldAllow(clientKey, rateLimitMaxQueries, now)) {
      return false;
    }
    if (!this.wouldAllow(globalRateLimitKey, rateLimitMaxGlobalWrites, now)) {
      return false;
    }
    this.consume(clientKey, now);
    this.consume(globalRateLimitKey, now);
    return true;
  }

  private wouldAllow(key: string, max: number, now: number): boolean {
    const current = this.windows.get(key);
    if (current === undefined || now - current.startMs >= rateLimitWindowMs) {
      return true;
    }
    return current.count < max;
  }

  private consume(key: string, now: number): void {
    const current = this.windows.get(key);
    if (current === undefined || now - current.startMs >= rateLimitWindowMs) {
      this.windows.set(key, { startMs: now, count: 1 });
      return;
    }
    current.count += 1;
  }

  private prune(now: number): void {
    if (this.windows.size < rateLimitMaxKeys) {
      return;
    }
    for (const [key, window] of this.windows) {
      if (key !== globalRateLimitKey && now - window.startMs >= rateLimitWindowMs) {
        this.windows.delete(key);
      }
    }
  }
}
