import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
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
  readonly corpusSnapshotHashes: readonly string[];
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
  readonly pdfBytes: Buffer;
  readonly auditExcerptZipBytes: Buffer;
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

const execFileAsync = promisify(execFile);
const reportTemplatePath = "templates/reports/eu-ai-act-50.typ";

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
  const auditExcerptZipBytes = await renderSealedAuditZip(ledger, sinceMs, untilMs);
  const auditExcerptZipSha256 = sha256Hex(auditExcerptZipBytes);
  const report = buildReport(rows, request, evalRun, auditExcerptZipSha256);
  const jsonBytes = `${canonicalJson(report)}\n`;
  const pdfBytes = await renderTypstPdf(report);
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
  sealedAuditExcerptHash: string,
): Article50Report {
  const queryRows = rows.filter((row) => row.entryType.startsWith("query."));
  const promptVersions = unique(rows.map((row) => row.promptVersion));
  return {
    systemIdentity: "Audit-Grade RAG v1",
    deploymentContext: "single-organization self-hosted deployment",
    since: request.since,
    until: request.until,
    modelVersions: unique(rows.map((row) => row.modelVersion)),
    promptVersions: unique(rows.map((row) => row.promptVersion)),
    embeddingVersions: unique(rows.map((row) => row.embeddingModelVersion)),
    corpusSnapshots: unique(rows.map((row) => row.corpusSnapshotId)),
    corpusSnapshotHashes: unique(rows.map((row) => row.corpusSnapshotHash)),
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
    promptTemplateAppendix: `Prompt versions in window: ${promptVersions.join(", ") || "none"}. Every answer prompt requires [chunk:<chunk_id>] markers on each claim.`,
    sealedAuditExcerptHash,
    limitations: [
      "This Article 50 package is a transparency artifact, not legal advice.",
      "Cloud replay reports drift honestly when provider bytes differ.",
    ],
    humanOversight:
      "Operators may disregard, replay, export, or stop use of an answer from the console.",
  };
}

async function renderSealedAuditZip(
  ledger: AuditLedger,
  sinceMs: number,
  untilMs: number,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "agr-report-excerpt-"));
  try {
    const exported = await ledger.exportSealed(dir, sinceMs, untilMs, {
      excludeEntryTypes: ["report.generated"],
    });
    return await readFile(exported.zipPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function renderTypstPdf(report: Article50Report): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "agr-typst-report-"));
  try {
    const inputPath = join(dir, "disclosure.typ");
    const outputPath = join(dir, "disclosure.pdf");
    await writeFile(inputPath, await renderTypstSource(report), "utf8");
    await execFileAsync("typst", ["compile", "--creation-timestamp", "0", inputPath, outputPath]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function renderTypstSource(report: Article50Report): Promise<string> {
  const template = await readFile(reportTemplatePath, "utf8");
  return template.replace("{{body}}", typstBody(report));
}

function typstBody(report: Article50Report): string {
  return [
    `= ${typstEscape(report.systemIdentity)} EU AI Act Article 50 Disclosure`,
    "",
    `*Window:* ${typstEscape(report.since)} to ${typstEscape(report.until)}`,
    `*Deployment context:* ${typstEscape(report.deploymentContext)}`,
    `*Models:* ${typstEscape(joinOrNone(report.modelVersions))}`,
    `*Embedding models:* ${typstEscape(joinOrNone(report.embeddingVersions))}`,
    `*Corpus snapshots:* ${typstEscape(joinOrNone(report.corpusSnapshots))}`,
    `*Corpus snapshot hashes:* ${typstEscape(joinOrNone(report.corpusSnapshotHashes))}`,
    `*Query volume:* ${String(report.queryVolume)}`,
    `*Outcome breakdown:* ${typstEscape(canonicalJson(report.outcomeBreakdown))}`,
    `*Groundedness:* ${String(report.evalScores.groundedness)}`,
    `*Citation accuracy:* ${String(report.evalScores.citationAccuracy)}`,
    `*Refusal correctness:* ${String(report.evalScores.refusalCorrectness)}`,
    `*Refusal rate:* ${String(report.refusalRate)}`,
    `*Sealed audit excerpt SHA-256:* ${typstEscape(report.sealedAuditExcerptHash)}`,
    "",
    "== Prompt Template Appendix",
    typstEscape(report.promptTemplateAppendix),
    "",
    "== Human Oversight",
    typstEscape(report.humanOversight),
    "",
    "== Limitations",
    ...report.limitations.map((limitation) => `- ${typstEscape(limitation)}`),
    "",
  ].join("\n");
}

function hashArtifacts(
  jsonBytes: string,
  pdfBytes: Buffer,
  auditExcerptZipBytes: Buffer,
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
  pdfBytes: Buffer,
  auditExcerptZipBytes: Buffer,
  hashes: Pick<ReportBundle, "jsonSha256" | "pdfSha256" | "auditExcerptZipSha256" | "bundleSha256">,
): Promise<NonNullable<ReportBundle["files"]>> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = join(outDir, "disclosure.json");
  const pdfPath = join(outDir, "disclosure.pdf");
  const auditExcerptZipPath = join(outDir, "audit-excerpt.zip");
  const manifestPath = join(outDir, "manifest.json");
  await writeFile(jsonPath, jsonBytes, "utf8");
  await writeFile(pdfPath, pdfBytes);
  await writeFile(auditExcerptZipPath, auditExcerptZipBytes);
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

function joinOrNone(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function typstEscape(value: string): string {
  return value.replace(/[\\#*_`$[\]<>@]/gu, "\\$&");
}

export function reportWindowLabel(since: string, until: string): string {
  return `${isoFromMs(parseIsoTimestamp(since, "since"))}..${isoFromMs(parseIsoTimestamp(until, "until"))}`;
}
