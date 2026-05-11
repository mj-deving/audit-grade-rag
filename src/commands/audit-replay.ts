import { createRuntimeApp } from "../app/runtime-app.js";
import { replayLedgerEntry } from "../modules/replay/replay.js";
import { writeJson } from "./args.js";

const app = createRuntimeApp();
await app.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
const session = app.bootstrapOperator("operator@example.local");
const result = app.query(session.id, "Welche Auditpflicht gilt?");
const replay = replayLedgerEntry(
  app.ledger,
  result.ledgerEntry,
  {
    id: result.providerProfileId,
    name: "Deterministic Stub LLM",
    modelVersion: result.modelVersion,
    replayCapability: "bit_equal",
    supportsSeed: true,
    configHash: result.providerProfileId,
  },
  {
    corpusSnapshotHash: result.corpusSnapshotHash,
    promptHash: result.promptHash,
    embeddingModelVersion: result.embeddingModelVersion,
    modelVersion: result.modelVersion,
  },
  result.answer ?? "",
);

writeJson(replay);
