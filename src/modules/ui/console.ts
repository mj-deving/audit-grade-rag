import type { QueryResult, RetrievedChunk } from "../../domain/types.js";
import { shortHash } from "../../lib/hash.js";
import type { ReportBundle } from "../report/report.js";
import { consoleCss, styleNonce } from "./styles.js";

export type ConsoleView = {
  readonly html: string;
  readonly csp: string;
  readonly externalScriptCount: number;
  readonly analyticsRequestCount: number;
  readonly keyboardControls: readonly string[];
};

const csp = [
  "default-src 'self'",
  `style-src 'self' 'nonce-${styleNonce}'`,
  "script-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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
  replayUnsupported: "Replay fuer dieses Anbieterprofil nicht unterstuetzt.",
  report: "Artikel-50-Bericht erzeugen",
} as const;

export function renderAuthOperator(): ConsoleView {
  const html = page(
    `${germanCopy.login} - Audit-Grade RAG`,
    `
      <main class="auth-shell" id="main">
        <section class="auth-panel" aria-labelledby="auth-heading">
          <p class="eyebrow">Zugriff</p>
          <h1 id="auth-heading">${germanCopy.login}</h1>
          <p>${germanCopy.aiDisclosure}</p>
          <form class="form-grid" action="/api/auth/magic-link/request" method="post">
            <div class="field">
              <label for="email">${germanCopy.email}</label>
              <input id="email" name="email" type="email" autocomplete="email" required>
            </div>
            <button type="submit">${germanCopy.passkey}</button>
          </form>
        </section>
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
      <div class="app-shell">
        ${renderRail("console")}
        <main class="workspace" id="main">
          ${renderTopbar(result)}
          ${renderQueryPanel(result)}
          <div class="main-grid">
            <div class="primary-stack">
              <section class="answer-panel" aria-labelledby="answer-heading">
                <div class="section-head">
                  <h2 id="answer-heading">${germanCopy.answer}</h2>
                  ${statusBadge(result.outcome)}
                </div>
                ${answer}
              </section>
              ${renderChunks(result.retrievedChunks)}
            </div>
            ${renderAudit(result)}
          </div>
        </main>
      </div>
    `,
  );
  return view(html, ["query", "top-k", "submit", "citation", "replay"]);
}

export function renderSourceViewer(chunk: RetrievedChunk): ConsoleView {
  const html = page(
    "Quelle - Audit-Grade RAG",
    `
      <main class="source-shell" id="main">
        <section class="source-panel" aria-labelledby="source-heading">
          <p class="eyebrow">Quelle</p>
          <h1 id="source-heading">Quellenansicht</h1>
          <dl class="source-list">
            <dt>Dokument</dt><dd>${escapeHtml(chunk.docId)}</dd>
            <dt>Seite</dt><dd>${String(chunk.pageStart)}</dd>
            <dt>Revision</dt><dd>${escapeHtml(chunk.chunkSha256)}</dd>
            <dt>Korpusstand</dt><dd>${escapeHtml(chunk.corpusSnapshotId)}</dd>
          </dl>
          <mark>${escapeHtml(chunk.chunkText)}</mark>
          <a class="button-link" href="/console">Zurueck zur Antwort</a>
        </section>
      </main>
    `,
  );
  return view(html, ["back-link"]);
}

export function renderReportView(bundle: ReportBundle): ConsoleView {
  const html = page(
    "Bericht - Audit-Grade RAG",
    `
      <main class="report-shell" id="main">
        <section class="report-panel" aria-labelledby="report-heading">
          <p class="eyebrow">Transparenz</p>
          <h1 id="report-heading">${germanCopy.report}</h1>
          <form class="form-grid">
            <div class="field">
              <label for="since">Seit</label>
              <input id="since" name="since" type="datetime-local" required>
            </div>
            <div class="field">
              <label for="until">Bis</label>
              <input id="until" name="until" type="datetime-local" required>
            </div>
            <button type="submit">${germanCopy.report}</button>
          </form>
          <dl class="report-list">
            <dt>JSON-Hash</dt><dd>${bundle.jsonSha256}</dd>
            <dt>PDF-Hash</dt><dd>${bundle.pdfSha256}</dd>
            <dt>Audit-Auszug</dt><dd>${bundle.auditExcerptZipSha256}</dd>
            <dt>Ledger</dt><dd>${bundle.ledgerEntryId}</dd>
          </dl>
          <a class="button-link" href="/api/reports/${bundle.bundleSha256}/download">Bundle herunterladen</a>
          <p class="section-note">Dieser Bericht deckt Artikel 50 ab und ersetzt keine Rechtsberatung.</p>
        </section>
      </main>
    `,
  );
  return view(html, ["since", "until", "submit", "download"]);
}

function renderRail(current: "console" | "reports"): string {
  return `
    <aside class="rail" aria-label="Navigation">
      <div class="brand">
        <div class="brand-mark">AR</div>
        <p class="brand-title">Audit-Grade RAG</p>
        <p class="brand-subtitle">Operator-Konsole</p>
      </div>
      <nav class="rail-nav">
        <a href="/console" ${current === "console" ? 'aria-current="page"' : ""}>Konsole</a>
        <a href="/console/reports" ${current === "reports" ? 'aria-current="page"' : ""}>Artikel 50</a>
        <a href="/auth/operator">Zugriff</a>
      </nav>
      <div class="rail-status">
        <p class="rail-label">Betriebsmodus</p>
        <strong>Lokaler Audit-Lauf</strong>
      </div>
    </aside>
  `;
}

