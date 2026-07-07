import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAuditGradeRagMcpServer } from "./server.js";

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const ledgerPath = envValue("AGR_LEDGER_PATH");
const server = createAuditGradeRagMcpServer({
  baseUrl: envValue("AGR_BASE_URL") ?? "",
  operatorEmail: envValue("AGR_OPERATOR_EMAIL") ?? "",
  ...(ledgerPath === undefined ? {} : { ledgerPath }),
});
const client = new Client({ name: "audit-grade-rag-live-smoke", version: "0.1.0" });

try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const health = await callJsonTool("health", {});
  const query = await callJsonTool("rag_query", {
    query: "EU AI Act Artikel 50 Transparenzpflicht",
  });
  const ledgerEntryId = stringField(query, "ledgerEntryId");
  const verification = await callJsonTool("audit_verify", {});
  const replay = await callJsonTool("replay", { entryId: ledgerEntryId });

  process.stdout.write(
    JSON.stringify({
      ok: true,
      health: pick(health, ["ok", "data"]),
      query: pick(query, ["outcome", "queryId", "ledgerEntryId", "answerHash"]),
      auditVerify: verification,
      replay: pick(replay, ["status", "byteEqual", "originalLedgerEntryId", "ledgerEntryId"]),
    }),
  );
  process.stdout.write("\n");
} finally {
  await client.close();
  await server.close();
}

async function callJsonTool(
  name: string,
  toolArguments: Record<string, unknown>,
): Promise<JsonMap> {
  const result = await client.callTool({ name, arguments: toolArguments });
  const content: unknown = result.content;
  if (!Array.isArray(content)) {
    throw new Error(`tool ${name} returned non-array content`);
  }
  const first: unknown = content[0];
  if (!isTextContent(first)) {
    throw new Error(`tool ${name} returned non-text content`);
  }
  const parsed = JSON.parse(first.text) as unknown;
  if (!isObject(parsed)) {
    throw new Error(`tool ${name} returned non-object JSON`);
  }
  return parsed;
}

type JsonMap = Record<string, unknown>;

function stringField(value: JsonMap, field: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || fieldValue.length === 0) {
    throw new Error(`expected string field ${field}`);
  }
  return fieldValue;
}

function pick(value: JsonMap, fields: readonly string[]): JsonMap {
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function isObject(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextContent(value: unknown): value is { type: "text"; text: string } {
  if (!isObject(value)) {
    return false;
  }
  const candidate = value as Partial<{ type: unknown; text: unknown }>;
  return candidate.type === "text" && typeof candidate.text === "string";
}

function envValue(name: string): string | undefined {
  return process.env[name];
}
