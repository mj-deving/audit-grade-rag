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
import {
  computeFixtureCorpusSnapshotHash,
  loadFixtureCorpus,
  pinnedEvalTuple,
} from "../modules/eval/eval.js";
import { EvidenceExtractProvider } from "../modules/generation/extractive.js";
import { defaultPromptTemplate, generateAnswer } from "../modules/generation/generation.js";
import {
  type ReplayResult,
  replayArtifactsFromEntry,
  replayLedgerEntry,
} from "../modules/replay/replay.js";
import { retrieveChunks } from "../modules/retrieval/retrieval.js";

const demoSnapshotId = pinnedEvalTuple.corpusSnapshotId;
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

/**
 * A hard ceiling on the demo ledger, independent of the per-window rate. The rate cap bounds how
 * FAST the ledger grows; this bounds how LARGE it ever gets. The demo runs in its own container
 * against its own volume (services/audit-grade-rag/install.sh), so this only ever bounds the demo's
 * own disk, never the operator's, but an append-only ledger with no ceiling still fills a disk given
 * enough uptime. Demo rows carry no retention value; past the ceiling the demo refuses new writes
 * until the ledger is reset (a fresh volume on deploy, or the volume cleared).
 */
const demoMaxTotalRows = 5000;

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
  replayable(entryId: string): boolean;
  entryById(entryId: string): LedgerEntry;
  atCapacity(): boolean;
  verify(): LedgerVerification;
  allow(clientKey: string): boolean;
};

export type DemoAppOptions = {
  readonly corpusDir?: string;
  readonly ledgerPath?: string;
  readonly clock?: Clock;
  readonly maxTotalRows?: number;
};

/**
 * Questions worded to match the corpus. `foldGerman` keeps retrieval umlaut-agnostic, so these match
 * whether typed with umlauts or transliterated. The last one has no answer in the corpus on purpose:
 * the demo has to be able to show a refusal, not only a hit.
 *
 * "Worded to match" is a hard constraint here, not a style note. Retrieval on this surface is
 * lexical with no stemming (see docs/eval-harness.md), so a question has to share actual words with
 * the text. The law-enforcement example used to read "Welche Ausnahme gilt für die
 * Strafverfolgung?", which shares none — the corpus says "Diese Pflicht gilt nicht" and "Verfolgung
 * von Straftaten", never "Ausnahme" or "Strafverfolgung". It only ever appeared to work because the
 * pre-IDF scorer answered on stopword overlap and cited half the corpus for every question. Under
 * evidence-weighted scoring it scored 0.196 against the 0.3 threshold — statistically level with
 * the CRR question that is deliberately not in the corpus at all.
 */
const demoExamples: readonly string[] = [
  "Muss offengelegt werden, dass ein Text künstlich erzeugt wurde?",
  "Wie müssen synthetische Inhalte gekennzeichnet werden?",
  "Wann müssen Personen über die Interaktion informiert werden?",
  "Gilt die Pflicht auch für KI-Systeme zur Verfolgung von Straftaten?",
  "Welche Eigenkapitalquote verlangt die CRR für Sparkassen im Jahr 2030?",
];

export async function createDemoApp(options: DemoAppOptions = {}): Promise<DemoApp> {
  const clock = options.clock ?? systemClock;
  const ledger = new AuditLedger(clock, options.ledgerPath);
  const chunks = await loadFixtureCorpus(options.corpusDir ?? "corpus-fixtures");
  const provider = new EvidenceExtractProvider();
  const limiter = new RateLimiter(clock);
  const maxTotalRows = options.maxTotalRows ?? demoMaxTotalRows;

  // ask() and replay() are the only paths that append, so this counter tracks the ledger length
  // exactly, without an O(n) scan per request. It drives two things: the capacity ceiling, and a
  // verification cache. Re-verifying the whole Ed25519 chain on every page render is an
  // unauthenticated O(n) cost a GET flood can trigger; caching it and recomputing only after a
  // write keeps a read O(1).
  let rowCount = ledger.entries().length;
  let cachedVerification: LedgerVerification | null = null;
  let verifiedAtRow = -1;
  const verify = (): LedgerVerification => {
    if (cachedVerification === null || verifiedAtRow !== rowCount) {
      cachedVerification = ledger.verifyRows();
      verifiedAtRow = rowCount;
    }
    return cachedVerification;
  };

  return {
    ledger,
    chunks,
    providerProfile: provider.profile,
    examples: demoExamples,
    ask: (query) => {
      const answer = ask(ledger, chunks, provider, query);
      rowCount += 1;
      return answer;
    },
    replay: (entryId) => {
      const replayed = replay(ledger, provider, entryId);
      rowCount += 1;
      return replayed;
    },
    replayable: (entryId) => replayable(ledger, entryId),
    entryById: (entryId) => ledger.findById(entryId),
    atCapacity: () => rowCount >= maxTotalRows,
    verify,
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
    corpusSnapshotHash: computeFixtureCorpusSnapshotHash(chunks),
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

/**
 * Whether a replay of this row would actually append anything. The rate limit is a budget for
 * ledger WRITES, so a request that cannot write must not spend it: otherwise anyone could drain the
 * global window with unknown ids and 429 the demo for every real visitor without growing the ledger
 * by a single row.
 */
function replayable(ledger: AuditLedger, entryId: string): boolean {
  try {
    return ledger.findById(entryId).generatedAnswer !== null;
  } catch {
    return false;
  }
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
