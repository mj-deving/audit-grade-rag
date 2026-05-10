import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LedgerEntry, Outcome } from "../../domain/types.js";
import { canonicalJson } from "../../lib/canonical-json.js";
import { sha256Hex } from "../../lib/hash.js";
import { isoFromMs, parseIsoTimestamp } from "../../lib/time.js";
import type { AuditLedger } from "../audit/ledger.js";
import type { EvalRun } from "../eval/eval.js";

export type ReportRequest = {
  readonly format: "eu-ai-act-50";
  readonly since: string;
  readonly until: string;
  readonly outDir?: string;
};

export type Article50Report = {
  readonly systemIdentity: string;
  readonly deploymentContext: string;
  readonly since: string;
  readonly until: string;
  readonly modelVersions: readonly string[];
  readonly promptVersions: readonly string[];
  readonly embeddingVersions: readonly string[];
  readonly corpusSnapshots: readonly string[];
  readonly queryVolume: number;
  readonly outcomeBreakdown: Record<string, number>;
  readonly evalScores: Pick<EvalRun, "groundedness" | "citationAccuracy" | "refusalCorrectness">;
  readonly refusalRate: number;
  readonly promptTemplateAppendix: string;
  readonly sealedAuditExcerptHash: string;
  readonly limitations: readonly string[];
  readonly humanOversight: string;
};

export type ReportBundle = {
  readonly report: Article50Report;
  readonly jsonBytes: string;
  readonly pdfBytes: string;
  readonly auditExcerptZipBytes: string;
  readonly jsonSha256: string;
  readonly pdfSha256: string;
  readonly auditExcerptZipSha256: string;
  readonly bundleSha256: string;
  readonly ledgerEntryId: string;
  readonly files?: {
    readonly jsonPath: string;
    readonly pdfPath: string;
    readonly auditExcerptZipPath: string;
    readonly manifestPath: string;
  };
};

export async function generateArticle50Report(
  ledger: AuditLedger,
  request: ReportRequest,
  evalRun: EvalRun,
): Promise<ReportBundle> {
  const sinceMs = parseIsoTimestamp(request.since, "since");
  const untilMs = parseIsoTimestamp(request.until, "until");
  if (sinceMs >= untilMs) {
    throw new Error("since must be earlier than until");
  }
  const rows = ledger
    .entries()
    .filter(
      (row) =>
        row.timestampMs >= sinceMs &&
        row.timestampMs <= untilMs &&
        row.entryType !== "report.generated",
    );
  const report = buildReport(rows, request, evalRun);
  const jsonBytes = `${canonicalJson(report)}\n`;
  const pdfBytes = renderDeterministicPdf(report);
  const auditExcerptZipBytes = renderDeterministicAuditZip(rows);
  const hashes = hashArtifacts(jsonBytes, pdfBytes, auditExcerptZipBytes);
  const event = ledger.append({
    entryType: "report.generated",
    outcome: "report-generated",
    generatedAnswer: hashes.bundleSha256,
    userIdHash: sha256Hex("report-operator"),
    timestampMs: untilMs,
    extra: { reportKind: request.format, sinceMs, untilMs, ...hashes },
  });
  const files =
    request.outDir === undefined
      ? undefined
      : await writeReportFiles(request.outDir, jsonBytes, pdfBytes, auditExcerptZipBytes, hashes);
  const bundle = {
    report,
    jsonBytes,
    pdfBytes,
    auditExcerptZipBytes,
    ...hashes,
    ledgerEntryId: event.id,
  };
  return files === undefined ? bundle : { ...bundle, files };
}

