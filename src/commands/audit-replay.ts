import process from "node:process";
import { AuditLedger } from "../modules/audit/ledger.js";
import { EvidenceEchoProvider } from "../modules/generation/generation.js";
import {
  type ReplayArtifacts,
  replayArtifactsFromEntry,
  replayLedgerEntry,
} from "../modules/replay/replay.js";
import { readFlag, writeJson } from "./args.js";

const args = process.argv.slice(2);
const ledgerPath = args[0];
const entryId = args[1];
if (ledgerPath === undefined || entryId === undefined || ledgerPath.startsWith("--")) {
  throw new Error("Usage: audit-replay <ledger.sqlite> <entry-id>");
}

const ledger = new AuditLedger(undefined, ledgerPath);
const entry = ledger.findById(entryId);
const artifacts = artifactsFromArgs(args, replayArtifactsFromEntry(entry));
const provider = new EvidenceEchoProvider({
  id: entry.providerProfileId,
  name: entry.providerProfileId,
  modelVersion: artifacts.modelVersion,
  replayCapability: entry.providerReplayCapability,
  supportsSeed: entry.seed !== null,
  configHash: entry.providerProfileId,
});
const replay = replayLedgerEntry(ledger, entry, provider, artifacts);

if (replay.status === "drift") {
  writeJson({ ...replay, error: { name: "ReplayDriftError", artifact: replay.driftArtifact } });
  process.exitCode = 2;
} else {
  writeJson(replay);
}

function artifactsFromArgs(args: readonly string[], defaults: ReplayArtifacts): ReplayArtifacts {
  return {
    corpusSnapshotHash: readFlag(args, "--corpus-snapshot-hash") ?? defaults.corpusSnapshotHash,
    promptHash: readFlag(args, "--prompt-hash") ?? defaults.promptHash,
    embeddingModelVersion:
      readFlag(args, "--embedding-model-version") ?? defaults.embeddingModelVersion,
    modelVersion: readFlag(args, "--model-version") ?? defaults.modelVersion,
  };
}
