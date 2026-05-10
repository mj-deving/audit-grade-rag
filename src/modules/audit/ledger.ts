import { generateKeyPairSync, type KeyObject, sign, verify } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Citation,
  LedgerEntry,
  Outcome,
  ReplayCapability,
  RetrievedChunk,
} from "../../domain/types.js";
import { canonicalJson } from "../../lib/canonical-json.js";
import { sha256Hex } from "../../lib/hash.js";
import type { Clock } from "../../lib/time.js";
import { systemClock } from "../../lib/time.js";

export type LedgerAppendInput = {
  readonly entryType: string;
  readonly outcome: Outcome;
  readonly queryText?: string;
  readonly retrievedChunks?: readonly RetrievedChunk[];
  readonly generatedAnswer?: string;
  readonly claimCitations?: readonly Citation[];
  readonly modelVersion?: string;
  readonly promptVersion?: string;
  readonly embeddingModelVersion?: string;
  readonly providerProfileId?: string;
  readonly providerReplayCapability?: ReplayCapability;
  readonly seed?: number | null;
  readonly temperature?: number;
  readonly corpusSnapshotId?: string;
  readonly corpusSnapshotHash?: string;
  readonly promptHash?: string;
  readonly userIdHash: string;
  readonly timestampMs?: number;
  readonly extra?: Record<string, unknown>;
};

export type LedgerVerification =
  | { readonly ok: true; readonly checkedRows: number }
  | {
      readonly ok: false;
      readonly checkedRows: number;
      readonly firstInvalidSequence: number;
      readonly reason: string;
    };

const genesisHash = "0".repeat(64);

export class AuditLedger {
  readonly signatureKeyId = "local-ed25519-v1";
  private readonly rows: LedgerEntry[] = [];
  private readonly publicKey: KeyObject;
  private readonly privateKey: KeyObject;

  constructor(private readonly clock: Clock = systemClock) {
    const pair = generateKeyPairSync("ed25519");
    this.publicKey = pair.publicKey;
    this.privateKey = pair.privateKey;
  }

  append(input: LedgerAppendInput): LedgerEntry {
    const timestampMs = input.timestampMs ?? this.clock.now();
    const previousHash = this.rows.at(-1)?.id ?? genesisHash;
    const entryBase = this.buildEntryBase(input, previousHash, timestampMs);
    const canonicalPayload = canonicalJson(entryBase);
    const id = sha256Hex(`${previousHash}${canonicalPayload}`);
    const signature = sign(null, Buffer.from(`${id}${canonicalPayload}`), this.privateKey).toString(
      "base64",
    );
    const entry = {
      ...entryBase,
      id,
      canonicalPayload,
      signature,
      signatureKeyId: this.signatureKeyId,
    };
    this.rows.push(entry);
    return entry;
  }

  entries(): readonly LedgerEntry[] {
    return [...this.rows];
  }

  findById(id: string): LedgerEntry {
    const row = this.rows.find((entry) => entry.id === id);
    if (row === undefined) {
      throw new Error(`Ledger entry not found: ${id}`);
    }
    return row;
  }

  verifyRows(rows: readonly LedgerEntry[] = this.rows): LedgerVerification {
    let previousHash = genesisHash;
    for (const row of rows) {
      const result = this.verifyRow(row, previousHash);
      if (!result.ok) {
        return {
          ok: false,
          checkedRows: row.sequence - 1,
          firstInvalidSequence: row.sequence,
          reason: result.reason,
        };
      }
      previousHash = row.id;
    }
    return { ok: true, checkedRows: rows.length };
  }

  tamperedCopy(sequence: number, patch: Partial<LedgerEntry>): readonly LedgerEntry[] {
    return this.rows.map((row) => (row.sequence === sequence ? { ...row, ...patch } : row));
  }

