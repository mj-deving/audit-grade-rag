import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServerFromClient } from "./server.js";

const calls: string[] = [];
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = createServerFromClient({
  health: () => {
    calls.push("health");
    return Promise.resolve({ ok: true, data: { storage: "postgres" } });
  },
  ragQuery: (query) => {
    calls.push(`rag_query:${query}`);
    return Promise.resolve({
      outcome: "answered",
      answer: "CLAIM: Belegt. [chunk:demo]",
      queryId: "query_demo",
      corpusSnapshotId: "snap_demo",
      corpusSnapshotHash: "hash_demo",
      answerHash: "answer_hash_demo",
      claims: [{ id: "claim_demo", citations: [{ chunkId: "chunk_demo" }] }],
      retrievedChunks: [{ chunkId: "chunk_demo", sourceType: "markdown" }],
      ledgerEntryId: "ledger_demo",
    });
  },
  auditVerify: () => {
    calls.push("audit_verify");
    return Promise.resolve({ ok: true, checkedRows: 3 });
  },
  replay: (entryId) => {
    calls.push(`replay:${entryId}`);
    return Promise.resolve({ status: "passed", byteEqual: true, originalLedgerEntryId: entryId });
  },
});
const client = new Client({ name: "audit-grade-rag-smoke", version: "0.1.0" });

try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  const expected = ["audit_verify", "health", "rag_query", "replay"];
  if (JSON.stringify(toolNames) !== JSON.stringify(expected)) {
    throw new Error(`unexpected tools: ${toolNames.join(", ")}`);
  }

  await client.callTool({ name: "health", arguments: {} });
  await client.callTool({
    name: "rag_query",
    arguments: { query: "Welche Auditpflicht ist belegt?" },
  });
  await client.callTool({ name: "audit_verify", arguments: {} });
  await client.callTool({ name: "replay", arguments: { entryId: "ledger_demo" } });

  process.stdout.write(JSON.stringify({ ok: true, tools: toolNames, calls: calls.length }));
  process.stdout.write("\n");
} finally {
  await client.close();
  await server.close();
}
