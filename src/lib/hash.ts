import { createHash } from "node:crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function shortHash(input: string): string {
  return input.slice(0, 12);
}

export function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}_${sha256Hex(parts.join("\0")).slice(0, 24)}`;
}
