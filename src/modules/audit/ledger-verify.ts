import { type KeyObject, verify } from "node:crypto";
import Database from "better-sqlite3";
import type { LedgerEntry } from "../../domain/types.js";
import { canonicalJson } from "../../lib/canonical-json.js";
import { sha256Hex } from "../../lib/hash.js";
import type { LedgerVerification } from "./ledger.js";

type LedgerRow = {
  readonly row_json: string;
};

type MetadataRow = {
  readonly value: string;
};

const genesisHash = "0".repeat(64);

export function verifyExportedLedgerEntries(rows: readonly unknown[]): LedgerVerification {
  return verifyRowsWithPublicKey(rows.map(assertLedgerEntry));
}

export function readSqliteLedgerEntries(ledgerPath: string): readonly LedgerEntry[] {
  const db = new Database(ledgerPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare("SELECT row_json FROM audit_ledger ORDER BY sequence")
      .all() as readonly LedgerRow[];
    return rows.map((row) => parseLedgerEntry(row.row_json));
  } finally {
    db.close();
  }
}

export function verifySqliteLedger(ledgerPath: string): LedgerVerification {
  try {
    const db = new Database(ledgerPath, { readonly: true, fileMustExist: true });
    try {
      const rows = db
        .prepare("SELECT row_json FROM audit_ledger ORDER BY sequence")
        .all() as readonly LedgerRow[];
      const publicKeyRow = db
        .prepare("SELECT value FROM audit_metadata WHERE key = 'public_key_pem'")
        .get() as MetadataRow | undefined;
      const entries = rows.map((row) => parseLedgerEntry(row.row_json));
      return verifyRowsWithPublicKey(entries, publicKeyRow?.value);
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      ok: false,
      checkedRows: 0,
      firstInvalidSequence: 1,
      reason: error instanceof Error ? error.message : "sqlite verification failed",
    };
  }
}

export function verifyRowsWithPublicKey(
  rows: readonly LedgerEntry[],
  publicKey?: KeyObject | string,
): LedgerVerification {
  let previousHash = genesisHash;
  let checkedRows = 0;
  for (const row of rows) {
    const result = verifyRow(row, previousHash, publicKey);
    if (!result.ok) {
      return invalidExport(checkedRows, row.sequence, result.reason);
    }
    previousHash = row.id;
    checkedRows += 1;
  }
  return { ok: true, checkedRows };
}

export function parseLedgerEntry(rowJson: string): LedgerEntry {
  return assertLedgerEntry(JSON.parse(rowJson) as unknown);
}

function verifyRow(
  row: LedgerEntry,
  previousHash: string,
  publicKey?: KeyObject | string,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (row.previousHash !== previousHash) {
    return { ok: false, reason: "previous hash mismatch" };
  }
  const canonicalPayload = canonicalJson(payloadForVerification(row));
  if (canonicalPayload !== row.canonicalPayload) {
    return { ok: false, reason: "canonical payload mismatch" };
  }
  if (sha256Hex(`${previousHash}${canonicalPayload}`) !== row.id) {
    return { ok: false, reason: "row hash mismatch" };
  }
  if (publicKey === undefined) {
    return row.signature.length === 0 ? { ok: false, reason: "signature missing" } : { ok: true };
  }
  const validSignature = verify(
    null,
    Buffer.from(`${row.id}${row.canonicalPayload}`),
    publicKey,
    Buffer.from(row.signature, "base64"),
  );
  return validSignature ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

function payloadForVerification(
  row: LedgerEntry,
): Omit<LedgerEntry, "id" | "canonicalPayload" | "signature" | "signatureKeyId"> {
  return {
    previousHash: row.previousHash,
    sequence: row.sequence,
    entryType: row.entryType,
    outcome: row.outcome,
    querySha256: row.querySha256,
    retrievedChunks: row.retrievedChunks,
    queryText: row.queryText,
    generatedAnswer: row.generatedAnswer,
    generatedAnswerSha256: row.generatedAnswerSha256,
    claimCitations: row.claimCitations,
    modelVersion: row.modelVersion,
    promptVersion: row.promptVersion,
    embeddingModelVersion: row.embeddingModelVersion,
    providerProfileId: row.providerProfileId,
    providerReplayCapability: row.providerReplayCapability,
    seed: row.seed,
    temperature: row.temperature,
    corpusSnapshotId: row.corpusSnapshotId,
    corpusSnapshotHash: row.corpusSnapshotHash,
    promptHash: row.promptHash,
    timestampMs: row.timestampMs,
    userIdHash: row.userIdHash,
    metadata: row.metadata,
  };
}

function invalidExport(
  checkedRows: number,
  firstInvalidSequence: number,
  reason: string,
): LedgerVerification {
  return { ok: false, checkedRows, firstInvalidSequence, reason };
}

function assertLedgerEntry(row: unknown): LedgerEntry {
  if (typeof row !== "object" || row === null) {
    throw new Error("Ledger export row is not an object");
  }
  const candidate = row as Partial<LedgerEntry>;
  if (typeof candidate.id !== "string" || typeof candidate.canonicalPayload !== "string") {
    throw new Error("Ledger export row is missing hash fields");
  }
  return candidate as LedgerEntry;
}
