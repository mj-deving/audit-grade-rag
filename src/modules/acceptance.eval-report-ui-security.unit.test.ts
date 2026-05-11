import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createRuntimeApp } from "../app/runtime-app.js";
import type { RetrievedChunk } from "../domain/types.js";
import { defaultPassingEval, evaluateGoldenSet, parseGoldenSet } from "./eval/eval.js";
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

// No mocks: eval parsing and scoring run through the production JSONL parser.
it("fails malformed golden sets and computes thresholded machine-readable scores", () => {
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
});

// No mocks: report generation consumes real ledger rows and writes a real report ledger event.
it("generates deterministic Article 50 bundles with window filtering", async () => {
  const app = createReportWindowApp();
  await app.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
  const session = app.bootstrapOperator("operator@example.local");
  app.query(session.id, "jede beantwortete Anfrage");
  const request = reportWindow();
  const first = await generateArticle50Report(app.ledger, request, defaultPassingEval());
  const second = await generateArticle50Report(app.ledger, request, defaultPassingEval());

  expect(first.report.systemIdentity).toBe("Audit-Grade RAG v1");
  expect(typeof first.report.deploymentContext).toBe("string");
  expect(first.report.queryVolume).toBe(1);
  expect(first.report.refusalRate).toBe(0);
  expect(typeof first.report.sealedAuditExcerptHash).toBe("string");
  expect(first.jsonBytes).toBe(second.jsonBytes);
  expect(first.pdfBytes).toBe(second.pdfBytes);
  expect(first.auditExcerptZipBytes).toContain("PK");
  await expect(
    generateArticle50Report(app.ledger, { ...request, since: request.until }, defaultPassingEval()),
  ).rejects.toThrow(/since/u);
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
  expect(consoleView.keyboardControls).toEqual(
    expect.arrayContaining(["query", "citation", "replay"]),
  );
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
  expect(readFileSync("package.json", "utf8")).toContain(
    "pnpm check:fast && pnpm test:integration && pnpm test:e2e && pnpm eval",
  );
  expect(readFileSync(".github/workflows/ci.yml", "utf8")).toContain("pnpm check:full");
  expect(readFileSync("README.md", "utf8")).toContain("Five-Minute Install");
  expect(readFileSync("docker-compose.yml", "utf8")).toContain("3000:3000");
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
