import { readFile } from "node:fs/promises";
import type { AnswerOutcome } from "../../domain/types.js";
import { canonicalJson } from "../../lib/canonical-json.js";

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

export type EvalRun = EvalMetrics & {
  readonly status: "passed" | "failed";
  readonly caseCount: number;
  readonly outputJson: string;
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
    metrics.groundedness >= 0.95 &&
    metrics.citationAccuracy >= 0.95 &&
    metrics.refusalCorrectness >= 0.9;
  return {
    ...metrics,
    status: passed ? "passed" : "failed",
    caseCount: cases.length,
    outputJson: canonicalJson({
      status: passed ? "passed" : "failed",
      ...metrics,
      caseCount: cases.length,
    }),
  };
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
    modelVersion: "stub-llm@1.0.0",
    promptVersion: "1.0.0",
    embeddingModelVersion: "bge-m3@stub-v1",
    seed: 42,
    seedUnsupported: false,
    corpusSnapshotId: "snap_a",
    corpusSnapshotHash: "hash_a",
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
