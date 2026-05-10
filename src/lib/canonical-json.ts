export type JsonPrimitive = string | number | boolean | null;
export type JsonRecord = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonRecord;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(toJsonValue(value));
}

export function toJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON rejects non-finite numbers");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === "object") {
    return objectToJson(value as Record<string, unknown>);
  }

  throw new Error(`Canonical JSON rejects ${typeof value}`);
}

function objectToJson(value: Record<string, unknown>): JsonRecord {
  const output: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    const field = value[key];
    if (field === undefined) {
      throw new Error(`Canonical JSON rejects undefined at ${key}`);
    }
    output[key] = toJsonValue(field);
  }
  return output;
}
