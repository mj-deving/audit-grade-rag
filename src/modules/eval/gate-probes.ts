import { readFile } from "node:fs/promises";

/**
 * The probe set H-11's evidence gate is measured against.
 *
 * Deliberately NOT the golden set. The golden set is the product's pass/fail eval and its cases are
 * written to be answerable; this set exists to measure whether the GATE can tell an answerable
 * question from an unanswerable one when the answerable ones are phrased the way a competent German
 * reader phrases them. It therefore carries cases the current gate gets WRONG, on purpose, and the
 * test that reads it asserts the wrong answers as measurements rather than fixing them. Promoting a
 * probe into the golden set would make the eval red; the probes are the record of why.
 *
 * `class` is ground truth stated by a reader of Article 50, not by the retriever:
 * - `in-corpus`: Article 50 answers this question. A gate that refuses it is wrong.
 * - `out-of-corpus`: Article 50 does not answer it. A gate that answers it is wrong.
 */
export type GateProbe = {
  readonly id: string;
  readonly class: "in-corpus" | "out-of-corpus";
  readonly question: string;
  readonly note: string;
};

const defaultGateProbePath = "eval/probes/gate-separation-v1.jsonl";

export async function loadGateProbes(
  path: string = defaultGateProbePath,
): Promise<readonly GateProbe[]> {
  return parseGateProbes(await readFile(path, "utf8"));
}

function parseGateProbes(content: string): readonly GateProbe[] {
  const lines = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("Gate probe set is empty");
  }
  const probes = lines.map((line, index) => parseProbeLine(line, index + 1));
  const ids = new Set<string>();
  for (const probe of probes) {
    if (ids.has(probe.id)) {
      throw new Error(`Duplicate probe ID: ${probe.id}`);
    }
    ids.add(probe.id);
  }
  return probes;
}

function parseProbeLine(line: string, lineNumber: number): GateProbe {
  const value = JSON.parse(line) as Partial<GateProbe>;
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`Missing probe ID at line ${String(lineNumber)}`);
  }
  if (typeof value.question !== "string" || value.question.length === 0) {
    throw new Error(`Missing question at line ${String(lineNumber)}`);
  }
  if (value.class !== "in-corpus" && value.class !== "out-of-corpus") {
    throw new Error(`Missing or invalid class at line ${String(lineNumber)}`);
  }
  if (typeof value.note !== "string" || value.note.length === 0) {
    throw new Error(`Missing note at line ${String(lineNumber)}`);
  }
  return { id: value.id, class: value.class, question: value.question, note: value.note };
}