function buildReport(
  rows: readonly LedgerEntry[],
  request: ReportRequest,
  evalRun: EvalRun,
): Article50Report {
  const queryRows = rows.filter((row) => row.entryType.startsWith("query."));
  return {
    systemIdentity: "Audit-Grade RAG v1",
    deploymentContext: "single-organization self-hosted deployment",
    since: request.since,
    until: request.until,
    modelVersions: unique(rows.map((row) => row.modelVersion)),
    promptVersions: unique(rows.map((row) => row.promptVersion)),
    embeddingVersions: unique(rows.map((row) => row.embeddingModelVersion)),
    corpusSnapshots: unique(rows.map((row) => row.corpusSnapshotId)),
    queryVolume: queryRows.length,
    outcomeBreakdown: countOutcomes(rows),
    evalScores: {
      groundedness: evalRun.groundedness,
      citationAccuracy: evalRun.citationAccuracy,
      refusalCorrectness: evalRun.refusalCorrectness,
    },
    refusalRate:
      queryRows.length === 0
        ? 0
        : countOutcome(queryRows, "refused-out-of-corpus") / queryRows.length,
    promptTemplateAppendix: "Prompt version 1.0.0 requires [chunk:<chunk_id>] on every claim.",
    sealedAuditExcerptHash: sha256Hex(rows.map((row) => row.id).join("|")),
    limitations: [
      "This Article 50 package is a transparency artifact, not legal advice.",
      "Cloud replay reports drift honestly when provider bytes differ.",
    ],
    humanOversight:
      "Operators may disregard, replay, export, or stop use of an answer from the console.",
  };
}

function renderDeterministicPdf(report: Article50Report): string {
  return [
    "%PDF-1.4",
    "% Audit-Grade RAG deterministic Article 50 disclosure",
    `1 0 obj << /Title (${report.systemIdentity}) >> endobj`,
    `2 0 obj << /Subject (${report.deploymentContext}) >> endobj`,
    `3 0 obj << /CreationDate (${report.until}) >> endobj`,
    `4 0 obj << /Contents (${sha256Hex(canonicalJson(report))}) >> endobj`,
    "%%EOF",
    "",
  ].join("\n");
}

function renderDeterministicAuditZip(rows: readonly LedgerEntry[]): string {
  return `PK\naudit-excerpt\n${rows.map((row) => canonicalJson(row)).join("\n")}\n`;
}

function hashArtifacts(
  jsonBytes: string,
  pdfBytes: string,
  auditExcerptZipBytes: string,
): Pick<ReportBundle, "jsonSha256" | "pdfSha256" | "auditExcerptZipSha256" | "bundleSha256"> {
  const jsonSha256 = sha256Hex(jsonBytes);
  const pdfSha256 = sha256Hex(pdfBytes);
  const auditExcerptZipSha256 = sha256Hex(auditExcerptZipBytes);
  return {
    jsonSha256,
    pdfSha256,
    auditExcerptZipSha256,
    bundleSha256: sha256Hex([jsonSha256, pdfSha256, auditExcerptZipSha256].join("|")),
  };
}

async function writeReportFiles(
  outDir: string,
  jsonBytes: string,
  pdfBytes: string,
  auditExcerptZipBytes: string,
  hashes: Pick<ReportBundle, "jsonSha256" | "pdfSha256" | "auditExcerptZipSha256" | "bundleSha256">,
): Promise<NonNullable<ReportBundle["files"]>> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = join(outDir, "eu-ai-act-50.json");
  const pdfPath = join(outDir, "eu-ai-act-50.pdf");
  const auditExcerptZipPath = join(outDir, "audit-excerpt.zip");
  const manifestPath = join(outDir, "manifest.json");
  await writeFile(jsonPath, jsonBytes, "utf8");
  await writeFile(pdfPath, pdfBytes, "utf8");
  await writeFile(auditExcerptZipPath, auditExcerptZipBytes, "utf8");
  await writeFile(manifestPath, `${canonicalJson(hashes)}\n`, "utf8");
  return { jsonPath, pdfPath, auditExcerptZipPath, manifestPath };
}

function countOutcomes(rows: readonly LedgerEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.outcome] = (counts[row.outcome] ?? 0) + 1;
  }
  return counts;
}

function countOutcome(rows: readonly LedgerEntry[], outcome: Outcome): number {
  return rows.filter((row) => row.outcome === outcome).length;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value !== "not-applicable"))].sort();
}

export function reportWindowLabel(since: string, until: string): string {
  return `${isoFromMs(parseIsoTimestamp(since, "since"))}..${isoFromMs(parseIsoTimestamp(until, "until"))}`;
}
