import { redactOperationalMeta } from "../modules/security/redaction.js";

type Level = "trace" | "debug" | "info" | "warn" | "error";
type EnvWithLogLevel = { readonly LOG_LEVEL?: string };
type RedactedOperationalMeta = Record<string, unknown> & {
  readonly user_id_hash?: unknown;
  readonly userIdHash?: unknown;
  readonly query_id?: unknown;
  readonly queryId?: unknown;
  readonly latency_ms?: unknown;
  readonly latencyMs?: unknown;
  readonly outcome?: unknown;
};
type InfoLogMeta = {
  user_id_hash?: unknown;
  query_id?: unknown;
  latency_ms?: unknown;
  outcome?: unknown;
};

const order: Record<Level, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };

export const logger = {
  log(level: Level, msg: string, meta: Record<string, unknown> = {}): void {
    if (order[level] < order[currentThreshold()]) {
      return;
    }

    const safeMeta = level === "info" ? operationalInfoMeta(meta) : redactOperationalMeta(meta);
    const entry = { ts: new Date().toISOString(), level, msg, ...safeMeta };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  },
  trace(msg: string, meta?: Record<string, unknown>): void {
    this.log("trace", msg, meta);
  },
  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log("debug", msg, meta);
  },
  info(msg: string, meta?: Record<string, unknown>): void {
    this.log("info", msg, meta);
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log("warn", msg, meta);
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    this.log("error", msg, meta);
  },
};

function currentThreshold(): Level {
  const level = (process.env as EnvWithLogLevel).LOG_LEVEL;
  return isLevel(level) ? level : "info";
}

function isLevel(value: string | undefined): value is Level {
  return (
    value === "trace" ||
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  );
}

function operationalInfoMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactOperationalMeta(meta) as RedactedOperationalMeta;
  const userIdHash = firstPresent(redacted.user_id_hash, redacted.userIdHash);
  const queryId = firstPresent(redacted.query_id, redacted.queryId);
  const latencyMs = firstPresent(redacted.latency_ms, redacted.latencyMs);
  const output: InfoLogMeta = {};
  if (userIdHash !== undefined) {
    output.user_id_hash = userIdHash;
  }
  if (queryId !== undefined) {
    output.query_id = queryId;
  }
  if (latencyMs !== undefined) {
    output.latency_ms = latencyMs;
  }
  if (redacted.outcome !== undefined) {
    output.outcome = redacted.outcome;
  }
  return output;
}

function firstPresent(...values: readonly unknown[]): unknown {
  return values.find((value) => value !== undefined);
}
