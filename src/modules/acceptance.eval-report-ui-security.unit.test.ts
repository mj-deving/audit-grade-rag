import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createHttpApp } from "../app/http-app.js";
import { createRuntimeApp } from "../app/runtime-app.js";
import type { RetrievedChunk } from "../domain/types.js";
import { logger } from "../lib/logger.js";
import { hashOperatorId } from "./auth/auth.js";
import {
  defaultPassingEval,
  evaluateGoldenSet,
  parseGoldenSet,
  runGoldenEvaluation,
} from "./eval/eval.js";
import { generateArticle50Report } from "./report/report.js";
import {
  assertNoPromptSecrets,
  isEgressAllowed,
  redactOperationalMeta,
} from "./security/redaction.js";
import {
  renderAuthOperator,
  renderConsole,
  renderReportView,
  renderSourceViewer,
} from "./ui/console.js";

const execFileAsync = promisify(execFile);
type EnvWithLogLevel = { LOG_LEVEL?: string };
type TombstoneMetadata = { readonly operatorIdentityDeleted?: unknown };

// No mocks: eval parsing and scoring run through the production JSONL parser.
it("fails malformed golden sets and computes thresholded machine-readable scores", async () => {
  expect(() => parseGoldenSet("")).toThrow(/empty/u);
  expect(() =>
    parseGoldenSet(JSON.stringify({ question: "Q", expected_outcome: "answered" })),
  ).toThrow(/ID/u);
  expect(() => parseGoldenSet(`${caseLine("a")}\n${caseLine("a")}`)).toThrow(/Duplicate/u);
  expect(() => parseGoldenSet(JSON.stringify({ id: "a", expected_outcome: "answered" }))).toThrow(
    /question/u,
  );
  expect(() => parseGoldenSet(JSON.stringify({ id: "a", question: "Q" }))).toThrow(/expected/u);

  const run = defaultPassingEval();
  expect(run).toMatchObject({
    status: "passed",
    groundedness: 1,
    citationAccuracy: 1,
    refusalCorrectness: 1,
  });
  expect(JSON.parse(run.outputJson) as Record<string, unknown>).toMatchObject({
    status: "passed",
    caseCount: 2,
  });
  expect(Object.keys(run.perTagBreakdown)).toContain("out-of-corpus");
  expect(evaluateGoldenSet(parseGoldenSet(caseLine("missing")), new Map()).status).toBe("failed");

  const fileBackedRun = await runGoldenEvaluation();
  expect(fileBackedRun).toMatchObject({
    status: "passed",
    caseCount: 5,
    groundedness: 1,
    citationAccuracy: 1,
    refusalCorrectness: 1,
  });
  expect(Object.keys(fileBackedRun.perTagBreakdown).sort()).toEqual([
    "ambiguous",
    "contradictory",
    "multi-hop",
    "numerical",
    "out-of-corpus",
  ]);
});

