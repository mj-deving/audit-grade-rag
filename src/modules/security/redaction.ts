const forbiddenKeyPattern =
  /(query|chunk|answer).*text|provider.*key|db.*credential|password|secret/iu;

export function redactOperationalMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (forbiddenKeyPattern.test(key)) {
      output[key] = "[redacted]";
    } else if (isRecord(value)) {
      output[key] = redactOperationalMeta(value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function assertNoPromptSecrets(prompt: string): void {
  if (/sk-[A-Za-z0-9]|postgres:\/\/|DATABASE_URL|ANTHROPIC_API_KEY|OPENAI_API_KEY/u.test(prompt)) {
    throw new Error("Prompt contains deployment secret material");
  }
}

export function isEgressAllowed(host: string, allowlist: readonly string[]): boolean {
  return allowlist.includes(host);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
