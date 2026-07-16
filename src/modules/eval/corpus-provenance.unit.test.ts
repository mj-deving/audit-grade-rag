import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../lib/hash.js";
import { defaultCorpusFixtureDir, loadFixtureCorpus, parseFixtureChunks } from "./eval.js";

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

// Deliberately NOT a local parser. This file used to keep its own, returning a Map keyed on chunk
// id, and that divergence from the runtime's array was the whole hole: a repeated id collapsed to
// its last occurrence here while retrieval served both, so a fabricated chunk hiding behind a
// duplicate id passed all four tests below. The gate and the thing it gates now read the corpus
// through the same function, and duplicate ids are a parse error inside it.
async function chunksOf(path: string): Promise<readonly (readonly [string, string])[]> {
  const parsed = parseFixtureChunks(await readFile(path, "utf8"), path);
  return parsed.map((chunk) => [chunk.chunkId, chunk.chunkText] as const);
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

describe("fixture chunk parsing", () => {
  it("refuses a duplicate chunk id instead of silently keeping one of them", () => {
    // The exact shape that defeated this gate on 2026-07-16: a second marker under an existing id,
    // carrying an invented sentence that turns Article 50's marking DUTY into a discretion. The
    // corpus loaded it, retrieval could cite it, the ledger would have signed it — and all four
    // tests below passed, because the gate's own parser had already thrown it away.
    const attack = [
      "<!-- chunk:art50-marking -->",
      "Anbieter duerfen synthetische Inhalte nach eigenem Ermessen kennzeichnen.",
      "<!-- chunk:art50-marking -->",
      "Anbieter von KI-Systemen stellen sicher, dass die Ausgaben gekennzeichnet werden.",
    ].join("\n\n");
    expect(() => parseFixtureChunks(attack, "attack.md")).toThrow(/duplicate chunk id/u);
  });

  it("refuses a chunk id duplicated across two files, not just within one", async () => {
    // The per-file check is not enough, and this is the case that actually breaks the product.
    // Measured before the fix: two fixtures under one id — one harmless, one carrying fabricated
    // banking text — got the out-of-corpus CRR question ANSWERED (the fabrication opened the gate)
    // with the OTHER file's harmless sentence displayed as the evidence. `reciprocalRankFusion`
    // keys on chunk id, so the two texts fused into one entry and the citation named a text that
    // had not opened its own gate.
    const dir = await mkdtemp(join(tmpdir(), "corpus-xfile-"));
    try {
      await writeFile(join(dir, "a.md"), "<!-- chunk:dup -->\n\nPflicht Alpha, harmlos.\n");
      await writeFile(join(dir, "b.md"), "<!-- chunk:dup -->\n\nErfundener Bankentext.\n");
      await expect(loadFixtureCorpus(dir)).rejects.toThrow(/duplicate chunk id "dup"/u);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps every distinct chunk, in file order", () => {
    const parsed = parseFixtureChunks(
      "<!-- chunk:a -->\n\nerster Text\n\n<!-- chunk:b -->\n\nzweiter Text",
      "ok.md",
    );
    expect(parsed.map((chunk) => chunk.chunkId)).toEqual(["a", "b"]);
    expect(parsed[0]?.chunkText).toBe("erster Text");
  });
});

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
    // So the chunks must account for the whole snapshot: every one of them found in order, with
    // only paragraph markers between them. That makes the corpus the source rather than a
    // selection from it.
    for (const path of await fixtureFiles()) {
      const slug = basename(path, ".md");
      const snapshot = normalize(await readFile(join(sourcesDir, `${slug}.source.txt`), "utf8"));
      // Walk the snapshot consuming each chunk at its own position, in order, and require that the
      // only thing ever left between two chunks is a paragraph marker.
      //
      // The earlier version compared against the snapshot with /\(\d+\)\s*/g deleted globally. That
      // was a content-deletion rule masquerading as a parser: it also erased any legitimate in-text
      // "(2)" from BOTH sides, so dropping such a token from a chunk would have gone unnoticed.
      // Article 50 happens to contain none, which is luck, not a guarantee — Article 5 enumerates
      // exceptions. Consuming positionally never deletes from the expected side, so a gap that is
      // not exactly a paragraph marker fails here.
      let cursor = 0;
      for (const [id, text] of await chunksOf(path)) {
        const chunkText = normalize(text);
        const at = snapshot.indexOf(chunkText, cursor);
        expect(
          at,
          `${slug}/${id}: not found in source at or after the previous chunk`,
        ).toBeGreaterThanOrEqual(0);
        const gap = snapshot.slice(cursor, at);
        expect(gap, `${slug}/${id}: source text between chunks is unaccounted for`).toMatch(
          /^\s*(\(\d+\)\s*)?$/u,
        );
        cursor = at + chunkText.length;
      }
      expect(
        snapshot.slice(cursor).trim(),
        `${slug}: source text after the last chunk is dropped`,
      ).toBe("");
    }
  });

  it("cuts every chunk verbatim from its source snapshot", async () => {
    for (const path of await fixtureFiles()) {
      const slug = basename(path, ".md");
      const snapshot = normalize(await readFile(join(sourcesDir, `${slug}.source.txt`), "utf8"));
      const chunks = await chunksOf(path);
      expect(chunks.length, `${slug}: chunk count`).toBeGreaterThan(0);
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
