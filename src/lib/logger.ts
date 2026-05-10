type Level = "trace" | "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
const env: { readonly LOG_LEVEL?: string } = process.env;
const threshold: Level = (env.LOG_LEVEL as Level | undefined) ?? "info";

export const logger = {
  log(level: Level, msg: string, meta: Record<string, unknown> = {}): void {
    if (order[level] < order[threshold]) {
      return;
    }

    const entry = { ts: new Date().toISOString(), level, msg, ...meta };
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
