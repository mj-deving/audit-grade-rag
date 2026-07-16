# Corpus Fixtures

The corpus used by `pnpm eval` and by the public demo. Every chunk here is cited to a reader as
regulation text and attested by the signed ledger, so the rule is narrow: **a chunk may only ever be
a verbatim substring of a committed source snapshot.**

## Layout

| Path | What it is |
|---|---|
| `<slug>.md` | The chunked fixture. Chunks are marked with `<!-- chunk:<id> -->`. |
| `_sources/<slug>.source.txt` | The source snapshot the chunks are cut from. Not edited by hand. |
| `_sources/<slug>.provenance.json` | Retrieval URL, retrieval date, and the SHA-256 of the snapshot. |

## Provenance

Snapshots are produced by `scripts/fetch-corpus-source.ts`, which records the exact URL and date it
retrieved and hashes the bytes it wrote. Re-derive and compare:

```bash
pnpm exec tsx scripts/fetch-corpus-source.ts --article 50 --slug eu-ai-act-art50-de
sha256sum corpus-fixtures/_sources/eu-ai-act-art50-de.source.txt
```

The snapshot is a **mirror's rendering, not the Official Journal**. EUR-Lex answers HTTP 202 to
non-browser clients, so it cannot be fetched reproducibly from a script, and two reputable mirrors
were found to differ in wording. The provenance record therefore names what was actually retrieved
and when, rather than claiming to be the OJ text. Source text is Regulation (EU) 2024/1689, German,
reusable under Decision 2011/833/EU with attribution.

## The gate

`src/modules/eval/corpus-provenance.unit.test.ts` asserts, for every chunked fixture, that the
snapshot still hashes to its provenance record and that every chunk is a verbatim substring of it
(whitespace-normalized, because the fixture wraps lines and the snapshot does not).

## Why the rule is this narrow

On 2026-07-16 four of six Article 50 chunks turned out to be paraphrase while this README and the
demo console both claimed to serve the regulation's German text. One chunk had widened the scope of
an exception from a single duty to all transparency duties and dropped a counter-exception
outright. The ledger signed those citations faithfully the whole time; it was attesting to text that
was not the law.

The paraphrase also masked a retrieval defect: its chunks were short enough that an out-of-corpus
question stayed under the refusal threshold on stopword overlap alone. Restoring the verbatim text
pushed it over and exposed the real bug (see `docs/eval-harness.md`).
