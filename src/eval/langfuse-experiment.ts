import "../../instrumentation.js";
import process from "node:process";
import { LangfuseClient } from "@langfuse/client";
import { langfuseSpanProcessor } from "../../instrumentation.js";
import type { AnswerOutcome, CorpusChunk } from "../domain/types.js";
import {
  defaultCorpusFixtureDir,
  type ExpectedOutcome,
  type GoldenCase,
  loadFixtureCorpus,
  pinnedEvalTuple,
  runGoldenCase,
  scoreCitationAccuracy,
  scoreGroundedness,
  scoreRefusal,
} from "../modules/eval/eval.js";
import { datasetName } from "./langfuse-dataset.js";

// Das runExperiment-SDK typisiert input/expectedOutput/metadata/output als `any`.
// Wir lesen sie deshalb als benannte, optionale unknown-Felder und verengen streng,
// bevor wir dem deterministischen Scoring-Pfad vertrauen.
type RawInput = {
  readonly question?: unknown;
};

type RawMetadata = {
  readonly id?: unknown;
  readonly tags?: unknown;
  readonly expected_outcome?: unknown;
  readonly expected_chunks?: unknown;
};

type RawOutput = {
  readonly outcome?: unknown;
  readonly claims?: unknown;
};

type ExperimentBoundary = {
  readonly input?: unknown;
  readonly metadata?: unknown;
};

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} muss ein String sein`);
  }
  return value;
}

function expectReadonlyStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} muss ein String-Array sein`);
  }
  return value as readonly string[];
}

function isExpectedOutcome(value: unknown): value is ExpectedOutcome {
  return value === "answered" || value === "refused-out-of-corpus" || value === "blocked-unsafe";
}

function isAnswerOutcomeValue(value: unknown): value is AnswerOutcome["outcome"] {
  return (
    value === "answered" ||
    value === "refused-out-of-corpus" ||
    value === "blocked-uncited" ||
    value === "provider-error"
  );
}

function reconstructGoldenCase(item: ExperimentBoundary): GoldenCase {
  const input = (item.input ?? {}) as RawInput;
  const metadata = (item.metadata ?? {}) as RawMetadata;
  const expectedOutcome = metadata.expected_outcome;
  if (!isExpectedOutcome(expectedOutcome)) {
    throw new Error("dataset metadata.expected_outcome ist ungültig");
  }
  return {
    id: expectString(metadata.id, "dataset metadata.id"),
    question: expectString(input.question, "dataset input.question"),
    expected_outcome: expectedOutcome,
    tags: expectReadonlyStringArray(metadata.tags, "dataset metadata.tags"),
    ...(metadata.expected_chunks === undefined
      ? {}
      : {
          expected_chunks: expectReadonlyStringArray(
            metadata.expected_chunks,
            "dataset metadata.expected_chunks",
          ),
        }),
  };
}

// Scorer lesen nur `outcome` und `claims`; genau diese Felder verengen wir am Boundary.
function reconstructAnswerOutcome(output: unknown): AnswerOutcome {
  const record = (output ?? {}) as RawOutput;
  if (!isAnswerOutcomeValue(record.outcome)) {
    throw new Error("experiment output.outcome ist ungültig");
  }
  if (!Array.isArray(record.claims)) {
    throw new Error("experiment output.claims muss ein Array sein");
  }
  return output as AnswerOutcome;
}

async function main(): Promise<void> {
  const langfuse = new LangfuseClient();
  const chunks: readonly CorpusChunk[] = await loadFixtureCorpus(defaultCorpusFixtureDir);
  const dataset = await langfuse.dataset.get(datasetName);
  const result = await dataset.runExperiment({
    name: "golden-v1",
    description: "Deterministische Bewertung des Golden Sets mit numerischen Einzelscores.",
    task: (item: ExperimentBoundary): Promise<AnswerOutcome> =>
      Promise.resolve(runGoldenCase(reconstructGoldenCase(item), chunks, pinnedEvalTuple)),
    evaluators: [
      ({ input, metadata, output }): Promise<{ readonly name: string; readonly value: number }> => {
        const goldenCase = reconstructGoldenCase({ input, metadata });
        const answerOutcome = reconstructAnswerOutcome(output);
        return Promise.resolve({
          name: "groundedness",
          value: scoreGroundedness(goldenCase, answerOutcome),
        });
      },
      ({ input, metadata, output }): Promise<{ readonly name: string; readonly value: number }> => {
        const goldenCase = reconstructGoldenCase({ input, metadata });
        const answerOutcome = reconstructAnswerOutcome(output);
        return Promise.resolve({
          name: "citation-accuracy",
          value: scoreCitationAccuracy(goldenCase, answerOutcome),
        });
      },
      ({ input, metadata, output }): Promise<{ readonly name: string; readonly value: number }> => {
        const goldenCase = reconstructGoldenCase({ input, metadata });
        const answerOutcome = reconstructAnswerOutcome(output);
        return Promise.resolve({
          name: "refusal-correctness",
          value: scoreRefusal(goldenCase, answerOutcome),
        });
      },
    ],
  });

  const formatted = await result.format();
  process.stdout.write(formatted.endsWith("\n") ? formatted : `${formatted}\n`);
  process.stdout.write(`runName=${result.runName}\n`);
  process.stdout.write(`datasetRunId=${result.datasetRunId ?? "n/a"}\n`);
  process.stdout.write(`datasetRunUrl=${result.datasetRunUrl ?? "n/a"}\n`);

  await langfuse.flush();
  await langfuseSpanProcessor.forceFlush();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
