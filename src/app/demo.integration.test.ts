import type { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { createDemoApp, type DemoApp } from "./demo-app.js";
import { createHttpApp } from "./http-app.js";
import { createRuntimeApp } from "./runtime-app.js";

let app: Hono;
let demo: DemoApp;

beforeAll(async () => {
  demo = await createDemoApp();
  app = createHttpApp(createRuntimeApp(), demo);
});

async function get(path: string): Promise<Response> {
  return app.fetch(new Request(`http://demo.local${path}`));
}

describe("public demo route", () => {
  it("serves the console to an anonymous visitor with no session cookie", async () => {
    const response = await get("/demo");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("audit-grade-rag");
  });

  it("answers a question and renders the signed ledger row that recorded it", async () => {
    const response = await get(
      `/demo?q=${encodeURIComponent("Wie muessen KI-Ausgaben gekennzeichnet werden?")}`,
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("maschinenlesbaren Format");
    expect(html).toContain("art50-marking");
    expect(html).toContain("Ed25519");
    expect(html).toContain("local-ed25519-v1");
  });

  it("refuses an out-of-corpus question instead of fabricating an answer", async () => {
    const response = await get(
      `/demo?q=${encodeURIComponent("Welche Eigenkapitalquote verlangt die CRR für Sparkassen im Jahr 2030?")}`,
    );
    expect(await response.text()).toContain("refused-out-of-corpus");
  });

  it("matches a question typed with real umlauts against the transliterated corpus", async () => {
    const response = await get(
      `/demo?q=${encodeURIComponent("Wie müssen synthetische Inhalte gekennzeichnet werden?")}`,
    );
    const html = await response.text();
    expect(html).toContain("art50-marking");
    expect(html).not.toContain("refused-out-of-corpus");
  });

  it("replays a ledger row byte-for-byte and verifies the whole chain", async () => {
    const entry = demo.ask("Wie muessen KI-Ausgaben gekennzeichnet werden?").entry;
    const response = await app.fetch(
      new Request("http://demo.local/demo/replay", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ entry: entry.id }).toString(),
      }),
    );
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("bytegleich");
    expect(demo.verify().ok).toBe(true);
  });

  it("caps an over-long query instead of ledgering it", async () => {
    const response = await get(`/demo?q=${"a".repeat(5000)}`);
    expect(response.status).toBe(400);
  });
});

describe("replay is only offered where there is something to reproduce", () => {
  async function postReplay(entryId: string): Promise<Response> {
    return app.fetch(
      new Request("http://demo.local/demo/replay", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ entry: entryId }).toString(),
      }),
    );
  }

  it("offers no replay button on a refusal, which has no answer bytes", async () => {
    const html = await (
      await get(`/demo?q=${encodeURIComponent("Welche Eigenkapitalquote verlangt die CRR?")}`)
    ).text();
    expect(html).not.toContain("Diese Zeile erneut ausführen");
  });

  it("rejects a replay of a refusal with 400, never a 500", async () => {
    const refusal = demo.ask(
      "Welche Eigenkapitalquote verlangt die CRR für Sparkassen im Jahr 2030?",
    );
    expect(refusal.entry.generatedAnswer).toBeNull();
    expect((await postReplay(refusal.entry.id)).status).toBe(400);
  });

  it("rejects a replay of an unknown ledger id with 400, never a 500", async () => {
    expect((await postReplay("f".repeat(64))).status).toBe(400);
  });
});

describe("the demo ledger tells the truth about how the answer was produced", () => {
  it("records the retrieval profile it actually ran, not the repo's bge-m3 default", () => {
    const entry = demo.ask("Wie müssen synthetische Inhalte gekennzeichnet werden?").entry;
    expect(entry.embeddingModelVersion).toBe("lexical-bm25-rrf@1.0.0");
    expect(entry.embeddingModelVersion).not.toContain("bge-m3");
    expect(entry.modelVersion).toBe("deterministic-extractive@1.0.0");
    expect(entry.providerReplayCapability).toBe("bit_equal");
  });

  it("hash-chains every demo answer: each row carries the previous row id", () => {
    const first = demo.ask("Wann müssen Informationen bereitgestellt werden?").entry;
    const second = demo.ask("Welche Ausnahme gilt für Strafverfolgung?").entry;
    expect(second.previousHash).toBe(first.id);
    expect(demo.verify().ok).toBe(true);
  });
});

describe("the demo does not open the operator console", () => {
  it("still refuses /console without a session cookie", async () => {
    expect((await get("/console")).status).not.toBe(200);
  });

  it("still returns 401 on /api/query without a session cookie", async () => {
    const response = await get("/api/query?q=test");
    expect(response.status).toBe(401);
  });

  it("keeps the demo ledger separate from the operator ledger", () => {
    const runtime = createRuntimeApp();
    expect(demo.ledger).not.toBe(runtime.ledger);
    expect(runtime.ledger.entries()).toHaveLength(0);
  });
});
