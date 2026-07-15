import process from "node:process";
import { LangfuseClient } from "@langfuse/client";
import { defaultGoldenSetPath, type GoldenCase, loadGoldenSet } from "../modules/eval/eval.js";
import { datasetName } from "./langfuse-dataset.js";

function createExpectedOutput(goldenCase: GoldenCase): {
  readonly expected_outcome: GoldenCase["expected_outcome"];
  readonly expected_chunks?: readonly string[];
} {
  return {
    expected_outcome: goldenCase.expected_outcome,
    ...(goldenCase.expected_chunks === undefined
      ? {}
      : { expected_chunks: goldenCase.expected_chunks }),
  };
}

function createMetadata(goldenCase: GoldenCase): {
  readonly id: string;
  readonly tags: readonly string[];
  readonly expected_outcome: GoldenCase["expected_outcome"];
  readonly expected_chunks?: readonly string[];
} {
  return {
    id: goldenCase.id,
    tags: goldenCase.tags,
    expected_outcome: goldenCase.expected_outcome,
    ...(goldenCase.expected_chunks === undefined
      ? {}
      : { expected_chunks: goldenCase.expected_chunks }),
  };
}

function isAlreadyExistsError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { readonly status?: unknown; readonly statusCode?: unknown };
  const status =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : null;
  const message = error instanceof Error ? error.message : "";
  return status === 409 || /already exists|conflict/iu.test(message);
}

async function main(): Promise<void> {
  const langfuse = new LangfuseClient();
  const cases = await loadGoldenSet(defaultGoldenSetPath);

  try {
    await langfuse.api.datasets.create({ name: datasetName });
  } catch (error: unknown) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }

  for (const goldenCase of cases) {
    // Ein stabiler `id` macht createItem zu einem Upsert, so bleibt der Seed idempotent.
    await langfuse.dataset.createItem({
      id: goldenCase.id,
      datasetName,
      input: { question: goldenCase.question },
      expectedOutput: createExpectedOutput(goldenCase),
      metadata: createMetadata(goldenCase),
    });
  }

  await langfuse.flush();
  process.stdout.write(`dataset:seed ok, dataset=${datasetName}, items=${String(cases.length)}\n`);
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
