import type { QueryResult, RetrievedChunk } from "../../domain/types.js";
import { shortHash } from "../../lib/hash.js";
import type { ReportBundle } from "../report/report.js";

export type ConsoleView = {
  readonly html: string;
  readonly csp: string;
  readonly externalScriptCount: number;
  readonly analyticsRequestCount: number;
  readonly keyboardControls: readonly string[];
};

const csp = "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:";

export const germanCopy = {
  aiDisclosure: "Sie interagieren mit einem KI-System fuer belegte Korpusantworten.",
  login: "Operator-Anmeldung",
  email: "E-Mail fuer Bootstrap oder Wiederherstellung",
  passkey: "Mit Passkey fortfahren",
  queryPlaceholder: "Frage an den freigegebenen Korpus stellen",
  answer: "Antwort",
  chunks: "Gefundene Korpusstellen",
  audit: "Audit-Spur",
  refusal: "Keine ausreichend relevante Evidenz im Korpus gefunden.",
  blocked: "Die generierte Antwort wurde wegen fehlender Zitate blockiert.",
  replayPassed: "Replay erfolgreich.",
  replayDrift: "Replay-Abweichung erkannt.",
  replayUnsupported: "Replay fuer dieses Providerprofil nicht unterstuetzt.",
  report: "Article-50-Bericht erzeugen",
} as const;

export function renderAuthOperator(): ConsoleView {
  const html = page(
    `${germanCopy.login} - Audit-Grade RAG`,
    `
      <main>
        <h1>${germanCopy.login}</h1>
        <p>${germanCopy.aiDisclosure}</p>
        <form action="/api/auth/magic-link/request" method="post">
          <label for="email">${germanCopy.email}</label>
          <input id="email" name="email" type="email" autocomplete="email" required>
          <button type="submit">${germanCopy.passkey}</button>
        </form>
      </main>
    `,
  );
  return view(html, ["email", "submit"]);
}

export function renderConsole(result: QueryResult): ConsoleView {
  const answer = result.answer === undefined ? stateMessage(result.outcome) : renderAnswer(result);
  const html = page(
    "Konsole - Audit-Grade RAG",
    `
      <main>
        <h1>Audit-Grade RAG</h1>
        <section aria-labelledby="query-heading">
          <h2 id="query-heading">Korpusfrage</h2>
          <label for="query">${germanCopy.queryPlaceholder}</label>
          <textarea id="query" name="query" rows="4"></textarea>
          <label for="top-k">Top-K</label>
          <input id="top-k" name="top_k" type="number" min="1" max="20" value="8">
          <button type="button">Senden</button>
          <p>Snapshot: ${escapeHtml(result.corpusSnapshotId)}</p>
          <p>Provider: ${escapeHtml(result.providerProfileId)}</p>
        </section>
        <section aria-labelledby="answer-heading">
          <h2 id="answer-heading">${germanCopy.answer}</h2>
          ${answer}
        </section>
        ${renderChunks(result.retrievedChunks)}
        ${renderAudit(result)}
      </main>
    `,
  );
  return view(html, ["query", "top-k", "submit", "citation", "replay"]);
}

export function renderSourceViewer(chunk: RetrievedChunk): ConsoleView {
  const html = page(
    "Quelle - Audit-Grade RAG",
    `
      <main>
        <h1>Quellenansicht</h1>
        <p>Dokument: ${escapeHtml(chunk.docId)}</p>
        <p>Seite: ${String(chunk.pageStart)}</p>
        <mark>${escapeHtml(chunk.chunkText)}</mark>
        <p>Revision: ${escapeHtml(chunk.chunkSha256)}</p>
        <p>Snapshot: ${escapeHtml(chunk.corpusSnapshotId)}</p>
        <a href="/console">Zurueck zur Antwort</a>
      </main>
    `,
  );
  return view(html, ["back-link"]);
}

