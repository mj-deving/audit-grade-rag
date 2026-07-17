import { describe, expect, it } from "vitest";
import { createDemoApp } from "../../app/demo-app.js";
import { sha256Hex } from "../../lib/hash.js";
import {
  computeFixtureCorpusSnapshotHash,
  defaultCorpusFixtureDir,
  loadFixtureCorpus,
  pinnedEvalTuple,
} from "./eval.js";

// H-12: the signed ledger must attest the CORPUS, not its name. Until 2026-07-17 the fixture path
// wrote `corpusSnapshotHash = sha256("corpus-fixtures:v1")` — a hash of the label's own spelling —
// into every fixture chunk, every eval outcome and every Ed25519-signed demo ledger row. A third
// party holding a signed row could not re-derive it from the corpus, which is the exact failure
// this product is a rebuttal to. These are the standing probes that a corpus byte moves the hash.

describe("the fixture corpus snapshot hash is derived from the corpus, not its label", () => {
  it("is deterministic across calls", async () => {
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    expect(computeFixtureCorpusSnapshotHash(chunks)).toBe(computeFixtureCorpusSnapshotHash(chunks));
  });

  it("is not the hash of the snapshot label", async () => {
    // The whole defect in one assertion: the ledger used to sign these two values.
    const hash = computeFixtureCorpusSnapshotHash(await loadFixtureCorpus(defaultCorpusFixtureDir));
    expect(hash).not.toBe(sha256Hex("corpus-fixtures:v1"));
    expect(hash).not.toBe(sha256Hex(pinnedEvalTuple.corpusSnapshotId));
  });

  it("moves when a single corpus byte changes", async () => {
    // The falsifier. A real content edit to one chunk changes its chunkSha256; the corpus hash must
    // follow. If it does not, the ledger is attesting something other than the corpus it serves.
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const before = computeFixtureCorpusSnapshotHash(chunks);
    const first = chunks[0];
    expect(first, "corpus is non-empty").toBeDefined();
    if (first === undefined) {
      return;
    }
    const editedText = `${first.chunkText}x`;
    const mutated = chunks.map((chunk, index) =>
      index === 0 ? { ...chunk, chunkText: editedText, chunkSha256: sha256Hex(editedText) } : chunk,
    );
    expect(computeFixtureCorpusSnapshotHash(mutated)).not.toBe(before);
  });

  it("moves when a chunk id is renamed, even if the text is untouched", async () => {
    // Re-chunking and id renames are corpus changes the source bytes alone would not show. The
    // manifest carries chunk ids so a structural change to the corpus is also attested.
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const before = computeFixtureCorpusSnapshotHash(chunks);
    const renamed = chunks.map((chunk, index) =>
      index === 0 ? { ...chunk, chunkId: `${chunk.chunkId}-renamed` } : chunk,
    );
    expect(computeFixtureCorpusSnapshotHash(renamed)).not.toBe(before);
  });

  it("stamps every loaded fixture chunk with the derived hash", async () => {
    // loadFixtureCorpus computes the hash over all chunks once, then stamps each. So the field a
    // chunk carries downstream into the ledger equals the recomputable corpus hash.
    const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
    const derived = computeFixtureCorpusSnapshotHash(chunks);
    expect(new Set(chunks.map((chunk) => chunk.corpusSnapshotHash))).toEqual(new Set([derived]));
  });

  it("signs the derived hash into the demo ledger row, not the label hash", async () => {
    // The end of the thread and the point of the item: what the Ed25519 chain actually signs. A
    // third party holding this row recomputes the hash from the corpus and it matches, instead of
    // matching sha256 of the string "corpus-fixtures:v1".
    const demo = await createDemoApp();
    const { entry } = demo.ask("Wie muessen synthetische Inhalte gekennzeichnet werden?");
    const derived = computeFixtureCorpusSnapshotHash(demo.chunks);
    expect(entry.corpusSnapshotHash).toBe(derived);
    expect(entry.corpusSnapshotHash).not.toBe(sha256Hex("corpus-fixtures:v1"));
  });
});
