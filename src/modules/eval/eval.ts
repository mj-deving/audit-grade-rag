import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnswerOutcome, CorpusChunk } from "../../domain/types.js";
import { canonicalJson } from "../../lib/canonical-json.js";
import { sha256Hex, stableId } from "../../lib/hash.js";
import {
  defaultEmbeddingProfile,
  defaultPromptTemplate,
  generateAnswer,
  type LlmProvider,
  type LlmRequest,
} from "../generation/generation.js";
import { defaultEmbeddingModel } from "../ingest/embedding.js";
import { retrieveChunks } from "../retrieval/retrieval.js";
import {
  defaultEmbeddingCachePath,
  denseScoresFromCache,
  loadEmbeddingCache,
} from "./embedding-cache.js";

export type ExpectedOutcome = "answered" | "refused-out-of-corpus" | "blocked-unsafe";

export type GoldenCase = {
  readonly id: string;
  readonly question: string;
  readonly expected_outcome: ExpectedOutcome;
  readonly expected_chunks?: readonly string[];
  readonly tags: readonly string[];
};

export type EvalMetrics = {
  readonly groundedness: number;
  readonly citationAccuracy: number;
  readonly refusalCorrectness: number;
  readonly perTagBreakdown: Record<
    string,
    { readonly total: number; readonly passed: number; readonly score: number }
  >;
};

export type PinnedEvalTuple = {
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly embeddingModelVersion: string;
  readonly corpusSnapshotId: string;
};

export type EvalRun = EvalMetrics & {
  readonly status: "passed" | "failed";
  readonly caseCount: number;
  readonly pinnedTuple: PinnedEvalTuple;
  readonly thresholds: typeof evalThresholds;
  readonly outputJson: string;
};

export const defaultGoldenSetPath = "eval/golden/v1.jsonl";
export const defaultCorpusFixtureDir = "corpus-fixtures";
export const evalThresholds = {
  groundedness: 0.95,
  citationAccuracy: 0.95,
  refusalCorrectness: 0.9,
} as const;
export const pinnedEvalTuple: PinnedEvalTuple = {
  modelVersion: "eval-cited-provider@1.0.0",
  promptVersion: defaultPromptTemplate.version,
  embeddingModelVersion: defaultEmbeddingModel,
  corpusSnapshotId: "corpus-fixtures:v1",
};

export async function loadGoldenSet(path: string): Promise<readonly GoldenCase[]> {
  return parseGoldenSet(await readFile(path, "utf8"));
}

export function parseGoldenSet(content: string): readonly GoldenCase[] {
  const lines = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("Golden set is empty");
  }
  const cases = lines.map((line, index) => parseGoldenLine(line, index + 1));
  const ids = new Set<string>();
  for (const goldenCase of cases) {
    if (ids.has(goldenCase.id)) {
      throw new Error(`Duplicate case ID: ${goldenCase.id}`);
    }
    ids.add(goldenCase.id);
  }
  return cases;
}

export function evaluateGoldenSet(
  cases: readonly GoldenCase[],
  outcomes: ReadonlyMap<string, AnswerOutcome>,
  pinnedTuple: PinnedEvalTuple = pinnedEvalTuple,
): EvalRun {
  if (cases.length === 0) {
    throw new Error("Golden set is empty");
  }
  const grounded = cases.map((goldenCase) =>
    scoreGroundedness(goldenCase, outcomes.get(goldenCase.id)),
  );
  const citations = cases.map((goldenCase) =>
    scoreCitationAccuracy(goldenCase, outcomes.get(goldenCase.id)),
  );
  const refusals = cases.map((goldenCase) => scoreRefusal(goldenCase, outcomes.get(goldenCase.id)));
  const metrics: EvalMetrics = {
    groundedness: average(grounded),
    citationAccuracy: average(citations),
    refusalCorrectness: average(refusals),
    perTagBreakdown: perTag(cases, grounded),
  };
  const passed =
    metrics.groundedness >= evalThresholds.groundedness &&
    metrics.citationAccuracy >= evalThresholds.citationAccuracy &&
    metrics.refusalCorrectness >= evalThresholds.refusalCorrectness;
  return {
    ...metrics,
    status: passed ? "passed" : "failed",
    caseCount: cases.length,
    pinnedTuple,
    thresholds: evalThresholds,
    outputJson: canonicalJson({
      status: passed ? "passed" : "failed",
      ...metrics,
      caseCount: cases.length,
      pinnedTuple,
      thresholds: evalThresholds,
      "citation-accuracy": metrics.citationAccuracy,
      "refusal-correctness": metrics.refusalCorrectness,
    }),
  };
}

