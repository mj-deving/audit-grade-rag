import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Fetches the German text of one article of Regulation (EU) 2024/1689 and writes a source
// snapshot plus its provenance record. Corpus chunks are cut from that snapshot, and
// `corpus-provenance.unit.test.ts` asserts every chunk is a verbatim substring of it. That is what
// keeps a paraphrase out of the corpus: before this existed, four of six Article 50 chunks had
// drifted into summary while the fixture header still claimed to be the regulation.
//
// The snapshot is a mirror's rendering, not the Official Journal: EUR-Lex answers 202 to
// non-browser clients, so it cannot be fetched reproducibly from CI or a script. The provenance
// record therefore names the exact URL and retrieval date rather than claiming to be the OJ text.
// Not run in CI (network); the snapshot it produces is committed and the tests read that.
//
// Usage: tsx scripts/fetch-corpus-source.ts --article 50 --slug eu-ai-act-art50-de

const sourceBaseUrl = "https://gesetze.legal/eu/vo_eu_2024_1689";
const sourcesDir = "corpus-fixtures/_sources";
const extractorVersion = "fetch-corpus-source.ts@1";
// The mirror closes every article body with the EU's copyright line; the body opens at its first
// numbered paragraph. Both markers are asserted rather than assumed — a layout change must fail
// loudly instead of silently truncating an article into a shorter, still-plausible corpus.
const bodyEndMarker = "© Europäische Union";

const namedEntities = new Map<string, string>([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/gu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(
      /&([a-z]+);/giu,
      (match, name: string) => namedEntities.get(name.toLowerCase()) ?? match,
    );
}

export function extractArticleBody(pageHtml: string): string {
  const stripped = pageHtml
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ");
  const text = decodeEntities(stripped).replace(/\s+/gu, " ");
  const start = text.search(/\(1\)\s/u);
  const end = text.indexOf(bodyEndMarker);
  if (start < 0) {
    throw new Error("Could not locate the article body start marker '(1)'");
  }
  if (end < 0 || end <= start) {
    throw new Error(`Could not locate the article body end marker '${bodyEndMarker}'`);
  }
  const body = text.slice(start, end).trim();
  // Fail closed on an entity this decoder does not know: a stray '&auml;' in the corpus would be
  // cited to a reader as regulation text.
  const residual = /&[a-z]+;|&#\d+;/iu.exec(body);
  if (residual !== null) {
    throw new Error(`Undecoded HTML entity in extracted body: ${residual[0]}`);
  }
  if (body.length === 0) {
    throw new Error("Extracted article body is empty");
  }
  return body;
}

function readFlag(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }
  return args[index + 1] ?? null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const article = readFlag(args, "--article");
  const slug = readFlag(args, "--slug");
  if (article === null || slug === null) {
    process.stderr.write("usage: tsx scripts/fetch-corpus-source.ts --article <n> --slug <name>\n");
    process.exit(2);
  }
  const url = `${sourceBaseUrl}/${article}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`${url} responded ${String(response.status)}`);
  }
  const body = extractArticleBody(await response.text());
  // Hash exactly the bytes that land on disk, so the provenance test can hash the file as-is
  // instead of reconstructing which trailing whitespace was or was not covered.
  const snapshot = `${body}\n`;
  const sha256 = createHash("sha256").update(snapshot, "utf8").digest("hex");
  await mkdir(sourcesDir, { recursive: true });
  await writeFile(join(sourcesDir, `${slug}.source.txt`), snapshot, "utf8");
  await writeFile(
    join(sourcesDir, `${slug}.provenance.json`),
    `${JSON.stringify(
      {
        regulation: "Verordnung (EU) 2024/1689",
        article: Number.parseInt(article, 10),
        language: "de",
        retrievalUrl: url,
        retrievedAt: new Date().toISOString().slice(0, 10),
        sha256,
        extractor: extractorVersion,
        note: "Mirror rendering, not the Official Journal. Re-derive by re-running this script and comparing sha256.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(
    `fetched article ${article} -> ${slug} (${String(body.length)} chars, sha256 ${sha256.slice(0, 12)})\n`,
  );
}

await main();