// No mocks: this proves the actual package eval command fails on an empty JSONL file.
it("fails the pnpm eval command on an empty golden set", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agr-empty-eval-"));
  try {
    const emptyGolden = join(dir, "empty.jsonl");
    await writeFile(emptyGolden, "");
    await expect(
      execFileAsync("pnpm", [
        "--silent",
        "eval",
        "--golden",
        emptyGolden,
        "--corpus",
        "corpus-fixtures",
      ]),
    ).rejects.toMatchObject({ code: 1 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// No mocks: report generation consumes real ledger rows and writes a real report ledger event.
it("generates deterministic Article 50 bundles with window filtering", async () => {
  const app = createReportWindowApp();
  app.ledger.append({
    entryType: "query.answered",
    outcome: "answered",
    generatedAnswer: "out-of-window",
    userIdHash: "outside-window",
    timestampMs: Date.parse("2026-05-09T23:59:59.999Z"),
  });
  await app.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
  const session = app.bootstrapOperator("operator@example.local");
  app.query(session.id, "jede beantwortete Anfrage");
  const request = reportWindow();
  const first = await generateArticle50Report(app.ledger, request, defaultPassingEval());
  const second = await generateArticle50Report(app.ledger, request, defaultPassingEval());

  expect(first.report.systemIdentity).toBe("Audit-Grade RAG v1");
  expect(typeof first.report.deploymentContext).toBe("string");
  expect(first.report.queryVolume).toBe(1);
  const queryOutcomes = first.report.outcomeBreakdown as { readonly answered?: number };
  expect(queryOutcomes.answered).toBe(1);
  expect(first.report.refusalRate).toBe(0);
  expect(typeof first.report.sealedAuditExcerptHash).toBe("string");
  expect(first.jsonBytes).toBe(second.jsonBytes);
  expect(Buffer.compare(first.pdfBytes, second.pdfBytes)).toBe(0);
  expect(first.pdfBytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  await expect(pdfText(first.pdfBytes)).resolves.toContain("Audit-Grade RAG v1");
  expect(first.auditExcerptZipBytes.subarray(0, 2).toString("utf8")).toBe("PK");
  expect(first.report.corpusSnapshotHashes.length).toBeGreaterThan(0);
  expect(first.report.promptTemplateAppendix).toContain("Prompt versions in window");
  await expect(
    generateArticle50Report(app.ledger, { ...request, since: request.until }, defaultPassingEval()),
  ).rejects.toThrow(/since/u);
});

// No mocks: this exercises the package report command and its filesystem artifacts.
it("writes Typst PDF, JSON, and sealed audit excerpt through the pnpm report command", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agr-report-"));
  try {
    const result = await execFileAsync("pnpm", [
      "--silent",
      "report",
      "--format=eu-ai-act-50",
      "--since=2026-05-10T00:00:00.000Z",
      "--until=2026-05-10T23:59:59.999Z",
      "--out",
      dir,
    ]);
    const payload = JSON.parse(result.stdout) as {
      readonly files: {
        readonly jsonPath: string;
        readonly pdfPath: string;
        readonly auditExcerptZipPath: string;
      };
    };
    expect(payload.files.jsonPath.endsWith("disclosure.json")).toBe(true);
    expect(payload.files.pdfPath.endsWith("disclosure.pdf")).toBe(true);
    expect(payload.files.auditExcerptZipPath.endsWith("audit-excerpt.zip")).toBe(true);
    expect((await readFile(payload.files.pdfPath)).subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(
      (await readFile(payload.files.auditExcerptZipPath)).subarray(0, 2).toString("utf8"),
    ).toBe("PK");
    expect(JSON.parse(await readFile(payload.files.jsonPath, "utf8"))).toMatchObject({
      systemIdentity: "Audit-Grade RAG v1",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// No mocks: UI HTML is rendered from production view helpers.
it("renders German console, source, report, CSP, citations, and no analytics", async () => {
  const app = createReportWindowApp();
  await app.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
  const session = app.bootstrapOperator("operator@example.local");
  const result = app.query(session.id, "jede beantwortete Anfrage");
  const report = await generateArticle50Report(app.ledger, reportWindow(), defaultPassingEval());

  const auth = renderAuthOperator();
  const consoleView = renderConsole(result);
  const source = renderSourceViewer(firstRetrieved(result.retrievedChunks));
  const reportView = renderReportView(report);
  expect(auth.html).toContain("KI-System");
  expect(auth.html).not.toMatch(/password/iu);
  expect(consoleView.html).toContain("Korpusfrage");
  expect(consoleView.html).toContain("citation-pill");
  expect(consoleView.html).toContain("char_offset=");
  expect(consoleView.html).toContain("Audit-Spur");
  expect(source.html).toContain("<mark>");
  expect(reportView.html).toContain("Artikel-50");
  expect(consoleView.csp).toContain("default-src 'self'");
  expect(consoleView.externalScriptCount).toBe(0);
  expect(consoleView.analyticsRequestCount).toBe(0);
  expect(contrastRatio("#0f766e", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#17201c", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  expect(consoleView.keyboardControls).toEqual(
    expect.arrayContaining(["query", "citation", "replay"]),
  );
});

// No mocks: Hono serves the operator console, replay API, report API, and download route.
it("serves console, replay, report, and download routes with self-only CSP", async () => {
  const runtime = createReportWindowApp();
  await runtime.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
  const session = runtime.bootstrapOperator("operator@example.local");
  const result = runtime.query(session.id, "jede beantwortete Anfrage");
  const app = createHttpApp(runtime);
  const headers = { cookie: `agr_session=${session.id}` };

  const consoleResponse = await app.request("/console", { headers });
  const consoleHtml = await consoleResponse.text();
  expect(consoleResponse.headers.get("content-security-policy")).toContain("default-src 'self'");
  expect(consoleHtml).toContain("Korpusfrage");
  expect(consoleHtml).toContain("<details");
  expect(consoleHtml).toContain("/api/audit/");
  expect(consoleHtml).toContain("/replay");
  expect(consoleHtml).not.toMatch(/<script|analytics|telemetry/iu);

  const replayResponse = await app.request(`/api/audit/${result.ledgerEntry.id}/replay`, {
    method: "POST",
    headers,
  });
  await expect(replayResponse.json()).resolves.toMatchObject({
    data: { status: "passed", byteEqual: true },
  });

  const reportResponse = await app.request("/api/report", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(reportWindow()),
  });
  const reportPayload = (await reportResponse.json()) as {
    readonly data: { readonly bundleSha256: string };
  };
  const reportHtml = await (await app.request("/console/reports", { headers })).text();
  expect(reportHtml).toContain('type="datetime-local"');
  expect(reportHtml).toContain("Bundle herunterladen");

  const downloadResponse = await app.request(
    `/api/reports/${reportPayload.data.bundleSha256}/download`,
    { headers },
  );
  expect(downloadResponse.headers.get("content-type")).toContain("application/zip");
  expect(
    Buffer.from(await downloadResponse.arrayBuffer())
      .subarray(0, 2)
      .toString("utf8"),
  ).toBe("PK");
});

// No mocks: these assertions inspect production redaction and build configuration files.
it("redacts content, blocks egress, and keeps the full build gate wired", () => {
  expect(redactOperationalMeta({ queryText: "q", chunkText: "c", answerText: "a" })).toMatchObject({
    queryText: "[redacted]",
    chunkText: "[redacted]",
    answerText: "[redacted]",
  });
  expect(() => {
    assertNoPromptSecrets("ANTHROPIC_API_KEY=sk-test");
  }).toThrow(/secret/u);
  expect(isEgressAllowed("api.anthropic.com", ["api.anthropic.com"])).toBe(true);
  expect(isEgressAllowed("tracker.example", ["api.anthropic.com"])).toBe(false);
  const residency = readFileSync("docs/data-residency.md", "utf8");
  expect(residency).toContain("Supported V1 Regions");
  expect(residency).toContain("default install runs on customer-controlled infrastructure");
  expect(residency).toContain("The only permitted outbound egress in v1");
  expect(residency).toContain("api.anthropic.com");
  expect(readFileSync("package.json", "utf8")).toContain(
    "pnpm check:fast && pnpm test:integration && pnpm test:integration:live && pnpm test:e2e && pnpm eval",
  );
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  expect(ci).toContain("pnpm check:full");
  expect(ci).toContain("pnpm/action-setup@v4");
  expect(ci).not.toContain("version: 9");
  expect(ci).toContain("poppler-utils");
  expect(ci).toContain("typst --version");
  const readme = readFileSync("README.md", "utf8");
  expect(readme).toContain("Five-Minute Install");
  expect(readme).toContain("docker-compose up -d postgres");
  expect(readme).toContain(
    "DATABASE_URL=postgres://audit_grade_rag:audit_grade_rag@127.0.0.1:5432/audit_grade_rag",
  );
  expect(readme).toContain("pnpm ingest --corpus ./examples/eu-ai-act");
  expect(readme).toContain("http://127.0.0.1:3000/console");
  expect(readFileSync("docker-compose.yml", "utf8")).toContain("3000:3000");
});

// No mocks: logger output is captured at the process boundary to enforce the INFO contract.
it("logs only operational metadata at INFO and redacts content below INFO", () => {
  const env = process.env as EnvWithLogLevel;
  const originalLogLevel = env.LOG_LEVEL;
  const originalWrite = process.stdout.write.bind(process.stdout);
  const writes: string[] = [];
  env.LOG_LEVEL = "trace";
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    writes.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    return true;
  };
  try {
    logger.info("query.completed", {
      userIdHash: "user_hash",
      queryId: "query_1",
      latencyMs: 12,
      outcome: "answered",
      queryText: "Welche Transparenzpflicht gilt?",
      chunkText: "Betreiber muessen Nutzer informieren.",
      internalDebug: "drop-me",
    });
    logger.debug("query.debug", {
      query: "Welche Transparenzpflicht gilt?",
      retrievedChunks: [{ chunkText: "Betreiber muessen Nutzer informieren." }],
    });
  } finally {
    if (originalLogLevel === undefined) {
      delete env.LOG_LEVEL;
    } else {
      env.LOG_LEVEL = originalLogLevel;
    }
    process.stdout.write = originalWrite;
  }

  const info = JSON.parse(writes[0] ?? "{}") as Record<string, unknown>;
  const debug = JSON.parse(writes[1] ?? "{}") as {
    readonly query?: unknown;
    readonly retrievedChunks?: readonly { readonly chunkText?: unknown }[];
  };
  expect(info).toMatchObject({
    level: "info",
    user_id_hash: "user_hash",
    query_id: "query_1",
    latency_ms: 12,
    outcome: "answered",
  });
  expect(info).not.toHaveProperty("queryText");
  expect(info).not.toHaveProperty("chunkText");
  expect(info).not.toHaveProperty("internalDebug");
  expect(debug.query).toBe("[redacted]");
  expect(debug.retrievedChunks?.[0]?.chunkText).toBe("[redacted]");
  expect(writes.join("")).not.toContain("Welche Transparenzpflicht gilt?");
  expect(writes.join("")).not.toContain("Betreiber muessen Nutzer informieren.");
});

// No mocks: deletion touches the real session store and exposes a tombstoned ledger-retention view.
it("deletes operator sessions and tombstones ledger user IDs without mutating the chain", () => {
  const app = createReportWindowApp();
  const session = app.bootstrapOperator("operator@example.local");
  const originalUserIdHash = hashOperatorId(session.operatorId);
  expect(app.ledger.entries().some((entry) => entry.userIdHash === originalUserIdHash)).toBe(true);

  const deleted = app.auth.tombstoneOperator(session.operatorId);

  expect(deleted.status).toBe("deleted");
  expect(deleted.emailHash).toBe(deleted.tombstoneHash);
  expect(() => app.auth.requireSession(session.id)).toThrow(/session expired/u);
  expect(app.ledger.verifyRows()).toMatchObject({ ok: true });
  expect(app.ledger.entries().some((entry) => entry.userIdHash === originalUserIdHash)).toBe(true);
  const retentionRows = app.auth.retentionLedgerEntries();
  expect(retentionRows.some((entry) => entry.userIdHash === originalUserIdHash)).toBe(false);
  expect(retentionRows.some((entry) => entry.userIdHash === deleted.tombstoneHash)).toBe(true);
  expect(
    retentionRows.some(
      (entry) => (entry.metadata as TombstoneMetadata).operatorIdentityDeleted === true,
    ),
  ).toBe(true);
});

function caseLine(id: string): string {
  return JSON.stringify({
    id,
    question: "Q",
    expected_outcome: "answered",
    expected_chunks: ["chunk_a"],
    tags: ["tag"],
  });
}

function reportWindow() {
  return {
    format: "eu-ai-act-50" as const,
    since: "2026-05-10T00:00:00.000Z",
    until: "2026-05-10T23:59:59.999Z",
  };
}

function createReportWindowApp() {
  return createRuntimeApp({ clock: { now: () => Date.parse("2026-05-10T12:00:00.000Z") } });
}

function firstRetrieved(chunks: readonly RetrievedChunk[]): RetrievedChunk {
  const chunk = chunks[0];
  if (chunk === undefined) {
    throw new Error("expected retrieved chunk");
  }
  return chunk;
}

async function pdfText(pdfBytes: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agr-pdf-text-"));
  try {
    const path = join(dir, "disclosure.pdf");
    await writeFile(path, pdfBytes);
    const result = await execFileAsync("pdftotext", [path, "-"]);
    return result.stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(hexRgb(foreground));
  const bg = relativeLuminance(hexRgb(background));
  const light = Math.max(fg, bg);
  const dark = Math.min(fg, bg);
  return (light + 0.05) / (dark + 0.05);
}

function hexRgb(hex: string): readonly [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [red, green, blue] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}
