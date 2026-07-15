/**
 * mjdeving-lab tokens (references/design-system/lab/tokens.css), Archetyp A "Konsole".
 * Per-project override is exactly three variables: --accent, --accent-dim, --accent-faint.
 * audit-grade-rag owns lime #c2d94e (verification, the passing check). Every other token is
 * shared across the portfolio demos and a new one here would be a lock break.
 */
export const demoStyleNonce = "audit-grade-rag-demo";

export const demoCss = `
:root {
  --canvas: #0a0b0d;
  --surface: #121417;
  --surface-2: #171a1e;
  --border: #23272d;
  --border-bright: #2e343b;
  --text: #e7e9ec;
  --text-muted: #9aa1a8;
  --text-dim: #656b72;
  --accent: #c2d94e;
  --accent-dim: #8c9c38;
  --accent-faint: rgba(194, 217, 78, 0.12);
  --danger: #e5674c;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --radius: 8px;
  --radius-sm: 6px;
  --radius-pill: 9999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;
  --maxw: 820px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--canvas);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  -webkit-text-size-adjust: 100%;
}
.wrap { max-width: var(--maxw); margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-8); }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: var(--space-4); top: var(--space-4); z-index: 2; background: var(--surface-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
a { color: var(--text); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

header { border-bottom: 1px solid var(--border); padding-bottom: var(--space-5); margin-bottom: var(--space-5); }
.brand { font-family: var(--font-mono); font-size: 14px; letter-spacing: -0.01em; margin: 0; }
.brand .slash { color: var(--text-dim); }
.lede { color: var(--text-muted); margin: var(--space-3) 0 var(--space-4); max-width: 62ch; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); list-style: none; padding: 0; margin: 0; }
.chip {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);
  border: 1px solid var(--border); border-radius: var(--radius-pill);
  padding: 3px var(--space-2); white-space: nowrap;
}

form.ask { display: flex; gap: var(--space-2); margin-bottom: var(--space-3); }
input[type="search"] {
  flex: 1 1 auto; min-width: 0;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: var(--space-3) var(--space-4); font: inherit;
  transition: border-color 0.12s;
}
input[type="search"]::placeholder { color: var(--text-dim); }
input[type="search"]:focus { outline: none; border-color: var(--accent); }
button.primary {
  background: var(--accent); color: #12140a; border: 1px solid var(--accent);
  border-radius: var(--radius); padding: var(--space-3) var(--space-5);
  font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: background-color 0.12s, border-color 0.12s;
}
button.primary:hover { background: var(--accent-dim); border-color: var(--accent-dim); }
.examples { display: flex; flex-wrap: wrap; gap: var(--space-2); list-style: none; padding: 0; margin: 0 0 var(--space-6); }
.examples a {
  display: inline-block; font-family: var(--font-mono); font-size: 11px;
  color: var(--text-muted); text-decoration: none;
  border: 1px solid var(--border); border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-3);
  transition: border-color 0.12s, color 0.12s;
}
.examples a:hover { border-color: var(--border-bright); color: var(--text); }

section { margin-bottom: var(--space-6); }
.eyebrow {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--accent); margin: 0 0 var(--space-2);
}
/* Lime is the passing check in this system. A rejected retrieval must not wear it. */
.eyebrow.muted { color: var(--text-dim); }
h2 { font-size: 15px; font-weight: 600; margin: 0 0 var(--space-3); }

.answer { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4) var(--space-5); }
.claim { margin: 0 0 var(--space-3); }
.claim:last-child { margin-bottom: 0; }
.cite {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);
  background: var(--accent-faint); border-radius: var(--radius-sm);
  padding: 1px var(--space-2); margin-left: var(--space-1);
  text-decoration: none; white-space: nowrap;
}
.cite:hover { color: var(--text); }
.refused { border-color: var(--danger); }
.refused .state { color: var(--danger); }
.state { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); margin: 0 0 var(--space-3); }

.evidence { display: grid; gap: var(--space-3); }
.ev {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); padding: var(--space-3) var(--space-4);
}
.ev-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
.ev-text { margin: var(--space-2) 0 var(--space-3); color: var(--text-muted); font-size: 14px; }
.bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
/* Widths are classes, not inline style attributes: the CSP nonce covers this stylesheet but does
   not whitelist a style="" attribute, so an inline width would be blocked and render at zero. */
.bar span { display: block; height: 100%; background: var(--accent); }
.bar span.w10 { width: 10%; }
.bar span.w20 { width: 20%; }
.bar span.w30 { width: 30%; }
.bar span.w40 { width: 40%; }
.bar span.w50 { width: 50%; }
.bar span.w60 { width: 60%; }
.bar span.w70 { width: 70%; }
.bar span.w80 { width: 80%; }
.bar span.w90 { width: 90%; }
.bar span.w100 { width: 100%; }

.ledger { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-4) var(--space-5); }
.kv { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: var(--space-2) var(--space-4); margin: 0; }
.kv dt { color: var(--text-dim); font-size: 13px; }
.kv dd { margin: 0; font-family: var(--font-mono); font-size: 12px; word-break: break-all; color: var(--text); }
.kv dd.dim { color: var(--text-muted); }
.chain { display: flex; align-items: center; gap: var(--space-2); font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); margin-bottom: var(--space-4); flex-wrap: wrap; }
.chain .link { color: var(--text-dim); }
.verdict { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); }
.verdict .pass { color: var(--accent); }
.verdict .fail { color: var(--danger); }
form.replay { margin-top: var(--space-4); }
button.secondary {
  background: none; color: var(--text); border: 1px solid var(--border-bright);
  border-radius: var(--radius); padding: var(--space-2) var(--space-4);
  font: inherit; font-size: 13px; cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
button.secondary:hover { border-color: var(--accent); color: var(--accent); }

details { border-top: 1px solid var(--border); padding-top: var(--space-4); }
summary { cursor: pointer; font-size: 13px; color: var(--text-muted); }
summary:hover { color: var(--text); }
.corpus { list-style: none; padding: 0; margin: var(--space-4) 0 0; max-height: 280px; overflow-y: auto; }
.corpus li { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
.corpus li:last-child { border-bottom: none; }
.corpus .id { color: var(--accent); }

footer { border-top: 1px solid var(--border); margin-top: var(--space-8); padding-top: var(--space-4); font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); }
footer a { color: var(--text-muted); }

@media (max-width: 640px) {
  .wrap { padding: var(--space-5) var(--space-3) var(--space-6); }
  form.ask { flex-direction: column; }
  button.primary { width: 100%; }
  .kv { grid-template-columns: 1fr; gap: var(--space-1); }
  .kv dd { margin-bottom: var(--space-2); }
}
`;
