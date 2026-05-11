import type { Context } from "hono";
import { Hono } from "hono";
import { sessionCookieHeader, UnauthorizedError } from "../modules/auth/auth.js";
import { renderAuthOperator } from "../modules/ui/console.js";
import { parseOperatorLocale } from "../modules/ui/locale.js";
import type { RuntimeApp } from "./runtime-app.js";

export function createHttpApp(runtime: RuntimeApp): Hono {
  const app = new Hono();
  registerAuthRoutes(app, runtime);
  registerQueryRoutes(app, runtime);
  return app;
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

  app.post("/api/auth/webauthn/register/verify", async (context) => {
    const body = await readJson(context.req.raw);
    const operatorId = requiredString(body, "operatorId");
    const credentialId = requiredString(body, "credentialId");
    const operator = runtime.auth.registerPasskey(operatorId, credentialId);
    return context.json({
      ok: true,
      data: { operatorId: operator.id, passkeyRegistered: operator.passkeyRegistered },
    });
  });

  app.post("/api/auth/webauthn/authenticate/verify", async (context) => {
    const body = await readJson(context.req.raw);
    const operatorId = requiredString(body, "operatorId");
    const credentialId = requiredString(body, "credentialId");
    const session = runtime.auth.loginWithPasskey(operatorId, credentialId);
    return context.json(
      { ok: true, data: { sessionId: session.id, expiresAtMs: session.expiresAtMs } },
      200,
      { "set-cookie": sessionCookieHeader(session.id, runtime.auth.cookiePolicy) },
    );
  });
}

function registerQueryRoutes(app: Hono, runtime: RuntimeApp): void {
  app.get("/api/query", (context) => {
    const sessionId = readCookie(context.req.header("cookie") ?? "", "agr_session");
    if (sessionId === null) {
      return unauthorized(context, new UnauthorizedError("anonymous query"));
    }
    const query = context.req.query("q") ?? "";
    const result = runtime.query(sessionId, query);
    return context.json({ ok: true, data: result });
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
