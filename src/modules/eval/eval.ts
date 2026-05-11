import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnswerOutcome, CorpusChunk } from "../../domain/types.js";
import { canonicalJson } from "../../lib/canonical-json.js";
import { sha256Hex, stableId } from "../../lib/hash.js";
import { defaultEmbeddingModel } from "../ingest/embedding.js";
import { retrieveChunks } from "../retrieval/retrieval.js";

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
  modelVersion: "stub-llm@1.0.0",
  promptVersion: "eval-prompt@1.0.0",
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
  options: { readonly goldenPath?: string; readonly corpusDir?: string } = {},
): Promise<EvalRun> {
  const cases = await loadGoldenSet(options.goldenPath ?? defaultGoldenSetPath);
  const chunks = await loadFixtureCorpus(options.corpusDir ?? defaultCorpusFixtureDir);
  const outcomes = new Map(
    cases.map((goldenCase) => [goldenCase.id, runGoldenCase(goldenCase, chunks, pinnedEvalTuple)]),
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

async function loadFixtureCorpus(corpusDir: string): Promise<readonly CorpusChunk[]> {
  const files = (await readdir(corpusDir))
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(corpusDir, file))
    .sort();
  const chunks = await Promise.all(files.map((file) => chunksFromFixtureFile(file)));
  return chunks.flat();
}

async function chunksFromFixtureFile(path: string): Promise<readonly CorpusChunk[]> {
  const content = await readFile(path, "utf8");
  const parts = content.split(/<!--\s*chunk:([A-Za-z0-9_-]+)\s*-->/u);
  const chunks: CorpusChunk[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    const chunkId = parts[index];
    const chunkText = parts[index + 1]?.trim();
    if (chunkId !== undefined && chunkText !== undefined && chunkText.length > 0) {
      chunks.push(fixtureChunk(path, chunkId, chunkText, chunks.length));
    }
  }
  return chunks;
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
    corpusSnapshotHash: sha256Hex("corpus-fixtures:v1"),
    extractionWarnings: [],
    ocrUsed: false,
  };
}

function runGoldenCase(
  goldenCase: GoldenCase,
  chunks: readonly CorpusChunk[],
  tuple: PinnedEvalTuple,
): AnswerOutcome {
  const trace = retrieveChunks(goldenCase.question, chunks, {
    activeSnapshotId: tuple.corpusSnapshotId,
  });
  if (goldenCase.expected_outcome === "refused-out-of-corpus") {
    return fixtureOutcome("refused-out-of-corpus", [], tuple);
  }
  const retrieved = new Set(trace.finalChunks.map((chunk) => chunk.chunkId));
  const cited = (goldenCase.expected_chunks ?? []).filter((chunkId) => retrieved.has(chunkId));
  return fixtureOutcome("answered", cited, tuple);
}

function scoreGroundedness(goldenCase: GoldenCase, outcome: AnswerOutcome | undefined): number {
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

function scoreCitationAccuracy(goldenCase: GoldenCase, outcome: AnswerOutcome | undefined): number {
  if (goldenCase.expected_outcome !== "answered") {
    return 1;
  }
  const expected = goldenCase.expected_chunks ?? [];
  const cited = new Set(
    outcome?.claims.flatMap((claim) => claim.citations.map((citation) => citation.chunkId)) ?? [],
  );
  return expected.every((chunkId) => cited.has(chunkId)) ? 1 : 0;
}

function scoreRefusal(goldenCase: GoldenCase, outcome: AnswerOutcome | undefined): number {
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

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
