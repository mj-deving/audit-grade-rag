import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  type AuditGradeRagClient,
  type AuditGradeRagClientConfig,
  createAuditGradeRagClient,
} from "./client.js";

interface ToolTextResult extends Record<string, unknown> {
  content: Array<{ type: "text"; text: string }>;
}

function asJsonToolResult(value: unknown): ToolTextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function createAuditGradeRagMcpServer(config: AuditGradeRagClientConfig): McpServer {
  return createServerFromClient(createAuditGradeRagClient(config));
}

export function createServerFromClient(client: AuditGradeRagClient): McpServer {
  const server = new McpServer({ name: "audit-grade-rag", version: "0.1.0" });

  server.registerTool(
    "health",
    {
      title: "Health",
      description: "Check the audit-grade-rag runtime health endpoint.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => asJsonToolResult(await client.health()),
  );

  server.registerTool(
    "rag_query",
    {
      title: "RAG Query",
      description:
        "Run an authenticated RAG query and return answer, citations, retrieval, and ledger ids.",
      inputSchema: {
        query: z.string().min(1).describe("Question to answer from the configured corpus."),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ query }) => asJsonToolResult(await client.ragQuery(query)),
  );

  server.registerTool(
    "audit_verify",
    {
      title: "Audit Verify",
      description: "Verify the configured signed SQLite audit ledger.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => asJsonToolResult(await client.auditVerify()),
  );

  server.registerTool(
    "replay",
    {
      title: "Replay",
      description:
        "Replay one audited answer by ledger entry id and return the named replay status.",
      inputSchema: {
        entryId: z.string().min(1).describe("Ledger entry id to replay."),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ entryId }) => asJsonToolResult(await client.replay(entryId)),
  );

  return server;
}

function envConfig(): AuditGradeRagClientConfig {
  const ledgerPath = envValue("AGR_LEDGER_PATH");
  return {
    baseUrl: envValue("AGR_BASE_URL") ?? "",
    operatorEmail: envValue("AGR_OPERATOR_EMAIL") ?? "",
    ...(ledgerPath === undefined ? {} : { ledgerPath }),
  };
}

function envValue(name: string): string | undefined {
  return process.env[name];
}

export async function runStdioServer(): Promise<void> {
  const server = createAuditGradeRagMcpServer(envConfig());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("audit-grade-rag MCP server running on stdio\n");
}

if (import.meta.main) {
  runStdioServer().catch((error: unknown) => {
    process.stderr.write(
      `audit-grade-rag MCP fatal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
