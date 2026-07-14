import type { ProviderProfile } from "../../domain/types.js";
import { foldGerman } from "../../lib/german.js";
import { sha256Hex } from "../../lib/hash.js";
import type { LlmProvider, LlmRequest } from "./generation.js";

type Evidence = {
  readonly chunkId: string;
  readonly sentences: readonly string[];
};

type Candidate = {
  readonly chunkId: string;
  readonly sentence: string;
  readonly score: number;
  readonly chunkRank: number;
  readonly sentenceRank: number;
};

const maxClaims = 3;
const modelVersion = "deterministic-extractive@1.0.0";

/**
 * Answers strictly by lifting sentences out of the retrieved evidence and tagging each one with
 * the chunk it came from. The output is a pure function of the prompt, so a replay of a ledger
 * row regenerates the same bytes and `replayCapability` can honestly claim `bit_equal`. A cloud
 * LLM cannot make that claim, which is why the public demo runs on this provider and not on one.
 */
export class EvidenceExtractProvider implements LlmProvider {
  readonly profile: ProviderProfile = {
    id: "deterministic-extractive",
    name: "Deterministic Extractive Answerer",
    modelVersion,
    replayCapability: "bit_equal",
    supportsSeed: true,
    configHash: sha256Hex(modelVersion),
  };

  generate(request: LlmRequest): string {
    const evidence = parseEvidence(request.prompt);
    if (evidence.length === 0) {
      return "CLAIM: Keine ausreichende Evidenz im Korpus.";
    }
    const claims = selectClaims(queryTerms(request.prompt), evidence);
    return claims
      .map((candidate) => `CLAIM: ${candidate.sentence} [chunk:${candidate.chunkId}]`)
      .join("\n");
  }
}

function parseEvidence(prompt: string): readonly Evidence[] {
  const block = prompt.split("\nEvidenz:\n")[1];
  if (block === undefined) {
    return [];
  }
  const parts = block.split(/\[chunk:([A-Za-z0-9_-]+)\]/u);
  const evidence: Evidence[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    const chunkId = parts[index];
    const text = parts[index + 1];
    if (chunkId !== undefined && text !== undefined) {
      const sentences = splitSentences(text);
      if (sentences.length > 0) {
        evidence.push({ chunkId, sentences });
      }
    }
  }
  return evidence;
}

function splitSentences(text: string): readonly string[] {
  return text
    .replace(/\s+/gu, " ")
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function queryTerms(prompt: string): readonly string[] {
  const question = prompt.split("\nFrage:\n")[1]?.split("\n\n")[0] ?? "";
  return terms(question);
}

function selectClaims(
  query: readonly string[],
  evidence: readonly Evidence[],
): readonly Candidate[] {
  const scored = candidates(query, evidence)
    .filter((candidate) => candidate.score > 0)
    .sort(compareCandidates)
    .slice(0, maxClaims);
  return scored.length > 0 ? scored : fallbackClaim(evidence);
}

function candidates(query: readonly string[], evidence: readonly Evidence[]): readonly Candidate[] {
  return evidence.flatMap((chunk, chunkRank) =>
    chunk.sentences.map((sentence, sentenceRank) => ({
      chunkId: chunk.chunkId,
      sentence,
      score: overlap(query, terms(sentence)),
      chunkRank,
      sentenceRank,
    })),
  );
}

/**
 * Ties break on the retrieval order, never on iteration order, so the selection is stable across
 * processes. Determinism here is what the replay guarantee rests on.
 */
function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.chunkRank !== right.chunkRank) {
    return left.chunkRank - right.chunkRank;
  }
  return left.sentenceRank - right.sentenceRank;
}

function fallbackClaim(evidence: readonly Evidence[]): readonly Candidate[] {
  const first = evidence[0];
  const sentence = first?.sentences[0];
  if (first === undefined || sentence === undefined) {
    return [];
  }
  return [{ chunkId: first.chunkId, sentence, score: 0, chunkRank: 0, sentenceRank: 0 }];
}

function overlap(query: readonly string[], sentence: readonly string[]): number {
  if (query.length === 0 || sentence.length === 0) {
    return 0;
  }
  const words = new Set(sentence);
  const hits = query.filter((term) => words.has(term)).length;
  return Number((hits / query.length).toFixed(6));
}

function terms(text: string): readonly string[] {
  return foldGerman(text.toLowerCase())
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/u)
    .filter((term) => term.length > 1);
}
