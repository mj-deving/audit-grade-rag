export const styleNonce = "audit-grade-rag-style";

export const consoleCss = `
:root {
  color-scheme: light;
  --bg: #f6f8f5;
  --ink: #17201c;
  --muted: #65736b;
  --soft: #eef4f0;
  --surface: #ffffff;
  --surface-2: #f9fbf8;
  --line: #d9e3dd;
  --line-strong: #b8c6bf;
  --accent: #0f766e;
  --accent-strong: #0b5d56;
  --accent-soft: #dff3ef;
  --blue: #2563eb;
  --amber: #b45309;
  --green: #15803d;
  --danger: #b91c1c;
  --shadow: 0 18px 42px rgba(21, 35, 29, 0.1);
}

* {
  box-sizing: border-box;
}

html {
  background: var(--bg);
}

body {
  min-width: 320px;
  margin: 0;
  color: var(--ink);
  background:
    linear-gradient(180deg, rgba(15, 118, 110, 0.08), transparent 340px),
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 360px),
    var(--bg);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 1.45;
}

button,
input,
textarea {
  font: inherit;
}

button,
.button-link {
  min-height: 40px;
  border: 0;
  border-radius: 7px;
  padding: 0 14px;
  background: var(--accent);
  color: #ffffff;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

button:hover,
.button-link:hover {
  background: var(--accent-strong);
}

textarea,
input {
  width: 100%;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: #ffffff;
  color: var(--ink);
}

textarea {
  min-height: 112px;
  resize: vertical;
  padding: 12px;
}

input {
  min-height: 40px;
  padding: 0 10px;
}

.skip-link {
  position: absolute;
  left: 16px;
  top: -48px;
  z-index: 4;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--ink);
  color: #ffffff;
}

.skip-link:focus {
  top: 16px;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
}

.rail {
  background: #111a16;
  color: #f4fff8;
  padding: 24px 18px;
}

.brand {
  display: grid;
  gap: 4px;
  margin-bottom: 30px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent);
  font-weight: 800;
}

.brand-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.brand-subtitle,
.rail-label {
  margin: 0;
  color: #b7c9c0;
  font-size: 0.84rem;
}

.rail-nav {
  display: grid;
  gap: 8px;
  margin: 24px 0;
}

.rail-nav a {
  border-radius: 7px;
  padding: 10px 11px;
  color: #e8f6ef;
  text-decoration: none;
}

.rail-nav a[aria-current="page"],
.rail-nav a:hover {
  background: rgba(255, 255, 255, 0.1);
}

.rail-status {
  display: grid;
  gap: 10px;
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}

.workspace {
  min-width: 0;
  padding: 26px;
}

.topbar,
.query-panel,
.answer-panel,
.audit-panel,
.evidence-section,
.auth-panel,
.report-panel,
.source-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow);
}

.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  align-items: start;
  margin-bottom: 18px;
  padding: 20px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  overflow-wrap: anywhere;
}

h1 {
  margin: 0;
  font-size: 1.75rem;
  line-height: 1.12;
}

h2 {
  margin: 0;
  font-size: 1.08rem;
}

h3 {
  margin: 0;
  font-size: 0.96rem;
}

.topbar p,
.section-note {
  margin: 6px 0 0;
  color: var(--muted);
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(110px, 1fr));
  gap: 10px;
}

.metric {
  min-height: 64px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 10px;
  background: var(--surface-2);
}

.metric span {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
}

.metric strong {
  display: block;
  margin-top: 4px;
  font-size: 0.95rem;
}

.query-panel {
  margin-bottom: 18px;
  padding: 18px;
}

.query-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) 112px 104px;
  gap: 12px;
  align-items: end;
}

.field {
  display: grid;
  gap: 7px;
}

.field label {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.85fr);
  gap: 18px;
  align-items: start;
  margin-bottom: 18px;
}

.primary-stack {
  display: grid;
  gap: 18px;
}

.answer-panel,
.audit-panel,
.evidence-section,
.auth-panel,
.report-panel,
.source-panel {
  padding: 18px;
}

.section-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border-radius: 999px;
  padding: 0 9px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
}

.badge.warn {
  background: #fff2d8;
  color: var(--amber);
}

.answer-copy {
  display: grid;
  gap: 12px;
  font-size: 1.02rem;
}

.answer-copy p {
  margin: 0;
}

.citation-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  margin-left: 7px;
  border: 1px solid #9ad4cc;
  background: #f1fffc;
  color: var(--accent-strong);
  font-size: 0.86rem;
}

.audit-list,
.report-list,
.source-list,
.chunk-meta {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
}

.audit-list dt,
.report-list dt,
.source-list dt,
.chunk-meta dt {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 800;
}

.audit-list dd,
.report-list dd,
.source-list dd,
.chunk-meta dd {
  min-width: 0;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82rem;
}

.replay-button {
  width: 100%;
  margin-top: 16px;
  background: #17372f;
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

.chunk-card {
  min-height: 260px;
  display: grid;
  gap: 12px;
  align-content: start;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 15px;
  background: var(--surface);
}

.chunk-text {
  max-height: 118px;
  margin: 0;
  overflow: auto;
  color: #24302b;
}

.source-link {
  color: var(--blue);
  font-weight: 800;
  text-decoration: none;
}

.auth-shell,
.report-shell,
.source-shell {
  max-width: 980px;
  margin: 0 auto;
  padding: 36px 20px;
}

.auth-panel,
.report-panel,
.source-panel {
  display: grid;
  gap: 18px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr)) auto;
  gap: 12px;
  align-items: end;
}

mark {
  display: block;
  border-radius: 8px;
  padding: 18px;
  background: #fff7c2;
  color: #1d1d12;
}

@media (max-width: 980px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .rail {
    position: static;
    padding: 16px;
  }

  .rail-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .workspace {
    padding: 16px;
  }

  .topbar,
  .main-grid,
  .query-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .status-strip {
    grid-template-columns: 1fr;
  }
}
`;