function renderTopbar(result: QueryResult): string {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Belegte Korpusantworten</p>
        <h1>Audit-Arbeitsplatz</h1>
        <p>Antworten, Evidenz und Audit-Status.</p>
      </div>
      <div class="status-strip" aria-label="Laufzeitstatus">
        ${metric("Korpusstand", shortHash(result.corpusSnapshotId))}
        ${metric("Anbieter", result.providerProfileId)}
        ${metric("Ergebnis", result.outcome)}
      </div>
    </header>
  `;
}

function renderQueryPanel(result: QueryResult): string {
  return `
    <section class="query-panel" aria-labelledby="query-heading">
      <div class="section-head">
        <div>
          <h2 id="query-heading">Korpusfrage</h2>
          <p class="section-note">Aktiver Korpusstand: ${escapeHtml(result.corpusSnapshotId)}</p>
        </div>
        <span class="badge">Top-K 8</span>
      </div>
      <form class="query-grid">
        <div class="field">
          <label for="query">${germanCopy.queryPlaceholder}</label>
          <textarea id="query" name="query">beantwortete Anfrage Audit-Zeile</textarea>
        </div>
        <div class="field">
          <label for="top-k">Top-K</label>
          <input id="top-k" name="top_k" type="number" min="1" max="20" value="8">
        </div>
        <button type="button">Senden</button>
      </form>
    </section>
  `;
}

function renderAnswer(result: QueryResult): string {
  return `<div class="answer-copy">${result.claims
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
    .join("")}</div>`;
}

function renderChunks(chunks: readonly RetrievedChunk[]): string {
  return `
    <section class="evidence-section" aria-labelledby="chunks-heading">
      <div class="section-head">
        <div>
          <h2 id="chunks-heading">${germanCopy.chunks}</h2>
          <p class="section-note">${String(chunks.length)} Treffer aus dem aktiven Korpusstand.</p>
        </div>
      </div>
      <div class="evidence-grid">${chunks.map(renderChunkPreview).join("")}</div>
    </section>
  `;
}

function renderChunkPreview(chunk: RetrievedChunk): string {
  return `
    <article class="chunk-card" id="${escapeHtml(chunk.chunkId)}">
      <div class="section-head">
        <h3>${shortHash(chunk.chunkId)}</h3>
        <span class="badge">${escapeHtml(chunk.retrievalMethod)}</span>
      </div>
      <p class="chunk-text">${escapeHtml(chunk.chunkText)}</p>
      <dl class="chunk-meta">
        <dt>Bewertung</dt><dd>${String(chunk.retrievalScore)}</dd>
        <dt>Dokument</dt><dd>${escapeHtml(chunk.docId)}</dd>
        <dt>Seite</dt><dd>${String(chunk.pageStart)}</dd>
        <dt>Offset</dt><dd>${String(chunk.charStart)}-${String(chunk.charEnd)}</dd>
      </dl>
      <a class="source-link" href="/source/${escapeHtml(chunk.docId)}/page/${String(chunk.pageStart)}">Quelle oeffnen</a>
    </article>
  `;
}

function renderAudit(result: QueryResult): string {
  return `
    <section class="audit-panel" aria-labelledby="audit-heading">
      <div class="section-head">
        <h2 id="audit-heading">${germanCopy.audit}</h2>
        <span class="badge">signiert</span>
      </div>
      <dl class="audit-list">
        <dt>Sequenz</dt><dd>${String(result.ledgerEntry.sequence)}</dd>
        <dt>Zeilenhash</dt><dd>${shortHash(result.ledgerEntry.id)}</dd>
        <dt>Vorheriger Hash</dt><dd>${shortHash(result.ledgerEntry.previousHash)}</dd>
        <dt>Schluessel</dt><dd>${escapeHtml(result.ledgerEntry.signatureKeyId)}</dd>
        <dt>Ergebnis</dt><dd>${escapeHtml(result.outcome)}</dd>
        <dt>Prompt</dt><dd>${escapeHtml(result.promptVersion)}</dd>
        <dt>Modell</dt><dd>${escapeHtml(result.modelVersion)}</dd>
        <dt>Embedding</dt><dd>${escapeHtml(result.embeddingModelVersion)}</dd>
      </dl>
      <button class="replay-button" type="button">${germanCopy.replayPassed}</button>
    </section>
  `;
}

function stateMessage(outcome: QueryResult["outcome"]): string {
  if (outcome === "refused-out-of-corpus") {
    return `<div class="answer-copy"><p>${germanCopy.refusal}</p></div>`;
  }
  if (outcome === "blocked-uncited") {
    return `<div class="answer-copy"><p>${germanCopy.blocked}</p></div>`;
  }
  return '<div class="answer-copy"><p>Anbieterfehler. Bitte spaeter erneut versuchen.</p></div>';
}

function statusBadge(outcome: QueryResult["outcome"]): string {
  const className = outcome === "answered" ? "badge" : "badge warn";
  return `<span class="${className}">${escapeHtml(outcome)}</span>`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style nonce="${styleNonce}">${consoleCss}</style>
</head>
<body>
  <a class="skip-link" href="#main">Zum Inhalt springen</a>
  ${body}
</body>
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
