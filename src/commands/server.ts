import { mkdirSync } from "node:fs";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname } from "node:path";
import process from "node:process";
import type { Hono } from "hono";
import { createDemoApp } from "../app/demo-app.js";
import { createDemoOnlyHttpApp, createHttpApp } from "../app/http-app.js";
import { createPostgresRuntimeApp, createRuntimeApp, type RuntimeApp } from "../app/runtime-app.js";

type ServerEnv = NodeJS.ProcessEnv & {
  readonly AUTO_INGEST_ON_START?: string;
  readonly AUDIT_LEDGER_PATH?: string;
  readonly CORPUS_DIR?: string;
  readonly DATABASE_URL?: string;
  readonly DEMO_CORPUS_DIR?: string;
  readonly DEMO_LEDGER_PATH?: string;
  readonly DEMO_ONLY?: string;
  readonly PUBLIC_DEMO?: string;
  readonly PORT?: string;
};

const env = process.env as ServerEnv;
const port = Number(env.PORT ?? "3000");
const corpusDir = env.CORPUS_DIR ?? "examples/eu-ai-act";
const ledgerPath = env.AUDIT_LEDGER_PATH ?? "/var/lib/audit-grade-rag/audit.sqlite";
const demoLedgerPath = env.DEMO_LEDGER_PATH ?? "/var/lib/audit-grade-rag/demo.sqlite";

if (env.DEMO_ONLY === "1") {
  await startDemoOnly();
} else {
  await startOperator();
}

// The public demo instance. It mounts ONLY the demo routes (createDemoOnlyHttpApp): no operator
// runtime, no auth, no console, no corpus ingest. It cannot serve an operator route, so the
// unauthenticated public hostname cannot reach the auth bootstrap even if the tunnel path-scope ever
// fails open. Its ledger and corpus are its own (demo-app.ts). This runs behind
// audit-grade-rag-demo.mjdeving.com; the operator app runs as a separate process and stays gated.
async function startDemoOnly(): Promise<void> {
  mkdirSync(dirname(demoLedgerPath), { recursive: true });
  const demo = await createDemoApp({
    ledgerPath: demoLedgerPath,
    ...(env.DEMO_CORPUS_DIR === undefined ? {} : { corpusDir: env.DEMO_CORPUS_DIR }),
  });
  listen(createDemoOnlyHttpApp(demo));
}

async function startOperator(): Promise<void> {
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const runtime = createRuntime();
  const app = createHttpApp(runtime);
  if (env.AUTO_INGEST_ON_START !== "0") {
    await runtime.ingest.ingest({ corpusDir });
  }
  listen(app, () => runtime.close?.() ?? Promise.resolve());
}

function listen(app: Hono, onClose?: () => Promise<void>): void {
  const server = createServer((request, response) => {
    void handleRequest(app, request, response);
  });
  server.listen(port, () => {
    process.stdout.write(`audit-grade-rag listening on http://127.0.0.1:${String(port)}\n`);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => {
        (onClose?.() ?? Promise.resolve())
          .catch((error: unknown) => {
            process.stderr.write(`${errorMessage(error)}\n`);
          })
          .finally(() => {
            process.exit(0);
          });
      });
    });
  }
}

async function handleRequest(
  app: Hono,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const honoResponse = await app.fetch(await toFetchRequest(request));
    response.writeHead(honoResponse.status, Object.fromEntries(honoResponse.headers.entries()));
    response.end(Buffer.from(await honoResponse.arrayBuffer()));
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      response.writeHead(413, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "payload too large" }));
      return;
    }
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: errorMessage(error) }));
  }
}

// A hard body ceiling enforced at the ingestion point, before the body is buffered or parsed. The
// demo's row cap and rate limit only run AFTER formData() parses the request, so without this an
// unauthenticated attacker could OOM the small public demo container with one oversized POST to
// /demo/replay (whose real body is a 64-char id). Operator posts are small JSON, so 1 MB is
// generous for both instances and well under either container's memory.
const maxRequestBodyBytes = 1_000_000;

class PayloadTooLargeError extends Error {}

function createRuntime(): RuntimeApp {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl.length > 0) {
    return createPostgresRuntimeApp({ databaseUrl, ledgerPath });
  }
  return createRuntimeApp({ ledgerPath });
}

async function toFetchRequest(request: IncomingMessage): Promise<Request> {
  const url = `http://${hostHeader(request.headers)}${request.url ?? "/"}`;
  const init: RequestInit = {
    method: request.method ?? "GET",
    headers: headersFromIncoming(request.headers),
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const declaredLength = Number(request.headers["content-length"] ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > maxRequestBodyBytes) {
      throw new PayloadTooLargeError();
    }
    const body = await readRequestBody(request, maxRequestBodyBytes);
    if (body.length > 0) {
      init.body = body;
    }
  }
  return new Request(url, init);
}

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const output = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        output.append(key, item);
      }
    } else if (value !== undefined) {
      output.set(key, value);
    }
  }
  return output;
}

async function readRequestBody(request: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request) {
    const piece =
      typeof chunk === "string" ? Buffer.from(chunk) : chunk instanceof Uint8Array ? chunk : null;
    if (piece === null) {
      continue;
    }
    total += piece.length;
    // A chunked body sends no Content-Length, so the stream itself is the only place to stop an
    // oversized upload. Destroy the socket rather than keep buffering once we pass the ceiling.
    if (total > maxBytes) {
      request.destroy();
      throw new PayloadTooLargeError();
    }
    chunks.push(piece);
  }
  return Buffer.concat(chunks);
}

function hostHeader(headers: IncomingHttpHeaders): string {
  const host = headers.host;
  if (Array.isArray(host)) {
    return String(host[0] ?? defaultHost());
  }
  return host ?? defaultHost();
}

function defaultHost(): string {
  return `127.0.0.1:${String(port)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
