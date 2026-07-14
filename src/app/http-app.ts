import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { LedgerEntry } from "../domain/types.js";
import { sessionCookieHeader, UnauthorizedError } from "../modules/auth/auth.js";
import { runGoldenEvaluation } from "../modules/eval/eval.js";
import { EvidenceEchoProvider } from "../modules/generation/generation.js";
import {
  type ReplayResult,
  replayArtifactsFromEntry,
  replayLedgerEntry,
} from "../modules/replay/replay.js";
import { generateArticle50Report } from "../modules/report/report.js";
import {
  renderAuthOperator,
  renderConsole,
  renderReportView,
  renderSourceViewer,
} from "../modules/ui/console.js";
import { renderDemo } from "../modules/ui/demo-console.js";
import { parseOperatorLocale } from "../modules/ui/locale.js";
import { type DemoApp, demoMaxQueryLength } from "./demo-app.js";
import type { RuntimeApp } from "./runtime-app.js";

export function createHttpApp(runtime: RuntimeApp, demo?: DemoApp): Hono {
  const app = new Hono();
  const reportDownloads = new Map<string, Buffer>();
  registerHealthRoutes(app, runtime);
  registerAuthRoutes(app, runtime);
  registerQueryRoutes(app, runtime);
  registerConsoleRoutes(app, runtime, reportDownloads);
  registerReportRoutes(app, runtime, reportDownloads);
  registerReplayRoutes(app, runtime);
  if (demo !== undefined) {
    registerDemoRoutes(app, demo);
  }
  return app;
}

/**
 * The public demo. It is deliberately the only unauthenticated surface that can reach a corpus,
 * and it reaches its OWN corpus and its OWN ledger (see demo-app.ts) — never the operator's. It
 * adds no session, weakens no gate, and shares no state with the routes above.
 */
function registerDemoRoutes(app: Hono, demo: DemoApp): void {
  app.get("/demo", (context) => {
    const query = (context.req.query("q") ?? "").trim();
    if (query.length > demoMaxQueryLength) {
      return demoPage(context, demo, "", null, null, tooLongMessage(), 400);
    }
    if (query.length === 0) {
      return demoPage(context, demo, "", null, null, null, 200);
    }
    if (!demo.allow(clientKey(context))) {
      return demoPage(context, demo, query, null, null, rateLimitMessage(), 429);
    }
    return demoPage(context, demo, query, demo.ask(query).entry, null, null, 200);
  });

  app.post("/demo/replay", async (context) => {
    const form = await context.req.formData();
    const entryId = form.get("entry");
    if (typeof entryId !== "string") {
      return demoPage(context, demo, "", null, null, "Keine Ledger-Zeile angegeben.", 400);
    }
    // An unknown id, or a row with no answer bytes (a refusal), makes the replay engine throw. That
    // is a bad request from a public form, not a server fault, and must not surface as a 500.
    try {
      const replayed = demo.replay(entryId);
      const query = replayed.entry.queryText ?? "";
      return demoPage(context, demo, query, replayed.entry, replayed.result, null, 200);
    } catch {
      return demoPage(context, demo, "", null, null, replayRejectedMessage(), 400);
    }
  });
}

function demoPage(
  context: Context,
  demo: DemoApp,
  query: string,
  entry: LedgerEntry | null,
  replay: ReplayResult | null,
  error: string | null,
  status: ContentfulStatusCode,
) {
  const view = renderDemo({
    query,
    entry,
    replay,
    corpus: demo.chunks,
    examples: demo.examples,
    verification: demo.verify(),
    error,
  });
  return context.html(view.html, status, { "content-security-policy": view.csp });
}

