import type { Citation, CorpusChunk, LedgerEntry, RetrievedChunk } from "../../domain/types.js";
import { shortHash } from "../../lib/hash.js";
import type { LedgerVerification } from "../audit/ledger.js";
import { parseCitedClaims } from "../generation/generation.js";
import type { ReplayResult } from "../replay/replay.js";
import { demoCss, demoStyleNonce } from "./demo-styles.js";

export type DemoView = {
  readonly query: string;
  readonly entry: LedgerEntry | null;
  readonly replay: ReplayResult | null;
  readonly corpus: readonly CorpusChunk[];
  readonly examples: readonly string[];
  readonly verification: LedgerVerification;
  readonly error: string | null;
};

export type DemoPage = {
  readonly html: string;
  readonly csp: string;
};

const csp = [
  "default-src 'self'",
  `style-src 'self' 'nonce-${demoStyleNonce}'`,
  "script-src 'none'",
  "img-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const repoUrl = "https://github.com/mj-deving/audit-grade-rag";

export function renderDemo(view: DemoView): DemoPage {
  const body = `
    <a class="skip" href="#ask">Zum Inhalt springen</a>
    <div class="wrap">
      ${header()}
      <main id="ask">
        ${askForm(view)}
        ${view.error === null ? "" : errorBlock(view.error)}
        ${view.entry === null ? "" : answerSection(view.entry)}
        ${view.entry === null ? "" : evidenceSection(view.entry)}
        ${view.entry === null ? "" : ledgerSection(view.entry, view.replay, view.verification)}
        ${corpusSection(view.corpus)}
      </main>
      ${footer()}
    </div>`;
  return { html: page(body), csp };
}

function header(): string {
  return `
    <header>
      <p class="brand">audit-grade-rag<span class="slash">/demo</span></p>
      <p class="lede">
        Diese Konsole beantwortet Fragen zu einem Auszug aus Artikel 50 der EU-KI-Verordnung.
        Jede Antwort zitiert die Korpusstelle, aus der sie stammt, und wird als signierte Zeile
        in eine Hash-Kette geschrieben. Jede Zeile lässt sich Byte für Byte erneut ausführen.
      </p>
      <ul class="chips">
        ${["SQLite WAL", "SHA-256-Kette", "Ed25519", "BM25 + RRF", "Hono SSR", "Node 22"]
          .map((chip) => `<li class="chip">${escapeHtml(chip)}</li>`)
          .join("")}
      </ul>
    </header>`;
}

function askForm(view: DemoView): string {
  return `
    <form class="ask" action="/demo" method="get" role="search">
      <label class="skip" for="q">Frage an den Korpus</label>
      <input id="q" name="q" type="search" maxlength="300" autocomplete="off"
        placeholder="Frage an den Korpus stellen" value="${escapeHtml(view.query)}">
      <button class="primary" type="submit">Fragen</button>
    </form>
    <ul class="examples">
      ${view.examples
        .map(
          (example) =>
            `<li><a href="/demo?q=${encodeURIComponent(example)}">${escapeHtml(example)}</a></li>`,
        )
        .join("")}
    </ul>`;
}

function answerSection(entry: LedgerEntry): string {
  if (entry.generatedAnswer === null) {
    return `
      <section>
        <p class="eyebrow">Antwort</p>
        <div class="answer refused">
          <p class="state">${escapeHtml(entry.outcome)}</p>
          <p class="claim">Für diese Frage liegt keine ausreichend belegte Stelle im Korpus vor.
          Das System verweigert die Antwort, statt eine zu erfinden. Die Verweigerung steht
          genauso im Ledger wie eine Antwort.</p>
        </div>
      </section>`;
  }
  const chunkIds = new Set(entry.retrievedChunks.map((chunk) => chunk.chunkId));
  const claims = parseCitedClaims(entry.generatedAnswer)
    .map(
      (claim) =>
        `<p class="claim">${escapeHtml(claim.text)}${cites(claim.citations, chunkIds)}</p>`,
    )
    .join("");
  return `
    <section>
      <p class="eyebrow">Antwort</p>
      <div class="answer">
        <p class="state">${escapeHtml(entry.outcome)} · jede Aussage zitiert ihre Quelle</p>
        ${claims}
      </div>
    </section>`;
}

function cites(citations: readonly Citation[], known: ReadonlySet<string>): string {
  return citations
    .filter((citation) => known.has(citation.chunkId))
    .map(
      (citation) =>
        `<a class="cite" href="#ev-${escapeHtml(citation.chunkId)}">${escapeHtml(citation.chunkId)}</a>`,
    )
    .join("");
}

/**
 * On a refusal these chunks are not evidence for anything: they are the candidates that fell below
 * the relevance threshold, which is precisely why the system refused. Labelling them "Belege" would
 * present a rejected retrieval as support for an answer that was never given.
 */
function evidenceSection(entry: LedgerEntry): string {
  const chunks = entry.retrievedChunks;
  if (chunks.length === 0) {
    return "";
  }
  const refused = entry.outcome === "refused-out-of-corpus";
  const top = Math.max(...chunks.map((chunk) => chunk.retrievalScore));
  return `
    <section>
      <p class="eyebrow${refused ? " muted" : ""}">${refused ? "Verworfen" : "Belege"}</p>
      <h2>${refused ? "Kandidaten unterhalb der Relevanzschwelle" : "Abgerufene Korpusstellen"}</h2>
      <div class="evidence">${chunks.map((chunk) => evidenceCard(chunk, top)).join("")}</div>
    </section>`;
}

/**
 * The bar is drawn relative to the best chunk of this retrieval, not on a 0..1 scale. An RRF score
 * is a rank-fusion sum (here around 0.033), not a probability, so painting it as 3% of a bar would
 * claim a confidence the number does not carry. The raw score stays next to it as the real value.
 */
function evidenceCard(chunk: RetrievedChunk, topScore: number): string {
  const ratio = topScore <= 0 ? 0 : chunk.retrievalScore / topScore;
  const bucket = Math.min(100, Math.max(10, Math.ceil(ratio * 10) * 10));
  return `
    <article class="ev" id="ev-${escapeHtml(chunk.chunkId)}">
      <div class="ev-head">
        <span>${escapeHtml(chunk.chunkId)}</span>
        <span>${escapeHtml(chunk.retrievalMethod)} · ${chunk.retrievalScore.toFixed(4)}</span>
      </div>
      <p class="ev-text">${escapeHtml(chunk.chunkText)}</p>
      <div class="bar"><span class="w${String(bucket)}"></span></div>
    </article>`;
}

function ledgerSection(
  entry: LedgerEntry,
  replay: ReplayResult | null,
  verification: LedgerVerification,
): string {
  return `
    <section>
      <p class="eyebrow">Audit-Zeile</p>
      <h2>Die Zeile, die diese Antwort festhält</h2>
      <div class="ledger">
        <p class="chain">
          <span>Zeile ${String(entry.sequence)}</span>
          <span class="link">← vorheriger Hash ${escapeHtml(shortHash(entry.previousHash))}</span>
        </p>
        ${replay === null ? "" : replayVerdict(replay)}
        <dl class="kv">
          ${row("Zeilen-Hash (SHA-256)", entry.id)}
          ${row("Signatur (Ed25519)", entry.signature)}
          ${row("Signaturschlüssel", entry.signatureKeyId)}
          ${row("Frage", entry.queryText ?? "-")}
          ${row("Korpusstand", `${entry.corpusSnapshotId} · ${shortHash(entry.corpusSnapshotHash)}`)}
          ${row("Modell", entry.modelVersion)}
          ${row("Prompt", `${entry.promptVersion} · ${shortHash(entry.promptHash)}`)}
          ${row("Retrieval-Profil", entry.embeddingModelVersion)}
          ${row("Seed / Temperatur", `${String(entry.seed)} / ${String(entry.temperature)}`)}
          ${row("Replay-Fähigkeit", entry.providerReplayCapability)}
          ${row("Zeitpunkt", new Date(entry.timestampMs).toISOString())}
          ${row("Kette geprüft", chainState(verification), true)}
        </dl>
        ${replayControl(entry)}
      </div>
    </section>`;
}

/**
 * A refusal carries no answer bytes, so there is nothing to reproduce byte-for-byte and the replay
 * engine rejects it. Offering the button there would hand the visitor an error instead of a proof.
 * The row stays verifiable through the hash chain either way.
 */
function replayControl(entry: LedgerEntry): string {
  if (entry.generatedAnswer === null) {
    return `<p class="state">Eine Verweigerung enthält keine Antwort-Bytes. Es gibt nichts zu
      reproduzieren. Die Zeile selbst bleibt über die Hash-Kette prüfbar.</p>`;
  }
  return `
    <form class="replay" action="/demo/replay" method="post">
      <input type="hidden" name="entry" value="${escapeHtml(entry.id)}">
      <button class="secondary" type="submit">Diese Zeile erneut ausführen</button>
    </form>`;
}

function replayVerdict(replay: ReplayResult): string {
  const passed = replay.status === "passed";
  return `
    <p class="verdict">
      <span class="${passed ? "pass" : "fail"}">${escapeHtml(replay.status)}</span>
      · ${escapeHtml(replay.operatorMessageDe)}
      ${
        replay.regeneratedAnswerSha256 === null
          ? ""
          : `<br>Antwort-Hash vorher ${escapeHtml(shortHash(replay.originalGeneratedAnswerSha256 ?? "-"))}, nach erneuter Ausführung ${escapeHtml(shortHash(replay.regeneratedAnswerSha256))}.`
      }
    </p>`;
}

function chainState(verification: LedgerVerification): string {
  return verification.ok
    ? `${String(verification.checkedRows)} Zeilen, Hash und Signatur gültig`
    : `Kette gebrochen ab Zeile ${String(verification.firstInvalidSequence)}`;
}

function corpusSection(corpus: readonly CorpusChunk[]): string {
  return `
    <details>
      <summary>Korpus: ${String(corpus.length)} Stellen aus Artikel 50 der EU-KI-Verordnung</summary>
      <ul class="corpus">
        ${corpus
          .map(
            (chunk) =>
              `<li><span class="id">${escapeHtml(chunk.chunkId)}</span> ${escapeHtml(chunk.chunkText)}</li>`,
          )
          .join("")}
      </ul>
    </details>`;
}

function errorBlock(message: string): string {
  return `<div class="answer refused"><p class="state">Abgelehnt</p><p class="claim">${escapeHtml(message)}</p></div>`;
}

function footer(): string {
  return `
    <footer>
      Portfolio-Demo, öffentlich und ohne Anmeldung. Die Operator-Konsole bleibt passkey-geschützt.
      Lizenz BSL 1.1. <a href="${repoUrl}">${repoUrl}</a>
    </footer>`;
}

function row(label: string, value: string, dim = false): string {
  return `<dt>${escapeHtml(label)}</dt><dd${dim ? ' class="dim"' : ""}>${escapeHtml(value)}</dd>`;
}

function page(body: string): string {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, nofollow">
  <title>audit-grade-rag - belegte Antworten mit Audit-Zeile</title>
  <style nonce="${demoStyleNonce}">${demoCss}</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