export async function runGoldenEvaluation(
  options: {
    readonly goldenPath?: string;
    readonly corpusDir?: string;
    readonly embeddingCachePath?: string;
  } = {},
): Promise<EvalRun> {
  const cases = await loadGoldenSet(options.goldenPath ?? defaultGoldenSetPath);
  const chunks = await loadFixtureCorpus(options.corpusDir ?? defaultCorpusFixtureDir);
  // H-11 Option A: the eval retrieves with the SAME modality production does — real bge-m3 dense
  // vectors — read from a committed cache computed at author time over the fixed corpus and golden
  // set. The pin `bge-m3@1024-v1` is no longer a label over a lexical path; it names the model that
  // actually ranks. The guard below refuses a cache produced by a different model, so a stale cache
  // cannot silently make the pin lie again.
  const cache = await loadEmbeddingCache(options.embeddingCachePath ?? defaultEmbeddingCachePath);
  if (cache.provenance.embeddingModelVersion !== pinnedEvalTuple.embeddingModelVersion) {
    throw new Error(
      `embedding cache model ${cache.provenance.embeddingModelVersion} does not match the pinned eval model ${pinnedEvalTuple.embeddingModelVersion}`,
    );
  }
  const outcomes = new Map(
    cases.map((goldenCase) => [
      goldenCase.id,
      runGoldenCase(
        goldenCase,
        chunks,
        pinnedEvalTuple,
        denseScoresFromCache(cache, goldenCase.question, chunks),
      ),
    ]),
  );
  return evaluateGoldenSet(cases, outcomes, pinnedEvalTuple);
}

export function defaultPassingEval(): EvalRun {
  const cases = parseGoldenSet(
    [
      JSON.stringify({
        id: "answered-1",
        question: "Welche Pflicht gilt?",
        expected_outcome: "answered",
        expected_chunks: ["chunk_a"],
        tags: ["multi-hop"],
      }),
      JSON.stringify({
        id: "refusal-1",
        question: "Was steht nicht im Korpus?",
        expected_outcome: "refused-out-of-corpus",
        tags: ["out-of-corpus"],
      }),
    ].join("\n"),
  );
  const outcomes = new Map<string, AnswerOutcome>([
    ["answered-1", fixtureOutcome("answered", ["chunk_a"])],
    ["refusal-1", fixtureOutcome("refused-out-of-corpus", [])],
  ]);
  return evaluateGoldenSet(cases, outcomes);
}

function parseGoldenLine(line: string, lineNumber: number): GoldenCase {
  const value = JSON.parse(line) as Partial<GoldenCase>;
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`Missing case ID at line ${String(lineNumber)}`);
  }
  if (typeof value.question !== "string" || value.question.length === 0) {
    throw new Error(`Missing question at line ${String(lineNumber)}`);
  }
  if (!isExpectedOutcome(value.expected_outcome)) {
    throw new Error(`Missing expected outcome at line ${String(lineNumber)}`);
  }
  const parsed: GoldenCase = {
    id: value.id,
    question: value.question,
    expected_outcome: value.expected_outcome,
    tags: stringArray(value.tags),
  };
  return value.expected_chunks === undefined
    ? parsed
    : { ...parsed, expected_chunks: stringArray(value.expected_chunks) };
}

