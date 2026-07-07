import { verifySqliteLedger } from "../src/modules/audit/ledger.js";
import { createLocalPasskey } from "../src/modules/auth/passkey-proof.js";

export type AuditGradeRagClientConfig = {
  readonly baseUrl: string;
  readonly operatorEmail: string;
  readonly ledgerPath?: string;
  readonly fetch?: typeof fetch;
};

type JsonObject = Record<string, unknown>;

type RagQuerySummary = {
  readonly outcome: unknown;
  readonly answer: unknown;
  readonly queryId: unknown;
  readonly corpusSnapshotId: unknown;
  readonly corpusSnapshotHash: unknown;
  readonly answerHash: unknown;
  readonly claims: unknown;
  readonly retrievedChunks: unknown;
  readonly ledgerEntryId: unknown;
};

export type AuditGradeRagClient = {
  health(): Promise<unknown>;
  ragQuery(query: string): Promise<RagQuerySummary>;
  auditVerify(): Promise<unknown>;
  replay(entryId: string): Promise<unknown>;
};

export function createAuditGradeRagClient(config: AuditGradeRagClientConfig): AuditGradeRagClient {
  const clientFetch = config.fetch ?? fetch;
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  let sessionCookie: string | null = null;

  return {
    health: () => getJson(clientFetch, `${baseUrl}/health`),
    ragQuery: async (query) => {
      const data = await getData(
        clientFetch,
        `${baseUrl}/api/query?q=${encodeURIComponent(query)}`,
        await ensureSessionCookie(),
      );
      return summarizeQueryResult(data);
    },
    auditVerify: () => {
      if (config.ledgerPath === undefined || config.ledgerPath.length === 0) {
        throw new Error("AGR_LEDGER_PATH is required for audit_verify");
      }
      return Promise.resolve(verifySqliteLedger(config.ledgerPath));
    },
    replay: async (entryId) =>
      getData(
        clientFetch,
        `${baseUrl}/api/audit/${encodeURIComponent(entryId)}/replay`,
        await ensureSessionCookie(),
        { method: "POST" },
      ),
  };

  async function ensureSessionCookie(): Promise<string> {
    if (sessionCookie !== null) {
      return sessionCookie;
    }
    sessionCookie = await authenticate(clientFetch, baseUrl, config.operatorEmail);
    if (sessionCookie === null) {
      throw new Error("authentication response did not set agr_session cookie");
    }
    return sessionCookie;
  }
}

async function authenticate(
  clientFetch: typeof fetch,
  baseUrl: string,
  email: string,
): Promise<string | null> {
  if (email.length === 0) {
    throw new Error("AGR_OPERATOR_EMAIL is required for authenticated tools");
  }
  const magicLink = await postData(clientFetch, `${baseUrl}/api/auth/magic-link/request`, {
    email,
  });
  const consumed = await postData(clientFetch, `${baseUrl}/api/auth/magic-link/consume`, {
    token: stringField(magicLink, "localDeliveryToken"),
  });
  const operatorId = stringField(consumed, "operatorId");
  const passkey = createLocalPasskey("audit-grade-rag-mcp");
  await registerPasskey(clientFetch, baseUrl, operatorId, passkey);
  return loginWithPasskey(clientFetch, baseUrl, operatorId, passkey);
}

async function registerPasskey(
  clientFetch: typeof fetch,
  baseUrl: string,
  operatorId: string,
  passkey: ReturnType<typeof createLocalPasskey>,
): Promise<void> {
  const registration = await postData(
    clientFetch,
    `${baseUrl}/api/auth/webauthn/register/options`,
    { operatorId },
  );
  const challenge = stringField(registration, "challenge");
  await postData(clientFetch, `${baseUrl}/api/auth/webauthn/register/verify`, {
    operatorId,
    credentialId: passkey.credentialId,
    publicKeyPem: passkey.publicKeyPem,
    challenge,
    signatureBase64Url: passkey.signChallenge(challenge),
  });
}

async function loginWithPasskey(
  clientFetch: typeof fetch,
  baseUrl: string,
  operatorId: string,
  passkey: ReturnType<typeof createLocalPasskey>,
): Promise<string | null> {
  const authentication = await postData(
    clientFetch,
    `${baseUrl}/api/auth/webauthn/authenticate/options`,
    { operatorId },
  );
  const challenge = stringField(authentication, "challenge");
  const login = await clientFetch(`${baseUrl}/api/auth/webauthn/authenticate/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operatorId,
      credentialId: passkey.credentialId,
      challenge,
      signatureBase64Url: passkey.signChallenge(challenge),
    }),
  });
  await assertOk(login);
  return cookiePair(login.headers.get("set-cookie"));
}

function normalizeBaseUrl(value: string): string {
  if (value.length === 0) {
    throw new Error("AGR_BASE_URL is required");
  }
  return value.replace(/\/+$/u, "");
}

async function getJson(clientFetch: typeof fetch, url: string): Promise<unknown> {
  const response = await clientFetch(url);
  await assertOk(response);
  return response.json();
}

async function getData(
  clientFetch: typeof fetch,
  url: string,
  cookie: string,
  init: RequestInit = {},
): Promise<JsonObject> {
  const response = await clientFetch(url, {
    ...init,
    headers: {
      ...headersRecord(init.headers),
      cookie,
    },
  });
  await assertOk(response);
  const body = await response.json();
  return dataObject(body);
}

async function postData(
  clientFetch: typeof fetch,
  url: string,
  body: JsonObject,
): Promise<JsonObject> {
  const response = await clientFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await assertOk(response);
  const json = await response.json();
  return dataObject(json);
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const text = await response.text();
  throw new Error(`audit-grade-rag request failed ${String(response.status)}: ${text}`);
}

function dataObject(value: unknown): JsonObject {
  const data = objectField(value, "data");
  if (data === null) {
    throw new Error("audit-grade-rag response missing data object");
  }
  return data;
}

function stringField(value: JsonObject, field: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || fieldValue.length === 0) {
    throw new Error(`audit-grade-rag response missing string field ${field}`);
  }
  return fieldValue;
}

function summarizeQueryResult(data: JsonObject): RagQuerySummary {
  const ledgerEntry = objectField(data, "ledgerEntry") ?? {};
  return {
    outcome: field(data, "outcome"),
    answer: field(data, "answer"),
    queryId: field(data, "queryId"),
    corpusSnapshotId: field(data, "corpusSnapshotId"),
    corpusSnapshotHash: field(data, "corpusSnapshotHash"),
    answerHash: field(data, "answerHash"),
    claims: field(data, "claims"),
    retrievedChunks: field(data, "retrievedChunks"),
    ledgerEntryId: field(ledgerEntry, "id"),
  };
}

function cookiePair(value: string | null): string | null {
  return value?.split(";")[0] ?? null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: JsonObject, key: string): unknown {
  return value[key];
}

function objectField(value: unknown, key: string): JsonObject | null {
  if (!isObject(value)) {
    return null;
  }
  const fieldValue = value[key];
  return isObject(fieldValue) ? fieldValue : null;
}

function headersRecord(headers: RequestInit["headers"]): Record<string, string> {
  if (headers === undefined) {
    return {};
  }
  return Object.fromEntries(new Headers(headers).entries());
}
