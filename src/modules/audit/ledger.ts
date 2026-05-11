import { execFile } from "node:child_process";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign,
} from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
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
import { normalizeLedgerInput } from "./ledger-normalize.js";
import { parseLedgerEntry, verifyRowsWithPublicKey } from "./ledger-verify.js";

export {
  readSqliteLedgerEntries,
  verifyExportedLedgerEntries,
  verifySqliteLedger,
} from "./ledger-verify.js";

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

type LedgerRow = {
  readonly sequence: number;
  readonly id: string;
  readonly previous_hash: string;
  readonly entry_type: string;
  readonly outcome: Outcome;
  readonly canonical_payload: string;
  readonly row_json: string;
  readonly signature: string;
  readonly signature_key_id: string;
  readonly timestamp_ms: number;
};

type MetadataRow = {
  readonly value: string;
};

const genesisHash = "0".repeat(64);
const execFileAsync = promisify(execFile);

export class AuditLedger {
  readonly signatureKeyId = "local-ed25519-v1";
  private readonly db: Database.Database;
  private readonly publicKey: KeyObject;
  private readonly privateKey: KeyObject | null;

  constructor(
    private readonly clock: Clock = systemClock,
    sqlitePath = ":memory:",
  ) {
    this.db = new Database(sqlitePath);
    this.configureDatabase();
    const pair = this.loadOrCreateSigningKeyPair();
    this.publicKey = pair.publicKey;
    this.privateKey = pair.privateKey;
  }

  append(input: LedgerAppendInput): LedgerEntry {
    if (this.privateKey === null) {
      throw new Error("Ledger signing private key unavailable");
    }
    const timestampMs = input.timestampMs ?? this.clock.now();
    const previousHash = this.lastEntry()?.id ?? genesisHash;
    const entryBase = this.buildEntryBase(input, previousHash, timestampMs);
    const canonicalPayload = canonicalJson(entryBase);
    const id = sha256Hex(`${previousHash}${canonicalPayload}`);
    const signature = signPayload(this.privateKey, id, canonicalPayload);
    const entry = {
      ...entryBase,
      id,
      canonicalPayload,
      signature,
      signatureKeyId: this.signatureKeyId,
    };
    this.insertEntry(entry);
    return entry;
  }

  entries(): readonly LedgerEntry[] {
    const rows = this.db
      .prepare("SELECT row_json FROM audit_ledger ORDER BY sequence")
      .all() as readonly Pick<LedgerRow, "row_json">[];
    return rows.map((row) => parseLedgerEntry(row.row_json));
  }

  findById(id: string): LedgerEntry {
    const row = this.db.prepare("SELECT row_json FROM audit_ledger WHERE id = ?").get(id) as
      | Pick<LedgerRow, "row_json">
      | undefined;
    if (row === undefined) {
      throw new Error(`Ledger entry not found: ${id}`);
    }
    return parseLedgerEntry(row.row_json);
  }

  verifyRows(rows: readonly LedgerEntry[] = this.entries()): LedgerVerification {
    return verifyRowsWithPublicKey(rows, this.publicKey);
  }

  tamperedCopy(sequence: number, patch: Partial<LedgerEntry>): readonly LedgerEntry[] {
    return this.entries().map((row) => (row.sequence === sequence ? { ...row, ...patch } : row));
  }

  async exportSealed(outDir: string, sinceMs: number, untilMs: number): Promise<LedgerExport> {
    if (this.privateKey === null) {
      throw new Error("Ledger signing private key unavailable");
    }
    const rows = this.entries().filter(
      (row) => row.timestampMs >= sinceMs && row.timestampMs <= untilMs,
    );
    await mkdir(outDir, { recursive: true });
    const stamp = exportStamp(untilMs);
    const ledgerPath = join(outDir, `audit-${stamp}.sqlite`);
    const signaturePath = join(outDir, `audit-${stamp}.sqlite.sig`);
    const manifestPath = join(outDir, "manifest.json");
    const zipPath = join(outDir, `audit-${stamp}.zip`);
    await writeSqliteLedger(ledgerPath, rows, publicKeyPem(this.publicKey), this.signatureKeyId);
    const ledgerBytes = await readFile(ledgerPath);
    const detachedSignature = sign(null, ledgerBytes, this.privateKey).toString("base64");
    const manifest = this.buildManifest(rows, ledgerBytes, sinceMs, untilMs);
    await writeFile(signaturePath, `${detachedSignature}\n`, "utf8");
    await writeFile(manifestPath, `${canonicalJson(manifest)}\n`, "utf8");
    await zipFiles(zipPath, [ledgerPath, signaturePath, manifestPath]);
    return { ledgerPath, signaturePath, manifestPath, zipPath, manifest };
  }

