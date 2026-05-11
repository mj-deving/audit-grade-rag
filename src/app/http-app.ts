import type { Context } from "hono";
import { Hono } from "hono";
import { UnauthorizedError } from "../modules/auth/auth.js";
import { renderAuthOperator } from "../modules/ui/console.js";
import type { RuntimeApp } from "./runtime-app.js";

export function createHttpApp(runtime: RuntimeApp): Hono {
  const app = new Hono();

  app.get("/auth/operator", (context) => {
    const view = renderAuthOperator();
    return context.html(view.html, 200, {
      "content-security-policy": view.csp,
    });
  });

  app.get("/api/query", (context) => {
    const sessionId = readCookie(context.req.header("cookie") ?? "", "agr_session");
    if (sessionId === null) {
      return unauthorized(context, new UnauthorizedError("anonymous query"));
    }
    const query = context.req.query("q") ?? "";
    const result = runtime.query(sessionId, query);
    return context.json({ ok: true, data: result });
  });

  return app;
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