/**
 * Chunk ids must be unique across the WHOLE corpus, not merely within a file.
 *
 * A per-file check is not enough, and the difference is the product: a citation names a chunk id,
 * and `reciprocalRankFusion` keys its score map on that id. Two files each carrying
 * `<!-- chunk:dup -->` therefore fuse into one entry whose score came from both texts and whose
 * displayed text is whichever the map happened to keep.
 *
 * Verified 2026-07-16 with two fixture files under one id — one harmless, one carrying fabricated
 * banking text. The out-of-corpus CRR question was ANSWERED (the fabrication opened the refusal
 * gate) and the answer cited the OTHER file's harmless sentence as its evidence. An answer whose
 * gate was opened by text it does not cite is precisely the failure this project exists to make
 * impossible, so this is a load error, not a warning.
 */
export async function loadFixtureCorpus(corpusDir: string): Promise<readonly CorpusChunk[]> {
  const files = (await readdir(corpusDir))
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(corpusDir, file))
    .sort();
  const perFile = await Promise.all(files.map((file) => chunksFromFixtureFile(file)));
  const chunks = perFile.flat();
  const seenIn = new Map<string, string>();
  for (const chunk of chunks) {
    const previous = seenIn.get(chunk.chunkId);
    if (previous !== undefined) {
      throw new Error(
        `${corpusDir}: duplicate chunk id "${chunk.chunkId}" in ${previous} and ${chunk.sourcePath} — chunk ids must be unique across the corpus`,
      );
    }
    seenIn.set(chunk.chunkId, chunk.sourcePath);
  }
  const corpusSnapshotHash = computeFixtureCorpusSnapshotHash(chunks);
  return chunks.map((chunk) => ({ ...chunk, corpusSnapshotHash }));
}

/**
 * The snapshot hash that the ledger, eval outcomes and demo rows attest MUST be recomputable from
 * the corpus, not from its label. It once was `sha256(corpusSnapshotId)` — a hash of the string
 * "corpus-fixtures:v1" — so a signed row could not be verified against the corpus it named, which
 * is the failure this product exists to disprove. Like the ingest path's content hash (`ingest.ts`),
 * it is derived from the chunk contents rather than a label: a canonical-JSON manifest over each
 * chunk's id and the SHA-256 of its text, sorted so read order cannot change it, folded with the
 * count so a re-chunk moves it. Change a corpus byte and this moves; change only the label and it
 * does not.
 */
