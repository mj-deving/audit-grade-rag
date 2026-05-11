import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { disabledLiveProvider, liveProviderEnabled } from "./live-provider.js";

const requireFromHere = createRequire(import.meta.url);

describe("Next.js L4 provider contract", () => {
  it("resolves a Next.js 15 runtime when live provider tests are enabled", () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("next.js")).toMatchObject({
        category: "next.js",
        live: false,
      });
      return;
    }

    const packageJsonPath = resolveNextPackageJson();
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
    const nextRuntime: unknown = requireFromHere("next");

    expect(readMajorVersion(packageJson)).toBe(15);
    expect(nextRuntime).toBeDefined();
  });
});

function resolveNextPackageJson(): string {
  try {
    return requireFromHere.resolve("next/package.json");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Next.js live provider package is unavailable: ${message}`);
  }
}

function readMajorVersion(packageJson: unknown): number {
  if (!hasVersion(packageJson)) {
    throw new Error("Next.js package metadata does not expose a string version");
  }

  const major = Number(packageJson.version.split(".")[0]);
  if (!Number.isInteger(major)) {
    throw new Error(`Next.js package version is not parseable: ${packageJson.version}`);
  }

  return major;
}

function hasVersion(value: unknown): value is { version: string } {
  const candidate = value as { version?: unknown };
  return isRecord(value) && typeof candidate.version === "string";
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