  private configureDatabase(): void {
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_metadata (
        key text PRIMARY KEY,
        value text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_ledger (
        sequence integer PRIMARY KEY,
        id text NOT NULL UNIQUE,
        previous_hash text NOT NULL,
        entry_type text NOT NULL,
        outcome text NOT NULL,
        canonical_payload text NOT NULL,
        row_json text NOT NULL,
        signature text NOT NULL,
        signature_key_id text NOT NULL,
        timestamp_ms integer NOT NULL
      );
    `);
  }

  private loadOrCreateSigningKeyPair(): {
    readonly publicKey: KeyObject;
    readonly privateKey: KeyObject | null;
  } {
    const publicKeyRow = this.metadata("public_key_pem");
    const privateKeyRow = this.metadata("private_key_pem");
    if (publicKeyRow !== undefined && privateKeyRow !== undefined) {
      return {
        publicKey: createPublicKey(publicKeyRow),
        privateKey: createPrivateKey(privateKeyRow),
      };
    }
    if (publicKeyRow !== undefined) {
      return { publicKey: createPublicKey(publicKeyRow), privateKey: null };
    }
    const pair = generateKeyPairSync("ed25519");
    this.db
      .prepare("INSERT OR IGNORE INTO audit_metadata (key, value) VALUES (?, ?)")
      .run("public_key_pem", publicKeyPem(pair.publicKey));
    this.db
      .prepare("INSERT OR IGNORE INTO audit_metadata (key, value) VALUES (?, ?)")
      .run("private_key_pem", privateKeyPem(pair.privateKey));
    return pair;
  }

  private metadata(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM audit_metadata WHERE key = ?").get(key) as
      | MetadataRow
      | undefined;
    return row?.value;
  }

  private lastEntry(): LedgerEntry | null {
    const row = this.db
      .prepare("SELECT row_json FROM audit_ledger ORDER BY sequence DESC LIMIT 1")
      .get() as Pick<LedgerRow, "row_json"> | undefined;
    return row === undefined ? null : parseLedgerEntry(row.row_json);
  }

  private insertEntry(entry: LedgerEntry): void {
    this.db
      .prepare(
        `INSERT INTO audit_ledger
           (sequence, id, previous_hash, entry_type, outcome, canonical_payload,
            row_json, signature, signature_key_id, timestamp_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.sequence,
        entry.id,
        entry.previousHash,
        entry.entryType,
        entry.outcome,
        entry.canonicalPayload,
        canonicalJson(entry),
        entry.signature,
        entry.signatureKeyId,
        entry.timestampMs,
      );
  }

  private buildEntryBase(
    input: LedgerAppendInput,
    previousHash: string,
    timestampMs: number,
  ): Omit<LedgerEntry, "id" | "canonicalPayload" | "signature" | "signatureKeyId"> {
    const normalized = normalizeLedgerInput(input);
    return {
      previousHash,
      sequence: this.entries().length + 1,
      entryType: input.entryType,
      outcome: input.outcome,
      queryText: normalized.queryText,
      querySha256: sha256Hex(normalized.queryText ?? ""),
      retrievedChunks: normalized.retrievedChunks,
      generatedAnswer: normalized.generatedAnswer,
      generatedAnswerSha256: normalized.generatedAnswerSha256,
      claimCitations: normalized.claimCitations,
      modelVersion: normalized.modelVersion,
      promptVersion: normalized.promptVersion,
      embeddingModelVersion: normalized.embeddingModelVersion,
      providerProfileId: normalized.providerProfileId,
      providerReplayCapability: normalized.providerReplayCapability,
      seed: normalized.seed,
      temperature: normalized.temperature,
      corpusSnapshotId: normalized.corpusSnapshotId,
      corpusSnapshotHash: normalized.corpusSnapshotHash,
      promptHash: normalized.promptHash,
      timestampMs,
      userIdHash: input.userIdHash,
      metadata: normalized.metadata,
    };
  }

  private buildManifest(
    rows: readonly LedgerEntry[],
    ledgerBytes: Buffer,
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
  readonly zipPath: string;
  readonly manifest: LedgerManifest;
};

async function writeSqliteLedger(
  ledgerPath: string,
  rows: readonly LedgerEntry[],
  publicKey: string,
  signatureKeyId: string,
): Promise<void> {
  await rm(ledgerPath, { force: true });
  const db = new Database(ledgerPath);
  try {
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE audit_metadata (key text PRIMARY KEY, value text NOT NULL);
      CREATE TABLE audit_ledger (
        sequence integer PRIMARY KEY,
        id text NOT NULL UNIQUE,
        previous_hash text NOT NULL,
        entry_type text NOT NULL,
        outcome text NOT NULL,
        canonical_payload text NOT NULL,
        row_json text NOT NULL,
        signature text NOT NULL,
        signature_key_id text NOT NULL,
        timestamp_ms integer NOT NULL
      );
    `);
    db.prepare("INSERT INTO audit_metadata (key, value) VALUES (?, ?)").run(
      "public_key_pem",
      publicKey,
    );
    db.prepare("INSERT INTO audit_metadata (key, value) VALUES (?, ?)").run(
      "signature_key_id",
      signatureKeyId,
    );
    const insert = db.prepare(
      `INSERT INTO audit_ledger
         (sequence, id, previous_hash, entry_type, outcome, canonical_payload,
          row_json, signature, signature_key_id, timestamp_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      insert.run(
        row.sequence,
        row.id,
        row.previousHash,
        row.entryType,
        row.outcome,
        row.canonicalPayload,
        canonicalJson(row),
        row.signature,
        row.signatureKeyId,
        row.timestampMs,
      );
    }
  } finally {
    db.close();
  }
}

async function zipFiles(zipPath: string, paths: readonly string[]): Promise<void> {
  await rm(zipPath, { force: true });
  await execFileAsync("zip", ["-X", "-j", zipPath, ...paths]);
}

function publicKeyPem(publicKey: KeyObject): string {
  return publicKey.export({ type: "spki", format: "pem" });
}

function privateKeyPem(privateKey: KeyObject): string {
  return privateKey.export({ type: "pkcs8", format: "pem" });
}

function signPayload(privateKey: KeyObject, id: string, canonicalPayload: string): string {
  return sign(null, Buffer.from(`${id}${canonicalPayload}`), privateKey).toString("base64");
}

function exportStamp(untilMs: number): string {
  return new Date(untilMs).toISOString().replace(/[:.]/gu, "-");
}