/** Behind Railway's proxy the socket address is the proxy, so the first forwarded hop is the client. */
function clientKey(context: Context): string {
  const forwarded = context.req.header("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() ?? "unknown";
}

function tooLongMessage(): string {
  return `Die Frage ist länger als ${String(demoMaxQueryLength)} Zeichen und wurde nicht ausgeführt.`;
}

function rateLimitMessage(): string {
  return "Zu viele Fragen aus dieser Quelle. Bitte in einigen Minuten erneut versuchen.";
}

function replayRejectedMessage(): string {
  return "Diese Ledger-Zeile lässt sich nicht erneut ausführen. Eine Verweigerung enthält keine Antwort-Bytes, und eine unbekannte Zeilen-ID kann nicht reproduziert werden.";
}

function registerHealthRoutes(app: Hono, runtime: RuntimeApp): void {
  app.get("/health", async (context) => {
    const health = await runtime.health();
    return context.json({ ok: health.ok, data: health }, health.ok ? 200 : 503);
  });
}

function registerAuthRoutes(app: Hono, runtime: RuntimeApp): void {
  app.get("/auth/operator", (context) => {
    parseOperatorLocale(context.req.header("accept-language"));
    const view = renderAuthOperator();
    return context.html(view.html, 200, {
      "content-security-policy": view.csp,
    });
  });

  app.post("/api/auth/magic-link/request", async (context) => {
    const body = await readJson(context.req.raw);
    const email = requiredString(body, "email");
    const request = runtime.auth.requestMagicLink(email);
    return context.json({
      ok: true,
      data: {
        status: request.status,
        expiresAtMs: request.expiresAtMs,
        recoveryOnly: request.recoveryOnly,
        localDeliveryToken: request.token,
      },
    });
  });

  app.post("/api/auth/magic-link/consume", async (context) => {
    const body = await readJson(context.req.raw);
    const token = requiredString(body, "token");
    const consumed = runtime.auth.consumeMagicLink(token);
    return context.json({ ok: true, data: consumed });
  });
  registerPasskeyRoutes(app, runtime);
}

function registerPasskeyRoutes(app: Hono, runtime: RuntimeApp): void {
  app.post("/api/auth/webauthn/register/verify", async (context) => {
    const body = await readJson(context.req.raw);
    const operatorId = requiredString(body, "operatorId");
    const operator = runtime.auth.registerPasskey({
      operatorId,
      credentialId: requiredString(body, "credentialId"),
      publicKeyPem: requiredString(body, "publicKeyPem"),
      challenge: requiredString(body, "challenge"),
      signatureBase64Url: requiredString(body, "signatureBase64Url"),
    });
    return context.json({
      ok: true,
      data: { operatorId: operator.id, passkeyRegistered: operator.passkeyRegistered },
    });
  });

  app.post("/api/auth/webauthn/register/options", async (context) => {
    const body = await readJson(context.req.raw);
    const operatorId = requiredString(body, "operatorId");
    return context.json({
      ok: true,
      data: runtime.auth.createPasskeyRegistrationOptions(operatorId),
    });
  });

  app.post("/api/auth/webauthn/authenticate/options", async (context) => {
    const body = await readJson(context.req.raw);
    const operatorId = requiredString(body, "operatorId");
    return context.json({
      ok: true,
      data: runtime.auth.createPasskeyAuthenticationOptions(operatorId),
    });
  });

  app.post("/api/auth/webauthn/authenticate/verify", async (context) => {
    const body = await readJson(context.req.raw);
    const operatorId = requiredString(body, "operatorId");
    const session = runtime.auth.loginWithPasskey({
      operatorId,
      credentialId: requiredString(body, "credentialId"),
      challenge: requiredString(body, "challenge"),
      signatureBase64Url: requiredString(body, "signatureBase64Url"),
    });
    return context.json(
      { ok: true, data: { sessionId: session.id, expiresAtMs: session.expiresAtMs } },
      200,
      { "set-cookie": sessionCookieHeader(session.id, runtime.auth.cookiePolicy) },
    );
  });
}

function registerQueryRoutes(app: Hono, runtime: RuntimeApp): void {
  app.get("/api/query", async (context) => {
    const sessionId = readCookie(context.req.header("cookie") ?? "", "agr_session");
    if (sessionId === null) {
      return unauthorized(context, new UnauthorizedError("anonymous query"));
    }
    const query = context.req.query("q") ?? "";
    const result = await runtime.queryAsync(sessionId, query);
    return context.json({ ok: true, data: result });
  });
}

function registerConsoleRoutes(
  app: Hono,
  runtime: RuntimeApp,
  reportDownloads: Map<string, Buffer>,
): void {
  app.get("/console", async (context) => {
    const sessionId = requireSessionCookie(context, runtime);
    await ensureCorpus(runtime);
    const result = await runtime.queryAsync(
      sessionId,
      context.req.query("q") ?? "beantwortete Anfrage",
    );
    const view = renderConsole(result);
    return context.html(view.html, 200, { "content-security-policy": view.csp });
  });

  app.get("/console/reports", async (context) => {
    requireSessionCookie(context, runtime);
    const report = await generateArticle50Report(
      runtime.ledger,
      reportRequestFromQuery(context),
      await runGoldenEvaluation(),
    );
    reportDownloads.set(report.bundleSha256, report.auditExcerptZipBytes);
    const view = renderReportView(report);
    return context.html(view.html, 200, { "content-security-policy": view.csp });
  });

  app.get("/source/:docId/page/:page", async (context) => {
    await ensureCorpus(runtime);
    const docId = context.req.param("docId");
    const charOffset = Number(context.req.query("char_offset") ?? "0");
    const chunk = await runtime.findSourceChunk(docId, charOffset);
    if (chunk === null) {
      return context.notFound();
    }
    const view = renderSourceViewer({ ...chunk, retrievalScore: 1, retrievalMethod: "rrf" });
    return context.html(view.html, 200, { "content-security-policy": view.csp });
  });
}

function registerReportRoutes(
  app: Hono,
  runtime: RuntimeApp,
  reportDownloads: Map<string, Buffer>,
): void {
  app.post("/api/report", async (context) => {
    requireSessionCookie(context, runtime);
    const body = await readJson(context.req.raw);
    const report = await generateArticle50Report(
      runtime.ledger,
      {
        format: "eu-ai-act-50",
        since: requiredString(body, "since"),
        until: requiredString(body, "until"),
      },
      await runGoldenEvaluation(),
    );
    reportDownloads.set(report.bundleSha256, report.auditExcerptZipBytes);
    return context.json({ ok: true, data: report });
  });

  app.get("/api/reports/:bundleSha/download", (context) => {
    const bundleSha = context.req.param("bundleSha");
    const zipBytes = reportDownloads.get(bundleSha);
    if (zipBytes === undefined) {
      return context.notFound();
    }
    return new Response(zipBytes, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="audit-excerpt.zip"',
      },
    });
  });
}

