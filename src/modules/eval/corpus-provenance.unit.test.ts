import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../lib/hash.js";
import { defaultCorpusFixtureDir } from "./eval.js";

// The corpus is what every citation, every signed ledger entry and every replay ultimately points
// at. On 2026-07-16 four of six Article 50 chunks turned out to be paraphrase while the fixture
// header and the public demo both claimed to serve the regulation's German text: the scope of one
// exception had been widened from a single duty to all transparency duties, and a counter-exception
// that re-imposes the duty had been dropped entirely. The cryptography was faithful the whole time;
// it was attesting to text that was not the law. These tests are the standing gate that would have
// caught it, and they are why a chunk may only ever be cut from a committed source snapshot.

const sourcesDir = join(defaultCorpusFixtureDir, "_sources");
const chunkMarker = /<!--\s*chunk:([A-Za-z0-9_-]+)\s*-->/u;

type Provenance = {
  readonly retrievalUrl: string;
  readonly retrievedAt: string;
  readonly sha256: string;
};

function normalize(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function chunksOf(markdown: string): ReadonlyMap<string, string> {
  const parts = markdown.split(new RegExp(chunkMarker.source, "gu"));
  const chunks = new Map<string, string>();
  for (let index = 1; index < parts.length; index += 2) {
    const id = parts[index];
    const text = parts[index + 1];
    if (id !== undefined && text !== undefined) {
      chunks.set(id, text);
    }
  }
  return chunks;
}

async function fixtureFiles(): Promise<readonly string[]> {
  const entries = await readdir(defaultCorpusFixtureDir);
  const markdown = entries.filter((entry) => entry.endsWith(".md"));
  const withChunks = await Promise.all(
    markdown.map(async (entry) => {
      const path = join(defaultCorpusFixtureDir, entry);
      return chunkMarker.test(await readFile(path, "utf8")) ? path : null;
    }),
  );
  return withChunks.filter((path): path is string => path !== null);
}

describe("corpus provenance", () => {
  it("finds at least one chunked fixture", async () => {
    // Without this, every test below would pass vacuously on an empty corpus directory — the
    // failure mode where a green gate means "nothing was checked".
    expect((await fixtureFiles()).length).toBeGreaterThan(0);
  });

  it("pins every fixture to a source snapshot whose hash still matches its provenance", async () => {
    for (const path of await fixtureFiles()) {
      const slug = basename(path, ".md");
      const snapshot = await readFile(join(sourcesDir, `${slug}.source.txt`), "utf8");
      const provenance = JSON.parse(
        await readFile(join(sourcesDir, `${slug}.provenance.json`), "utf8"),
      ) as Provenance;
      expect(provenance.retrievalUrl, `${slug}: retrievalUrl`).toMatch(/^https:\/\//u);
      expect(provenance.retrievedAt, `${slug}: retrievedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      // An edited snapshot is exactly how a paraphrase would re-enter: the chunks would still be
      // substrings of it, so the substring test alone is not enough. The hash pins the snapshot to
      // what the fetch script actually retrieved.
      expect(sha256Hex(snapshot), `${slug}: snapshot hash vs provenance`).toBe(provenance.sha256);
    }
  });

  it("accounts for the whole source, in order, with nothing dropped", async () => {
    // Substring-checking each chunk proves nothing was invented. It does NOT prove nothing was
    // omitted — and omission is the shape the original defect actually took: an exception was kept
    // while the counter-exception that re-imposes the duty ("es sei denn, diese Systeme stehen der
    // Öffentlichkeit zur Anzeige einer Straftat zur Verfügung") was dropped. Verbatim text minus a
    // clause is still a misrepresentation of the law, and it would sail through the substring test.
    //
    // So the chunks must reconstruct the snapshot exactly: concatenated in file order they equal
    // the source, less the "(N)" paragraph markers that chunk boundaries replace. That makes the
    // corpus the source rather than a selection from it.
    for (const path of await fixtureFiles()) {
      const slug = basename(path, ".md");
      const snapshot = normalize(await readFile(join(sourcesDir, `${slug}.source.txt`), "utf8"));
      const withoutParagraphMarkers = normalize(snapshot.replace(/\(\d+\)\s*/gu, " "));
      const rejoined = [...chunksOf(await readFile(path, "utf8")).values()]
        .map(normalize)
        .join(" ");
      expect(rejoined, `${slug}: chunks do not reconstruct the source`).toBe(
        withoutParagraphMarkers,
      );
    }
  });

  it("cuts every chunk verbatim from its source snapshot", async () => {
    for (const path of await fixtureFiles()) {
      const slug = basename(path, ".md");
      const snapshot = normalize(await readFile(join(sourcesDir, `${slug}.source.txt`), "utf8"));
      const chunks = chunksOf(await readFile(path, "utf8"));
      expect(chunks.size, `${slug}: chunk count`).toBeGreaterThan(0);
      for (const [id, text] of chunks) {
        const chunkText = normalize(text);
        expect(chunkText.length, `${slug}/${id}: empty chunk`).toBeGreaterThan(0);
        // Only line wrapping separates the fixture from the snapshot, so the comparison normalizes
        // whitespace and nothing else. Any word-level edit fails here.
        expect(snapshot.includes(chunkText), `${slug}/${id}: not verbatim in source`).toBe(true);
      }
    }
  });
});
