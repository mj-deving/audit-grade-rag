const liveProviderFlag = "RUN_LIVE_TESTS";

export type LiveProviderCategory =
  | "claude-cli"
  | "bge-m3"
  | "pgvector"
  | "typst"
  | "webauthn"
  | "hono-ssr";

export function liveProviderEnabled(): boolean {
  return process.env[liveProviderFlag] === "1";
}

export function disabledLiveProvider(category: LiveProviderCategory): {
  category: LiveProviderCategory;
  live: false;
  reason: string;
} {
  return {
    category,
    live: false,
    reason: `${liveProviderFlag} is not 1; live provider call intentionally not attempted`,
  };
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === "" ? undefined : value;
}

export function optionalBearerHeaders(token: string | undefined): Record<string, string> {
  if (token === undefined || token.length === 0) {
    return {};
  }

  return { Authorization: `Bearer ${token}` };
}
