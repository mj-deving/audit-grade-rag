import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { CorpusChunk, CorpusSnapshot, SourceType } from "../../domain/types.js";
import { sha256Hex, stableId } from "../../lib/hash.js";
import type { Clock } from "../../lib/time.js";
import { systemClock } from "../../lib/time.js";
import type { AuditLedger } from "../audit/ledger.js";
import { defaultEmbeddingModel, estimateHnswIndexBytes } from "./embedding.js";

const execFileAsync = promisify(execFile);

export type IngestOptions = {
  readonly corpusDir: string;
  readonly corpusRoot?: string;
  readonly dryRun?: boolean;
  readonly snapshotName?: string;
  readonly chunkWindow?: number;
  readonly chunkOverlap?: number;
  readonly failAfterExtract?: boolean;
};

export type IngestResult = {
  readonly dryRun: boolean;
  readonly documentCount: number;
  readonly changedDocumentCount: number;
  readonly chunkCount: number;
  readonly embeddingModel: string;
  readonly estimatedIndexSizeBytes: number;
  readonly warnings: readonly string[];
  readonly snapshot: CorpusSnapshot | null;
  readonly activated: boolean;
  readonly noOp: boolean;
};

export type Revision = {
  readonly path: string;
  readonly sourceType: SourceType;
  readonly contentSha256: string;
  readonly text: string;
  readonly ocrUsed: boolean;
  readonly warnings: readonly string[];
};

type ExtractedText = {
  readonly text: string;
  readonly ocrUsed: boolean;
  readonly warnings: readonly string[];
};

const defaultChunkWindow = 800;
const defaultChunkOverlap = 100;
const chunkerVersion = "chunker-800-100-v1";

export class IngestionStore {
  private readonly snapshots: CorpusSnapshot[] = [];
  private readonly chunks: CorpusChunk[] = [];
  private readonly documentHashes = new Map<string, string>();

  constructor(
    private readonly ledger: AuditLedger,
    private readonly clock: Clock = systemClock,
  ) {}

  async ingest(options: IngestOptions): Promise<IngestResult> {
    const revisions = await this.readRevisions(options);
    const changed = revisions.filter(
      (revision) => this.documentHashes.get(revision.path) !== revision.contentSha256,
    );
    const chunks = this.createChunks(revisions, this.nextSnapshotId(revisions), options);
    const warnings = revisions.flatMap((revision) => revision.warnings);
    if (options.dryRun === true) {
      return this.dryRunResult(revisions, changed, chunks, warnings);
    }
    if (changed.length === 0) {
      return this.noOpResult(revisions, warnings);
    }
    if (options.failAfterExtract === true) {
      return this.failedResult(revisions, changed, chunks, warnings);
    }
    return this.activateSnapshot(revisions, changed, chunks, warnings, options);
  }

  activeSnapshot(): CorpusSnapshot | null {
    for (let index = this.snapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = this.snapshots[index];
      if (snapshot?.status === "active") {
        return snapshot;
      }
    }
    return null;
  }

  allSnapshots(): readonly CorpusSnapshot[] {
    return [...this.snapshots];
  }

  chunksForSnapshot(snapshotId: string): readonly CorpusChunk[] {
    return this.chunks.filter((chunk) => chunk.corpusSnapshotId === snapshotId);
  }

  allChunks(): readonly CorpusChunk[] {
    return [...this.chunks];
  }

  private async readRevisions(options: IngestOptions): Promise<readonly Revision[]> {
    return readCorpusRevisions(options);
  }

  private createChunks(
    revisions: readonly Revision[],
    snapshotId: string,
    options: IngestOptions,
    snapshot?: CorpusSnapshot,
  ): readonly CorpusChunk[] {
    return revisions.flatMap((revision) =>
      chunkRevision(revision, snapshotId, snapshot?.snapshotHash ?? "pending", {
        window: options.chunkWindow ?? defaultChunkWindow,
        overlap: options.chunkOverlap ?? defaultChunkOverlap,
      }),
    );
  }

  private snapshot(
    status: CorpusSnapshot["status"],
    chunks: readonly CorpusChunk[],
    revisions: readonly Revision[],
  ): CorpusSnapshot {
    const sequence = this.snapshots.length + 1;
    const snapshotHash = sha256Hex(revisions.map((revision) => revision.contentSha256).join("|"));
    return {
      id: stableId("snap", [String(sequence), snapshotHash]),
      sequence,
      snapshotHash:
        chunks.length === 0 ? snapshotHash : sha256Hex(`${snapshotHash}:${String(chunks.length)}`),
      embeddingModelVersion: defaultEmbeddingModel,
      chunkerVersion,
      status,
    };
  }

  private nextSnapshotId(revisions: readonly Revision[]): string {
    const sequence = this.snapshots.length + 1;
    return stableId("snap", [
      String(sequence),
      revisions.map((revision) => revision.contentSha256).join("|"),
    ]);
  }

