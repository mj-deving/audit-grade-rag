import { describe, expect, it } from "vitest";
import type { RetrievedChunk } from "../../domain/types.js";
import { sha256Hex } from "../../lib/hash.js";
import { EvidenceExtractProvider } from "./extractive.js";
import { defaultPromptTemplate, parseCitedClaims, renderPrompt } from "./generation.js";

function chunk(chunkId: string, chunkText: string): RetrievedChunk {
  return {
    chunkId,
    docId: "doc_demo",
    sourceDocumentId: "src_demo",
    sourceType: "markdown",
    sourcePath: "corpus-fixtures/eu-ai-act-art50-de.md",
    pageStart: 1,
    pageEnd: 1,
    charStart: 0,
    charEnd: chunkText.length,
    tokenStart: 0,
    tokenEnd: chunkText.split(/\s+/u).length,
    chunkIndex: 0,
    chunkText,
    chunkSha256: sha256Hex(chunkText),
    corpusSnapshotId: "corpus-fixtures:v1",
    corpusSnapshotHash: sha256Hex("corpus-fixtures:v1"),
    extractionWarnings: [],
    ocrUsed: false,
    retrievalScore: 1,
    retrievalMethod: "rrf",
  };
}

const marking = chunk(
  "art50-marking",
  "Anbieter von KI-Systemen stellen sicher, dass die Ausgaben in einem\nmaschinenlesbaren Format gekennzeichnet sind.\nDie Kennzeichnung muss als kuenstlich erzeugt erkennbar sein.",
);
const interaction = chunk(
  "art50-interaction",
  "Anbieter stellen sicher, dass natuerliche Personen informiert werden, dass sie mit einem KI-System interagieren.",
);

function request(query: string, chunks: readonly RetrievedChunk[]) {
  return {
    prompt: renderPrompt(query, chunks, defaultPromptTemplate),
    modelVersion: "deterministic-extractive@1.0.0",
    promptVersion: defaultPromptTemplate.version,
    temperature: 0 as const,
    seed: 42,
  };
}

describe("EvidenceExtractProvider", () => {
  it("declares a bit-equal replay profile", () => {
    expect(new EvidenceExtractProvider().profile.replayCapability).toBe("bit_equal");
  });

  it("answers with sentences lifted verbatim from the chunk each claim cites", () => {
    const source = new Map(
      [marking, interaction].map((chunk) => [chunk.chunkId, chunk.chunkText.replace(/\s+/gu, " ")]),
    );
    const answer = new EvidenceExtractProvider().generate(
      request("Wie muessen Ausgaben gekennzeichnet werden?", [marking, interaction]),
    );
    expect(answer).toContain("maschinenlesbaren Format gekennzeichnet");
    expect(answer).toContain("[chunk:art50-marking]");
    for (const claim of parseCitedClaims(answer)) {
      expect(claim.citations.length).toBeGreaterThan(0);
      for (const citation of claim.citations) {
        expect(source.get(citation.chunkId)).toContain(claim.text);
      }
    }
  });

  it("cites only chunk ids that were present in the evidence block", () => {
    const answer = new EvidenceExtractProvider().generate(
      request("Kennzeichnung maschinenlesbar", [marking, interaction]),
    );
    const cited = parseCitedClaims(answer).flatMap((claim) =>
      claim.citations.map((citation) => citation.chunkId),
    );
    expect(cited.length).toBeGreaterThan(0);
    for (const chunkId of cited) {
      expect(["art50-marking", "art50-interaction"]).toContain(chunkId);
    }
  });

  it("is deterministic: the same prompt yields byte-identical output", () => {
    const provider = new EvidenceExtractProvider();
    const prompt = request("Welche Transparenzpflicht gilt bei Interaktion?", [
      interaction,
      marking,
    ]);
    expect(provider.generate(prompt)).toBe(new EvidenceExtractProvider().generate(prompt));
  });

  it("emits an uncited refusal when the evidence block is empty", () => {
    const answer = new EvidenceExtractProvider().generate(request("Frage ohne Evidenz", []));
    expect(parseCitedClaims(answer).every((claim) => claim.citations.length === 0)).toBe(true);
  });
});
