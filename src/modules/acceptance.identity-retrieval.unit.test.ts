import { expect, it } from "vitest";
import { createHttpApp } from "../app/http-app.js";
import { createRuntimeApp } from "../app/runtime-app.js";
import type { CorpusChunk } from "../domain/types.js";
import { AuditLedger } from "./audit/ledger.js";
import { AuthService, UnauthorizedError } from "./auth/auth.js";
import { retrieveChunks } from "./retrieval/retrieval.js";
import { parseOperatorLocale } from "./ui/locale.js";

// No mocks: auth state uses the real in-memory service and real audit ledger.
it("enforces bootstrap, passkey sessions, cookies, recovery, and rate limits", () => {
  const ledger = new AuditLedger();
  const auth = new AuthService(ledger);
  const link = auth.requestMagicLink("Operator@Example.Local");
  const consumed = auth.consumeMagicLink(link.token);
  expect(link.expiresAtMs - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
  expect(consumed.webauthnRegistrationRequired).toBe(true);
  expect(auth.schemaColumns().join(" ")).not.toMatch(/password/iu);

  auth.registerPasskey(consumed.operatorId, "credential");
  const recovery = auth.requestMagicLink("operator@example.local");
  const session = auth.loginWithPasskey(consumed.operatorId, "credential");

  expect(recovery.recoveryOnly).toBe(true);
  expect(auth.cookiePolicy).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict" });
  expect(session.expiresAtMs - session.createdAtMs).toBe(30 * 60 * 1000);
  expect(session.absoluteExpiresAtMs - session.createdAtMs).toBe(8 * 60 * 60 * 1000);
  expect(() => auth.requireSession(null)).toThrow(UnauthorizedError);
  expect(ledger.entries().some((entry) => entry.entryType === "operator.login.success")).toBe(true);

  const limited = new AuthService(new AuditLedger());
  for (let index = 0; index < 5; index += 1) {
    limited.requestMagicLink("same@example.local");
  }
  expect(() => limited.requestMagicLink("same@example.local")).toThrow(/Rate limit/u);
});

// No mocks: Hono handles the real route and auth service rejects missing sessions.
it("rejects anonymous HTTP query access", async () => {
  const response = await createHttpApp(createRuntimeApp()).request("/api/query?q=audit");

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message_de: "Anmeldung erforderlich.",
    },
  });
});

// No mocks: locale negotiation runs through the production Accept-Language parser.
it("keeps de-DE as the only fully translated operator locale", () => {
  expect(parseOperatorLocale("de-AT,de;q=0.9,en;q=0.2")).toBe("de-DE");
  expect(parseOperatorLocale("en-US,en;q=0.9")).toBe("de-DE");
  expect(parseOperatorLocale(null)).toBe("de-DE");
});

// No mocks: retrieval ranks real chunk records with deterministic dense, BM25, and RRF logic.
it("returns bounded deterministic active-snapshot hybrid retrieval", () => {
  const chunks = makeChunks(60, "active").concat(makeChunks(1, "inactive"));
  const trace = retrieveChunks("audit beleg alpha", chunks, { activeSnapshotId: "active" });
  const first = trace.finalChunks[0];

  expect(trace.vectorCandidates).toHaveLength(50);
  expect(trace.bm25Candidates).toHaveLength(50);
  expect(trace.finalChunks).toHaveLength(8);
  expect(trace.finalChunks.every((chunk) => chunk.corpusSnapshotId === "active")).toBe(true);
  expect(typeof first?.docId).toBe("string");
  expect(first?.pageStart).toBe(1);
  expect(typeof first?.charStart).toBe("number");
  expect(first?.retrievalMethod).toBe("rrf");
  expect(
    retrieveChunks("audit", chunks, { activeSnapshotId: "active", topK: 20 }).finalChunks,
  ).toHaveLength(20);
  expect(() => retrieveChunks("audit", chunks, { activeSnapshotId: "active", topK: 0 })).toThrow(
    /top_k/u,
  );
  expect(() => retrieveChunks("audit", chunks, { activeSnapshotId: "active", topK: 21 })).toThrow(
    /top_k/u,
  );
  expect(retrieveChunks("zzzz", chunks, { activeSnapshotId: "active" }).outOfCorpus).toBe(true);
});

function makeChunks(count: number, snapshotId: string): CorpusChunk[] {
  return Array.from({ length: count }, (_, index) => ({
    chunkId: `${snapshotId}_chunk_${String(index).padStart(2, "0")}`,
    docId: `doc_${String(index)}`,
    sourceDocumentId: `src_${String(index)}`,
    sourceType: "markdown",
    sourcePath: `/corpus/${String(index)}.md`,
    pageStart: 1,
    pageEnd: 1,
    charStart: 0,
    charEnd: 50,
    tokenStart: 0,
    tokenEnd: 10,
    chunkIndex: index,
    chunkText: `audit beleg alpha nummer ${String(index)}`,
    chunkSha256: `sha_${String(index)}`,
    corpusSnapshotId: snapshotId,
    corpusSnapshotHash: `${snapshotId}_hash`,
    extractionWarnings: [],
    ocrUsed: false,
  }));
}
