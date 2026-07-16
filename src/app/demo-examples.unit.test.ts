import { describe, expect, it } from "vitest";
import { createDemoApp } from "./demo-app.js";

// The demo's example chips are the first thing a visitor clicks, so a chip that refuses reads as a
// broken demo rather than as an honest "no evidence". Retrieval on this surface is lexical with no
// stemming, which makes "worded to match the corpus" a functional constraint on these strings, not
// a style note — and one that is easy to break silently, because nothing about the string looks
// wrong.
//
// It had already broken: "Welche Ausnahme gilt für die Strafverfolgung?" shares no word with a
// corpus that says "Diese Pflicht gilt nicht" and "Verfolgung von Straftaten". It appeared to work
// only because the pre-IDF scorer answered on stopword overlap. Once scoring followed the evidence,
// it scored 0.196 — level with the CRR question that is deliberately out of corpus.

describe("demo example questions", () => {
  it("answers every example except the deliberate out-of-corpus one, with a citation", async () => {
    const app = await createDemoApp({ ledgerPath: ":memory:" });
    const examples = app.examples;
    expect(examples.length).toBeGreaterThan(1);

    const outOfCorpus = examples.at(-1);
    expect(outOfCorpus, "the last example is the refusal showcase").toBeDefined();

    for (const question of examples.slice(0, -1)) {
      const { outcome } = app.ask(question);
      expect(outcome.outcome, `chip must be answerable: ${question}`).toBe("answered");
      expect(
        outcome.claims.length > 0 && outcome.claims.every((claim) => claim.citations.length > 0),
        `every claim must cite: ${question}`,
      ).toBe(true);
    }
  });

  it("keeps the last example refused, so the demo can show a refusal", async () => {
    // The counterweight: without this, wording every chip until it answers would pass the test
    // above and quietly delete the demo's whole point.
    const app = await createDemoApp({ ledgerPath: ":memory:" });
    const outOfCorpus = app.examples.at(-1) ?? "";
    expect(app.ask(outOfCorpus).outcome.outcome).toBe("refused-out-of-corpus");
  });
});