export function computeFixtureCorpusSnapshotHash(chunks: readonly CorpusChunk[]): string {
  // Digest each chunk from its TEXT, recomputed here, not from the stored `chunkSha256` field. The
  // ledger attests the text it serves, and a chunk whose stored sha had drifted from its text would
  // otherwise be signed under a hash that reflects the field rather than the bytes — the same class
  // of "the attestation does not match the artefact" this item exists to close. The tuples go
  // through canonical JSON rather than a delimiter join so that no chunk id can smuggle the join
  // separator and forge a different corpus into the same manifest string.
  const manifest = chunks
    .map((chunk) => ({ chunkId: chunk.chunkId, textSha256: sha256Hex(chunk.chunkText) }))
    .sort((a, b) => {
      const left = `${a.chunkId} ${a.textSha256}`;
      const right = `${b.chunkId} ${b.textSha256}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return sha256Hex(canonicalJson({ chunks: manifest, count: manifest.length }));
}

export type ParsedFixtureChunk = {
  readonly chunkId: string;
  readonly chunkText: string;
};

/**
 * The one parser for fixture chunk markers. Runtime retrieval and the provenance gate MUST agree on
 * what a fixture file contains, and they did not: this returned an ordered array that kept every
 * marker, while the gate in `corpus-provenance.unit.test.ts` kept a `Map` keyed on chunk id, so a
 * repeated id silently collapsed to its last occurrence.
 *
 * Verified 2026-07-16 by injecting a second `<!-- chunk:art50-marking -->` carrying an invented
 * sentence that inverts the law's duty into a discretion ("Anbieter duerfen ... nach eigenem
 * Ermessen kennzeichnen"). The corpus loaded 15 chunks with two under that id, the fabrication
 * among them, citable and signable — and all four provenance tests passed. The gate built to keep
 * paraphrase out of the corpus was blind to the one shape that mattered.
 *
 * Duplicate ids are therefore a hard parse error rather than a lint: `addRrfScores` also keys on
 * chunk id and would fuse two different texts into one score, and a citation to a duplicated id
 * does not identify which text was cited — which is the whole product.
 *
 * This function only sees one file. Uniqueness across the corpus is enforced in
 * `loadFixtureCorpus`, because the cross-file case is the one that actually shipped an answer
 * citing text that did not open its gate.
 */
export function parseFixtureChunks(content: string, path: string): readonly ParsedFixtureChunk[] {
  const parts = content.split(/<!--\s*chunk:([A-Za-z0-9_-]+)\s*-->/u);
  const chunks: ParsedFixtureChunk[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < parts.length; index += 2) {
    const chunkId = parts[index];
    const chunkText = parts[index + 1]?.trim();
    if (chunkId === undefined || chunkText === undefined || chunkText.length === 0) {
      continue;
    }
    if (seen.has(chunkId)) {
      throw new Error(`${path}: duplicate chunk id "${chunkId}" — chunk ids must be unique`);
    }
    seen.add(chunkId);
    chunks.push({ chunkId, chunkText });
  }
  return chunks;
}

async function chunksFromFixtureFile(path: string): Promise<readonly CorpusChunk[]> {
  const parsed = parseFixtureChunks(await readFile(path, "utf8"), path);
  return parsed.map((chunk, index) => fixtureChunk(path, chunk.chunkId, chunk.chunkText, index));
}

function fixtureChunk(
  path: string,
  chunkId: string,
  chunkText: string,
  chunkIndex: number,
): CorpusChunk {
  return {
    chunkId,
    docId: stableId("doc", [path]),
    sourceDocumentId: stableId("src", [path]),
    sourceType: "markdown",
    sourcePath: path,
    pageStart: 1,
    pageEnd: 1,
    charStart: 0,
    charEnd: chunkText.length,
    tokenStart: 0,
    tokenEnd: chunkText.split(/\s+/u).length,
    chunkIndex,
    chunkText,
    chunkSha256: sha256Hex(chunkText),
    corpusSnapshotId: pinnedEvalTuple.corpusSnapshotId,
    // Stamped by loadFixtureCorpus once the whole corpus is known — the corpus hash cannot be
    // computed from a single chunk, and hashing the label here was the H-12 defect.
    corpusSnapshotHash: "",
    extractionWarnings: [],
    ocrUsed: false,
  };
}

export function runGoldenCase(
  goldenCase: GoldenCase,
  chunks: readonly CorpusChunk[],
  tuple: PinnedEvalTuple,
  denseScores?: ReadonlyMap<string, number>,
): AnswerOutcome {
  const trace = retrieveChunks(goldenCase.question, chunks, {
    activeSnapshotId: tuple.corpusSnapshotId,
    ...(denseScores === undefined ? {} : { denseScores }),
  });
  return generateAnswer({
    query: goldenCase.question,
    trace,
    corpusSnapshotId: tuple.corpusSnapshotId,
    corpusSnapshotHash: computeFixtureCorpusSnapshotHash(chunks),
    provider: new EvalCitedProvider(tuple.modelVersion),
    promptTemplate: {
      ...defaultPromptTemplate,
      version: tuple.promptVersion,
    },
    embeddingProfile: {
      ...defaultEmbeddingProfile,
      modelVersion: tuple.embeddingModelVersion,
    },
  });
}

export function scoreGroundedness(
  goldenCase: GoldenCase,
  outcome: AnswerOutcome | undefined,
): number {
  if (outcome === undefined) {
    return 0;
  }
  if (goldenCase.expected_outcome === "answered") {
    return outcome.outcome === "answered" &&
      outcome.claims.every((claim) => claim.citations.length > 0)
      ? 1
      : 0;
  }
  return outcome.outcome === goldenCase.expected_outcome ? 1 : 0;
}

export function scoreCitationAccuracy(
  goldenCase: GoldenCase,
  outcome: AnswerOutcome | undefined,
): number {
  if (goldenCase.expected_outcome !== "answered") {
    return 1;
  }
  const expected = goldenCase.expected_chunks ?? [];
  const cited = new Set(
    outcome?.claims.flatMap((claim) => claim.citations.map((citation) => citation.chunkId)) ?? [],
  );
  return expected.every((chunkId) => cited.has(chunkId)) ? 1 : 0;
}

export function scoreRefusal(goldenCase: GoldenCase, outcome: AnswerOutcome | undefined): number {
  if (goldenCase.expected_outcome !== "refused-out-of-corpus") {
    return 1;
  }
  return outcome?.outcome === "refused-out-of-corpus" ? 1 : 0;
}

function perTag(
  cases: readonly GoldenCase[],
  scores: readonly number[],
): Record<string, { readonly total: number; readonly passed: number; readonly score: number }> {
  const totals = new Map<string, { total: number; passed: number }>();
  cases.forEach((goldenCase, index) => {
    for (const tag of goldenCase.tags) {
      const current = totals.get(tag) ?? { total: 0, passed: 0 };
      totals.set(tag, {
        total: current.total + 1,
        passed: current.passed + (scores[index] === 1 ? 1 : 0),
      });
    }
  });
  return Object.fromEntries(
    [...totals.entries()].map(([tag, value]) => [
      tag,
      { ...value, score: value.total === 0 ? 0 : value.passed / value.total },
    ]),
  );
}

function average(scores: readonly number[]): number {
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function isExpectedOutcome(value: unknown): value is ExpectedOutcome {
  return value === "answered" || value === "refused-out-of-corpus" || value === "blocked-unsafe";
}

function fixtureOutcome(
  outcome: AnswerOutcome["outcome"],
  chunkIds: readonly string[],
  tuple: PinnedEvalTuple = pinnedEvalTuple,
): AnswerOutcome {
  const base: AnswerOutcome = {
    outcome,
    claims:
      outcome === "answered"
        ? [
            {
              id: "claim_a",
              index: 0,
              text: "Antwort",
              citations: chunkIds.map((chunkId) => ({
                claimIndex: 0,
                chunkId,
                marker: `[chunk:${chunkId}]`,
              })),
            },
          ]
        : [],
    retrievedChunks: [],
    validationErrors: [],
    modelVersion: tuple.modelVersion,
    promptVersion: tuple.promptVersion,
    embeddingModelVersion: tuple.embeddingModelVersion,
    seed: 42,
    seedUnsupported: false,
    corpusSnapshotId: tuple.corpusSnapshotId,
    corpusSnapshotHash: sha256Hex(tuple.corpusSnapshotId),
    providerProfileId: "stub-llm",
    promptHash: "prompt_hash",
    operatorMessageDe: outcome === "answered" ? "Antwort erstellt." : "Keine Evidenz gefunden.",
  };
  return outcome === "answered" ? { ...base, answer: "Antwort [chunk:chunk_a]" } : base;
}

class EvalCitedProvider implements LlmProvider {
  readonly profile;

  constructor(modelVersion: string) {
    this.profile = {
      id: "eval-cited-provider",
      name: "Eval Cited Provider",
      modelVersion,
      replayCapability: "bit_equal" as const,
      supportsSeed: true,
      configHash: sha256Hex(modelVersion),
    };
  }

  generate(request: LlmRequest): string {
    const chunkIds = [...request.prompt.matchAll(/\[chunk:([A-Za-z0-9_-]+)\]/gu)]
      .map((match) => match[1])
      .filter((chunkId): chunkId is string => chunkId !== undefined);
    const citations = [...new Set(chunkIds)].map((chunkId) => `[chunk:${chunkId}]`).join(" ");
    return citations.length === 0
      ? "CLAIM: Keine ausreichende Evidenz."
      : `CLAIM: Die Antwort ist durch die abgerufene Evidenz belegt. ${citations}`;
  }
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