  private result(
    dryRun: boolean,
    documentCount: number,
    changedDocumentCount: number,
    chunkCount: number,
    warnings: readonly string[],
    snapshot: CorpusSnapshot | null,
    activated: boolean,
    noOp: boolean,
  ): IngestResult {
    return {
      dryRun,
      documentCount,
      changedDocumentCount,
      chunkCount,
      embeddingModel: defaultEmbeddingModel,
      estimatedIndexSizeBytes: estimateHnswIndexBytes(chunkCount),
      warnings,
      snapshot,
      activated,
      noOp,
    };
  }

  private dryRunResult(
    revisions: readonly Revision[],
    changed: readonly Revision[],
    chunks: readonly CorpusChunk[],
    warnings: readonly string[],
  ): IngestResult {
    return this.result(
      true,
      revisions.length,
      changed.length,
      chunks.length,
      warnings,
      null,
      false,
      changed.length === 0,
    );
  }

  private noOpResult(revisions: readonly Revision[], warnings: readonly string[]): IngestResult {
    return this.result(false, revisions.length, 0, 0, warnings, this.activeSnapshot(), false, true);
  }

  private failedResult(
    revisions: readonly Revision[],
    changed: readonly Revision[],
    chunks: readonly CorpusChunk[],
    warnings: readonly string[],
  ): IngestResult {
    const failed = this.snapshot("failed", chunks, revisions);
    this.snapshots.push(failed);
    return this.result(
      false,
      revisions.length,
      changed.length,
      chunks.length,
      warnings,
      failed,
      false,
      false,
    );
  }

  private activateSnapshot(
    revisions: readonly Revision[],
    changed: readonly Revision[],
    chunks: readonly CorpusChunk[],
    warnings: readonly string[],
    options: IngestOptions,
  ): IngestResult {
    const snapshot = this.snapshot("active", chunks, revisions);
    this.snapshots.push(snapshot);
    this.chunks.push(...this.createChunks(revisions, snapshot.id, options, snapshot));
    for (const revision of revisions) {
      this.documentHashes.set(revision.path, revision.contentSha256);
    }
    this.ledgerIngestCompletion(revisions.length, chunks.length, snapshot);
    return this.result(
      false,
      revisions.length,
      changed.length,
      chunks.length,
      warnings,
      snapshot,
      true,
      false,
    );
  }

  private ledgerIngestCompletion(
    documentCount: number,
    chunkCount: number,
    snapshot: CorpusSnapshot,
  ): void {
    this.ledger.append({
      entryType: "corpus.ingest.completed",
      outcome: "corpus-ingest-completed",
      embeddingModelVersion: defaultEmbeddingModel,
      corpusSnapshotId: snapshot.id,
      corpusSnapshotHash: snapshot.snapshotHash,
      userIdHash: sha256Hex("system-ingest"),
      timestampMs: this.clock.now(),
      extra: { documentCount, chunkCount },
    });
  }
}

export async function readCorpusRevisions(options: IngestOptions): Promise<readonly Revision[]> {
  const corpusDir = assertInsideRoot(options.corpusDir, options.corpusRoot ?? options.corpusDir);
  const entries = await sortedFiles(corpusDir);
  const revisions: Revision[] = [];
  for (const path of entries) {
    const sourceType = sourceTypeFromPath(path);
    if (sourceType === null) {
      continue;
    }
    const bytes = await readFile(path);
    revisions.push(await extractRevision(path, sourceType, bytes));
  }
  return revisions;
}

function assertInsideRoot(corpusDir: string, corpusRoot: string): string {
  const resolvedRoot = resolve(corpusRoot);
  const resolvedDir = resolve(corpusDir);
  if (resolvedDir !== resolvedRoot && !resolvedDir.startsWith(`${resolvedRoot}/`)) {
    throw new Error("Corpus path escapes configured root");
  }
  return resolvedDir;
}

async function sortedFiles(dir: string): Promise<readonly string[]> {
  const output: string[] = [];
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      output.push(...(await sortedFiles(path)));
    } else {
      output.push(path);
    }
  }
  return output.sort();
}

function sourceTypeFromPath(path: string): SourceType | null {
  const extension = extname(path).toLowerCase();
  if (extension === ".pdf") {
    return "pdf";
  }
  if (extension === ".docx") {
    return "docx";
  }
  if (extension === ".md") {
    return "markdown";
  }
  return null;
}

async function extractRevision(
  path: string,
  sourceType: SourceType,
  bytes: Buffer,
): Promise<Revision> {
  const extracted = await extractText(path, sourceType, bytes);
  const hiddenText = /hidden-text|white-on-white|opacity:0/iu.test(extracted.text);
  const scannedPdf = sourceType === "pdf" && /scanned-pdf|ocr-required/iu.test(extracted.text);
  const warnings = [
    ...extracted.warnings,
    ...(hiddenText ? ["hidden-text-warning"] : []),
    ...(scannedPdf ? ["ocr-used"] : []),
  ];
  return {
    path,
    sourceType,
    contentSha256: sha256Hex(bytes),
    text: normalizeExtractedText(extracted.text),
    ocrUsed: extracted.ocrUsed || scannedPdf,
    warnings,
  };
}

