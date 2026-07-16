import { Pool, type PoolConfig } from "pg";

// Fault-tolerance primitive (H-3): every Postgres connection and statement carries a
// timeout, so a dead or slow database fails fast instead of hanging the request. One
// home for the timeout policy; both app factories construct their pool through it.
const defaultPgTimeouts = {
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
  query_timeout: 15_000,
  idle_in_transaction_session_timeout: 15_000,
} as const;

export function createPgPool(databaseUrl?: string, overrides: PoolConfig = {}): Pool {
  return new Pool({
    ...(databaseUrl === undefined ? {} : { connectionString: databaseUrl }),
    ...defaultPgTimeouts,
    ...overrides,
  });
}