export function renderReportView(bundle: ReportBundle): ConsoleView {
  const html = page(
    "Bericht - Audit-Grade RAG",
    `
      <main>
        <h1>${germanCopy.report}</h1>
        <form>
          <label for="since">Seit</label>
          <input id="since" name="since" type="datetime-local" required>
          <label for="until">Bis</label>
          <input id="until" name="until" type="datetime-local" required>
          <button type="submit">${germanCopy.report}</button>
        </form>
        <dl>
          <dt>JSON Hash</dt><dd>${bundle.jsonSha256}</dd>
          <dt>PDF Hash</dt><dd>${bundle.pdfSha256}</dd>
          <dt>Audit-Auszug Hash</dt><dd>${bundle.auditExcerptZipSha256}</dd>
          <dt>Ledger-Eintrag</dt><dd>${bundle.ledgerEntryId}</dd>
        </dl>
        <a href="/api/reports/${bundle.bundleSha256}/download">Bundle herunterladen</a>
        <p>Dieser Bericht deckt Article 50 ab und ersetzt keine Rechtsberatung.</p>
      </main>
    `,
  );
  return view(html, ["since", "until", "submit", "download"]);
}

function renderAnswer(result: QueryResult): string {
  return result.claims
    .map(
      (claim) =>
        `<p>${escapeHtml(claim.text)} ${claim.citations
          .map(
            (citation) =>
              `<button class="citation-pill" data-chunk="${escapeHtml(citation.chunkId)}" aria-label="Korpusstelle ${escapeHtml(
                citation.chunkId,
              )} anzeigen">${shortHash(citation.chunkId)}</button>`,
          )
          .join(" ")}</p>`,
    )
    .join("");
}

function renderChunks(chunks: readonly RetrievedChunk[]): string {
  return `
    <section aria-labelledby="chunks-heading">
      <h2 id="chunks-heading">${germanCopy.chunks}</h2>
      ${chunks.map(renderChunkPreview).join("")}
    </section>
  `;
}

function renderChunkPreview(chunk: RetrievedChunk): string {
  return `
    <article id="${escapeHtml(chunk.chunkId)}">
      <h3>${shortHash(chunk.chunkId)}</h3>
      <p>${escapeHtml(chunk.chunkText)}</p>
      <dl>
        <dt>Score</dt><dd>${String(chunk.retrievalScore)}</dd>
        <dt>Methode</dt><dd>${chunk.retrievalMethod}</dd>
        <dt>Dokument</dt><dd>${escapeHtml(chunk.docId)}</dd>
        <dt>Seite</dt><dd>${String(chunk.pageStart)}</dd>
        <dt>Offset</dt><dd>${String(chunk.charStart)}-${String(chunk.charEnd)}</dd>
      </dl>
      <a href="/source/${escapeHtml(chunk.docId)}/page/${String(chunk.pageStart)}">Quelle oeffnen</a>
    </article>
  `;
}

function renderAudit(result: QueryResult): string {
  return `
    <section aria-labelledby="audit-heading">
      <h2 id="audit-heading">${germanCopy.audit}</h2>
      <dl>
        <dt>Sequenz</dt><dd>${String(result.ledgerEntry.sequence)}</dd>
        <dt>Zeilenhash</dt><dd>${shortHash(result.ledgerEntry.id)}</dd>
        <dt>Vorheriger Hash</dt><dd>${shortHash(result.ledgerEntry.previousHash)}</dd>
        <dt>Signaturschluessel</dt><dd>${escapeHtml(result.ledgerEntry.signatureKeyId)}</dd>
        <dt>Outcome</dt><dd>${escapeHtml(result.outcome)}</dd>
        <dt>Prompt</dt><dd>${escapeHtml(result.promptVersion)}</dd>
        <dt>Modell</dt><dd>${escapeHtml(result.modelVersion)}</dd>
        <dt>Embedding</dt><dd>${escapeHtml(result.embeddingModelVersion)}</dd>
      </dl>
      <button type="button">${germanCopy.replayPassed}</button>
    </section>
  `;
}

function stateMessage(outcome: QueryResult["outcome"]): string {
  if (outcome === "refused-out-of-corpus") {
    return `<p>${germanCopy.refusal}</p>`;
  }
  if (outcome === "blocked-uncited") {
    return `<p>${germanCopy.blocked}</p>`;
  }
  return "<p>Provider-Fehler. Bitte spaeter erneut versuchen.</p>";
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body>${body}</body>
</html>`;
}

function view(html: string, keyboardControls: readonly string[]): ConsoleView {
  return { html, csp, externalScriptCount: 0, analyticsRequestCount: 0, keyboardControls };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