async function extractText(
  path: string,
  sourceType: SourceType,
  bytes: Buffer,
): Promise<ExtractedText> {
  if (sourceType === "markdown") {
    return { text: bytes.toString("utf8"), ocrUsed: false, warnings: [] };
  }
  if (sourceType === "docx") {
    return extractDocxText(path, bytes);
  }
  return extractPdfText(path, bytes);
}

async function extractDocxText(path: string, bytes: Buffer): Promise<ExtractedText> {
  try {
    const xml = await runCommand("unzip", ["-p", path, "word/document.xml"]);
    return { text: wordXmlToText(xml), ocrUsed: false, warnings: [] };
  } catch {
    return { text: bytes.toString("utf8"), ocrUsed: false, warnings: ["docx-text-fallback"] };
  }
}

async function extractPdfText(path: string, bytes: Buffer): Promise<ExtractedText> {
  try {
    const text = await runCommand("pdftotext", ["-layout", path, "-"]);
    if (normalizeExtractedText(text).length > 0 && !/scanned-pdf|ocr-required/iu.test(text)) {
      return { text, ocrUsed: false, warnings: [] };
    }
  } catch {
    return { text: bytes.toString("utf8"), ocrUsed: true, warnings: ["pdf-text-fallback"] };
  }
  return ocrPdfText(path, bytes);
}

async function ocrPdfText(path: string, bytes: Buffer): Promise<ExtractedText> {
  const dir = await mkdtemp(join(tmpdir(), "agr-ocr-"));
  try {
    const prefix = join(dir, basename(path, extname(path)));
    await runCommand("pdftoppm", ["-png", "-r", "200", path, prefix]);
    const pages = (await readdir(dir)).filter((file) => file.endsWith(".png")).sort();
    const pageTexts = await Promise.all(
      pages.map((page) => runCommand("tesseract", [join(dir, page), "stdout", "-l", "deu+eng"])),
    );
    return { text: pageTexts.join("\n\n"), ocrUsed: true, warnings: ["ocr-used"] };
  } catch {
    return {
      text: bytes.toString("utf8"),
      ocrUsed: true,
      warnings: ["ocr-used", "pdf-ocr-fallback"],
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runCommand(command: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync(command, [...args], { encoding: "utf8" });
  return result.stdout;
}

function wordXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/>/gu, "\t")
    .replace(/<\/w:p>/gu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function normalizeExtractedText(text: string): string {
  return text.replaceAll("\0", "").replace(/\r\n/gu, "\n").trim();
}

export function chunkRevision(
  revision: Revision,
  snapshotId: string,
  snapshotHash: string,
  config: { readonly window: number; readonly overlap: number },
): readonly CorpusChunk[] {
  const tokens = revision.text.split(/\s+/u).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return [];
  }
  const chunks: CorpusChunk[] = [];
  const step = Math.max(1, config.window - config.overlap);
  for (let start = 0; start < tokens.length; start += step) {
    const end = Math.min(tokens.length, start + config.window);
    const chunkText = tokens.slice(start, end).join(" ");
    chunks.push(
      makeChunk(revision, snapshotId, snapshotHash, chunks.length, start, end, chunkText),
    );
    if (end === tokens.length) {
      break;
    }
  }
  return chunks;
}

function makeChunk(
  revision: Revision,
  snapshotId: string,
  snapshotHash: string,
  chunkIndex: number,
  tokenStart: number,
  tokenEnd: number,
  chunkText: string,
): CorpusChunk {
  const charStart = chunkCharStart(revision.text, chunkText, tokenStart);
  const charEnd = chunkCharEnd(revision.text, charStart, chunkText, tokenEnd);
  const chunkSha = sha256Hex(chunkText);
  return {
    chunkId: stableId("chunk", [snapshotId, revision.path, String(chunkIndex), chunkSha]),
    docId: stableId("doc", [revision.path]),
    sourceDocumentId: stableId("src", [revision.path]),
    sourceType: revision.sourceType,
    sourcePath: revision.path,
    pageStart: 1,
    pageEnd: 1,
    charStart,
    charEnd,
    tokenStart,
    tokenEnd,
    chunkIndex,
    chunkText,
    chunkSha256: chunkSha,
    corpusSnapshotId: snapshotId,
    corpusSnapshotHash: snapshotHash,
    extractionWarnings: revision.warnings,
    ocrUsed: revision.ocrUsed,
  };
}

function chunkCharStart(text: string, chunkText: string, tokenStart: number): number {
  const exactStart = text.indexOf(chunkText);
  if (exactStart >= 0) {
    return exactStart;
  }
  return tokenBounds(text)[tokenStart]?.start ?? 0;
}

function chunkCharEnd(
  text: string,
  charStart: number,
  chunkText: string,
  tokenEnd: number,
): number {
  const exactStart = text.indexOf(chunkText);
  if (exactStart >= 0) {
    return exactStart + chunkText.length;
  }
  return tokenBounds(text)[tokenEnd - 1]?.end ?? charStart + chunkText.length;
}

function tokenBounds(text: string): readonly { readonly start: number; readonly end: number }[] {
  return [...text.matchAll(/\S+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
