import { mkdirSync } from "node:fs";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname } from "node:path";
import process from "node:process";
import { createHttpApp } from "../app/http-app.js";
import { createPostgresRuntimeApp, createRuntimeApp, type RuntimeApp } from "../app/runtime-app.js";

type ServerEnv = NodeJS.ProcessEnv & {
  readonly AUTO_INGEST_ON_START?: string;
  readonly AUDIT_LEDGER_PATH?: string;
  readonly CORPUS_DIR?: string;
  readonly DATABASE_URL?: string;
  readonly PORT?: string;
};

const env = process.env as ServerEnv;
const port = Number(env.PORT ?? "3000");
const corpusDir = env.CORPUS_DIR ?? "examples/eu-ai-act";
const ledgerPath = env.AUDIT_LEDGER_PATH ?? "/var/lib/audit-grade-rag/audit.sqlite";
mkdirSync(dirname(ledgerPath), { recursive: true });
const runtime = createRuntime();
const app = createHttpApp(runtime);

if (env.AUTO_INGEST_ON_START !== "0") {
  await runtime.ingest.ingest({ corpusDir });
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const honoResponse = await app.fetch(await toFetchRequest(request));
    response.writeHead(honoResponse.status, Object.fromEntries(honoResponse.headers.entries()));
    response.end(Buffer.from(await honoResponse.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: errorMessage(error) }));
  }
}

server.listen(port, () => {
  process.stdout.write(`audit-grade-rag listening on http://127.0.0.1:${String(port)}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      runtime
        .close?.()
        .catch((error: unknown) => {
          process.stderr.write(`${errorMessage(error)}\n`);
        })
        .finally(() => {
          process.exit(0);
        });
    });
  });
}

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
    const body = await readRequestBody(request);
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

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(chunk);
    }
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
