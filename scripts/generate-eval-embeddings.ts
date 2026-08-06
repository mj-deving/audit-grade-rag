/**
 * Generate the committed BGE-M3 embedding cache the eval's dense pass reads (H-11 Option A).
 *
 * The eval corpus and golden set are fixed, so their embeddings are computed once here, at author
 * time, against a real bge-m3 endpoint, and committed keyed by sha256 of each text. The eval then
 * runs offline, deterministic and SEMANTIC — the same modality production retrieves with — without a
 * live endpoint. Re-run this only when the corpus or golden set changes; a text whose bytes changed
 * is a cache miss the loader throws on, never a silent lexical fallback.
 *
 * Requires BGE_M3_EMBEDDING_ENDPOINT (OpenAI-compatible /v1/embeddings) and optionally BGE_M3_API_KEY.
 * The endpoint is reached either through an SSH tunnel to a VPS TEI container or a local TEI
 * container — see docs/bge-m3-live-provider.md. This script does not open the tunnel; it embeds
 * against whatever the endpoint variable points at.
 *
 * Usage: BGE_M3_EMBEDDING_ENDPOINT=http://127.0.0.1:18080/v1/embeddings pnpm eval:embeddings
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "../src/lib/canonical-json.js";
import { sha256Hex } from "../src/lib/hash.js";
import { defaultEmbeddingCachePath } from "../src/modules/eval/embedding-cache.js";
import {
  defaultCorpusFixtureDir,
  defaultGoldenSetPath,
  loadFixtureCorpus,
  loadGoldenSet,
} from "../src/modules/eval/eval.js";
import { requireConfiguredEmbeddingProvider } from "../src/modules/ingest/embedding.js";

async function main(): Promise<void> {
  const provider = requireConfiguredEmbeddingProvider();
  const chunks = await loadFixtureCorpus(defaultCorpusFixtureDir);
  const cases = await loadGoldenSet(defaultGoldenSetPath);

  // Every distinct text the dense pass will ever look up: each chunk's text and each golden question.
  const texts = [
    ...new Set([...chunks.map((chunk) => chunk.chunkText), ...cases.map((c) => c.question)]),
  ];

  const vectors: Record<string, readonly number[]> = {};
  for (const text of texts) {
    const vector = await provider.embed(text);
    vectors[sha256Hex(text)] = [...vector];
    process.stderr.write(
      `embedded ${sha256Hex(text).slice(0, 12)} (dim ${String(vector.length)})\n`,
    );
  }

  const file = {
    provenance: {
      embeddingModelVersion: provider.profile.modelVersion,
      endpointConfigHash: provider.profile.configHash,
      dimension: provider.profile.dimension,
      generatedAt: new Date().toISOString(),
      textCount: texts.length,
    },
    vectors,
  };

  await mkdir(dirname(defaultEmbeddingCachePath), { recursive: true });
  await writeFile(defaultEmbeddingCachePath, `${canonicalJson(file)}\n`, "utf8");
  process.stderr.write(`wrote ${String(texts.length)} vectors to ${defaultEmbeddingCachePath}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
