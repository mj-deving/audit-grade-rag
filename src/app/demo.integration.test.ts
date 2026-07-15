import type { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { createDemoApp, type DemoApp } from "./demo-app.js";
import { createDemoOnlyHttpApp, createHttpApp } from "./http-app.js";
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

describe("the demo renders correct German and keeps provenance strings intact", () => {
  it("matches umlaut and transliterated spellings alike, and renders the corpus with real umlauts", async () => {
    const response = await get(
      `/demo?q=${encodeURIComponent("Wie müssen synthetische Inhalte gekennzeichnet werden?")}`,
    );
    const html = await response.text();
    expect(html).toContain("art50-marking");
    expect(html).not.toContain("refused-out-of-corpus");
    // The corpus stores correct German now, so the rendered evidence carries real umlauts.
    expect(html).toContain("künstlich");
    expect(html).not.toContain("kuenstlich");
  });

  it("shields @-shaped provenance values from CDN email obfuscation", async () => {
    const html = await (
      await get(
        `/demo?q=${encodeURIComponent("Wie müssen synthetische Inhalte gekennzeichnet werden?")}`,
      )
    ).text();
    // The audit row shows model + retrieval versions like "deterministic-extractive@1.0.0". Wrapped in
    // <!--email_off--> so Cloudflare's Scrape Shield leaves them intact instead of masking them.
    expect(html).toContain("<!--email_off-->");
    expect(html).toMatch(/<!--email_off-->[^<]*@[^<]*<!--\/email_off-->/);
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

describe("public write paths are bounded", () => {
  async function askAs(forwardedFor: string, query: string): Promise<Response> {
    return app.fetch(
      new Request(`http://demo.local/demo?q=${encodeURIComponent(query)}`, {
        headers: { "x-forwarded-for": forwardedFor },
      }),
    );
  }

  it("a spoofed x-forwarded-for cannot mint unlimited ledger writes", async () => {
    const fresh = await createDemoApp();
    const isolated = createHttpApp(createRuntimeApp(), fresh);
    const before = fresh.ledger.entries().length;
    let throttled = 0;
    // A new client key on every single request: the per-client window never fills. Only the global
    // cap stands between a spoofer and unbounded growth of an append-only ledger.
    for (let index = 0; index < 120; index += 1) {
      const response = await isolated.fetch(
        new Request(`http://demo.local/demo?q=${encodeURIComponent("Kennzeichnung")}`, {
          headers: { "x-forwarded-for": `10.0.0.${String(index)}` },
        }),
      );
      if (response.status === 429) {
        throttled += 1;
      }
    }
    const written = fresh.ledger.entries().length - before;
    expect(throttled).toBeGreaterThan(0);
    expect(written).toBeLessThanOrEqual(60);
  });

  it("throttles the replay route, which also appends a signed row", async () => {
    const fresh = await createDemoApp();
    const isolated = createHttpApp(createRuntimeApp(), fresh);
    const entry = fresh.ask("Wie müssen synthetische Inhalte gekennzeichnet werden?").entry;
    let throttled = 0;
    // Past the global cap, and with a fresh client key each time so only the global cap can stop it.
    for (let index = 0; index < 80; index += 1) {
      const response = await isolated.fetch(
        new Request("http://demo.local/demo/replay", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-forwarded-for": `10.1.0.${String(index)}`,
          },
          body: new URLSearchParams({ entry: entry.id }).toString(),
        }),
      );
      if (response.status === 429) {
        throttled += 1;
      }
    }
    expect(throttled).toBeGreaterThan(0);
  });

  it("still answers a normal visitor who is nowhere near the cap", async () => {
    const response = await askAs(
      "203.0.113.9",
      "Wie müssen synthetische Inhalte gekennzeichnet werden?",
    );
    expect(response.status).toBe(200);
  });
});

describe("the write budget is only spent on actual writes", () => {
  it("does not let invalid replays spend the shared write budget", async () => {
    const fresh = await createDemoApp();
    const isolated = createHttpApp(createRuntimeApp(), fresh);
    // 200 replays of an id that does not exist. None of them can append a row, so none of them may
    // charge the global window; otherwise this is a denial-of-service on every real visitor.
    for (let index = 0; index < 200; index += 1) {
      const response = await isolated.fetch(
        new Request("http://demo.local/demo/replay", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-forwarded-for": `10.2.0.${String(index % 250)}`,
          },
          body: new URLSearchParams({ entry: "f".repeat(64) }).toString(),
        }),
      );
      expect(response.status).toBe(400);
    }
    const after = await isolated.fetch(
      new Request(`http://demo.local/demo?q=${encodeURIComponent("Kennzeichnung")}`, {
        headers: { "x-forwarded-for": "198.51.100.7" },
      }),
    );
    expect(after.status).toBe(200);
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

describe("the public demo instance mounts only demo routes", () => {
  it("serves /demo but has no operator route at all", async () => {
    const app = createDemoOnlyHttpApp(await createDemoApp());
    const status = async (path: string, init?: RequestInit): Promise<number> =>
      (await app.fetch(new Request(`http://audit-grade-rag-demo.mjdeving.com${path}`, init)))
        .status;
    expect(await status("/demo")).toBe(200);
    // Absent, not merely gated: an operator route does not exist on the demo instance, so it 404s.
    // The unauthenticated public host therefore cannot reach the auth bootstrap even if the tunnel
    // path-scope failed open.
    expect(await status("/console")).toBe(404);
    expect(await status("/auth/operator")).toBe(404);
    expect(await status("/api/query?q=x")).toBe(404);
    expect(await status("/api/auth/magic-link/request", { method: "POST", body: "{}" })).toBe(404);
    expect(
      await status("/api/auth/webauthn/authenticate/verify", { method: "POST", body: "{}" }),
    ).toBe(404);
    // A /demo-prefixed path that is not exactly /demo or /demo/replay does not smuggle in a route.
    expect(await status("/demoxyz")).toBe(404);
    expect(await status("/demo/..%2fconsole")).toBe(404);
  });
});

describe("the demo refuses writes past its ledger ceiling", () => {
  it("returns 503 once the demo ledger reaches capacity, without a 500", async () => {
    const demo = await createDemoApp({ maxTotalRows: 1 });
    const app = createHttpApp(createRuntimeApp(), demo);
    const ask = async (): Promise<Response> =>
      app.fetch(
        new Request(`http://demo.local/demo?q=${encodeURIComponent("Kennzeichnung")}`, {
          headers: { "x-forwarded-for": "203.0.113.50" },
        }),
      );
    expect((await ask()).status).toBe(200); // the first write reaches the ceiling of one row
    const full = await ask();
    expect(full.status).toBe(503);
    expect(await full.text()).toContain("Obergrenze");
  });
});