  async exportSealed(outDir: string, sinceMs: number, untilMs: number): Promise<LedgerExport> {
    const rows = this.rows.filter(
      (row) => row.timestampMs >= sinceMs && row.timestampMs <= untilMs,
    );
    await mkdir(outDir, { recursive: true });
    const ledgerPath = join(outDir, "audit-ledger.sqlite");
    const signaturePath = join(outDir, "audit-ledger.signatures.json");
    const manifestPath = join(outDir, "manifest.json");
    const ledgerBytes = rows.map((row) => canonicalJson(row)).join("\n");
    const signatures = rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      signature: row.signature,
    }));
    const manifest = this.buildManifest(rows, ledgerBytes, sinceMs, untilMs);
    await writeFile(ledgerPath, `${ledgerBytes}\n`, "utf8");
    await writeFile(signaturePath, `${canonicalJson(signatures)}\n`, "utf8");
    await writeFile(manifestPath, `${canonicalJson(manifest)}\n`, "utf8");
    return { ledgerPath, signaturePath, manifestPath, manifest };
  }

  private buildEntryBase(
    input: LedgerAppendInput,
    previousHash: string,
    timestampMs: number,
  ): Omit<LedgerEntry, "id" | "canonicalPayload" | "signature" | "signatureKeyId"> {
    const answerHash =
      input.generatedAnswer === undefined ? null : sha256Hex(input.generatedAnswer);
    return {
      previousHash,
      sequence: this.rows.length + 1,
      entryType: input.entryType,
      outcome: input.outcome,
      querySha256: sha256Hex(input.queryText ?? ""),
      retrievedChunks: input.retrievedChunks ?? [],
      generatedAnswerSha256: answerHash,
      claimCitations: input.claimCitations ?? [],
      modelVersion: input.modelVersion ?? "not-applicable",
      promptVersion: input.promptVersion ?? "not-applicable",
      embeddingModelVersion: input.embeddingModelVersion ?? "not-applicable",
      providerProfileId: input.providerProfileId ?? "not-applicable",
      providerReplayCapability: input.providerReplayCapability ?? "unsupported",
      seed: input.seed ?? null,
      temperature: input.temperature ?? 0,
      corpusSnapshotId: input.corpusSnapshotId ?? "not-applicable",
      corpusSnapshotHash: input.corpusSnapshotHash ?? "not-applicable",
      promptHash: input.promptHash ?? "not-applicable",
      timestampMs,
      userIdHash: input.userIdHash,
      metadata: input.extra ?? {},
    };
  }

  private verifyRow(
    row: LedgerEntry,
    previousHash: string,
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
    const validSignature = verify(
      null,
      Buffer.from(`${row.id}${row.canonicalPayload}`),
      this.publicKey,
      Buffer.from(row.signature, "base64"),
    );
    return validSignature ? { ok: true } : { ok: false, reason: "signature mismatch" };
  }

  private buildManifest(
    rows: readonly LedgerEntry[],
    ledgerBytes: string,
    sinceMs: number,
    untilMs: number,
  ): LedgerManifest {
    return {
      artifact: "audit-grade-rag-ledger-export",
      format: "sqlite-wal-export",
      sinceMs,
      untilMs,
      rowCount: rows.length,
      ledgerSha256: sha256Hex(ledgerBytes),
      signatureKeyId: this.signatureKeyId,
      privateKeysIncluded: false,
      firstSequence: rows[0]?.sequence ?? null,
      lastSequence: rows.at(-1)?.sequence ?? null,
    };
  }
}

export type LedgerManifest = {
  readonly artifact: "audit-grade-rag-ledger-export";
  readonly format: "sqlite-wal-export";
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly rowCount: number;
  readonly ledgerSha256: string;
  readonly signatureKeyId: string;
  readonly privateKeysIncluded: false;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
};

export type LedgerExport = {
  readonly ledgerPath: string;
  readonly signaturePath: string;
  readonly manifestPath: string;
  readonly manifest: LedgerManifest;
};

export function verifyExportedLedgerEntries(rows: readonly unknown[]): LedgerVerification {
  let previousHash = genesisHash;
  let checkedRows = 0;
  for (const row of rows) {
    const entry = assertLedgerEntry(row);
    const canonicalPayload = canonicalJson(payloadForVerification(entry));
    if (entry.previousHash !== previousHash) {
      return invalidExport(checkedRows, entry.sequence, "previous hash mismatch");
    }
    if (entry.canonicalPayload !== canonicalPayload) {
      return invalidExport(checkedRows, entry.sequence, "canonical payload mismatch");
    }
    if (sha256Hex(`${previousHash}${canonicalPayload}`) !== entry.id) {
      return invalidExport(checkedRows, entry.sequence, "row hash mismatch");
    }
    if (entry.signature.length === 0) {
      return invalidExport(checkedRows, entry.sequence, "signature missing");
    }
    previousHash = entry.id;
    checkedRows += 1;
  }
  return { ok: true, checkedRows };
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