function registerReplayRoutes(app: Hono, runtime: RuntimeApp): void {
  app.post("/api/audit/:entryId/replay", (context) => {
    requireSessionCookie(context, runtime);
    const entry = runtime.ledger.findById(context.req.param("entryId"));
    const replay = replayLedgerEntry(
      runtime.ledger,
      entry,
      new EvidenceEchoProvider({
        id: entry.providerProfileId,
        name: entry.providerProfileId,
        modelVersion: entry.modelVersion,
        replayCapability: entry.providerReplayCapability,
        supportsSeed: entry.seed !== null,
        configHash: entry.providerProfileId,
      }),
      replayArtifactsFromEntry(entry),
    );
    return context.json({
      ok: replay.status === "passed",
      data: {
        ...replay,
        diff:
          replay.status === "drift"
            ? `- ${entry.generatedAnswer ?? ""}\n+ ${replay.driftArtifact ?? "unknown"}`
            : null,
      },
    });
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("JSON body must be an object");
  }
  return body as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function readCookie(header: string, name: string): string | null {
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function requireSessionCookie(context: Context, runtime: RuntimeApp): string {
  const sessionId = readCookie(context.req.header("cookie") ?? "", "agr_session");
  if (sessionId === null) {
    throw new UnauthorizedError("operator session required");
  }
  runtime.auth.requireSession(sessionId);
  return sessionId;
}

async function ensureCorpus(runtime: RuntimeApp): Promise<void> {
  if ((await runtime.ingest.activeSnapshot()) === null) {
    await runtime.ingest.ingest({ corpusDir: "examples/eu-ai-act" });
  }
}

function reportRequestFromQuery(context: Context) {
  return {
    format: "eu-ai-act-50" as const,
    since: context.req.query("since") ?? "2026-05-10T00:00:00.000Z",
    until: context.req.query("until") ?? "2026-05-10T23:59:59.999Z",
  };
}

function unauthorized(context: Context, error: UnauthorizedError) {
  return context.json(
    {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message_de: "Anmeldung erforderlich.",
        message_en: error.message,
        retryable: false,
      },
    },
    401,
  );
}
