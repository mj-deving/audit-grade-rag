import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { disabledLiveProvider, liveProviderEnabled } from "./live-provider.js";

describe("Typst L4 provider contract", () => {
  it("compiles a deterministic PDF when live provider tests are enabled", () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("typst")).toMatchObject({
        category: "typst",
        live: false,
      });
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), "agr-typst-"));
    const source = join(dir, "disclosure.typ");
    const output = join(dir, "disclosure.pdf");
    writeFileSync(
      source,
      '#set document(title: "Audit-Grade RAG")\n= Disclosure\nProvider: Typst\n',
    );
    const result = spawnSync("typst", ["compile", source, output, "--creation-timestamp", "0"], {
      encoding: "utf8",
    });

    if (result.status !== 0) {
      throw new Error(
        `Typst live compile failed: ${result.stderr || result.error?.message || "unknown"}`,
      );
    }

    const pdfHeader = readFileSync(output).subarray(0, 4).toString("utf8");
    expect(pdfHeader).toBe("%PDF");
  });
});
