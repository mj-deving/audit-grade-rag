const forbiddenKeyPattern =
  /(^query$|query.*text|chunk.*text|answer.*text|prompt.*text|provider.*key|db.*credential|password|secret|pii)/iu;

export function redactOperationalMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (forbiddenKeyPattern.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = redactValue(value);
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

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map((item): unknown => (isRecord(item) ? redactOperationalMeta(item) : item));
  }
  if (isRecord(value)) {
    return redactOperationalMeta(value);
  }
  return value;
}
