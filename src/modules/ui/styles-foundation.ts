export const foundationConsoleCss = `
:root {
  color-scheme: light;
  --bg: #eef2ed;
  --ink: #15201c;
  --ink-strong: #07110d;
  --muted: #607069;
  --muted-strong: #44534d;
  --surface: #fbfcfa;
  --surface-2: #f3f6f2;
  --surface-3: #e7ede8;
  --line: #d1ddd5;
  --line-strong: #9fafaa;
  --rail: #0b1712;
  --rail-2: #11251e;
  --accent: #0d7c72;
  --accent-strong: #075d55;
  --accent-soft: #d8f1ec;
  --blue: #214f96;
  --amber: #a66212;
  --green: #1d6f3d;
  --danger: #a4342f;
  --shadow: 0 20px 44px rgba(21, 35, 29, 0.12);
  --shadow-soft: 0 10px 28px rgba(21, 35, 29, 0.08);
}
* {
  box-sizing: border-box;
}
html {
  background: var(--bg);
  scroll-behavior: smooth;
}
body {
  min-width: 320px;
  margin: 0;
  color: var(--ink);
  background:
    linear-gradient(115deg, rgba(13, 124, 114, 0.1), transparent 34rem),
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(238, 242, 237, 0.96)),
    var(--bg);
  font-family:
    Avenir Next, Aptos, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-size: 16px;
  line-height: 1.45;
  letter-spacing: 0;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}
body::before {
  position: fixed;
  inset: 0;
  pointer-events: none;
  content: "";
  opacity: 0.38;
  background-image:
    linear-gradient(rgba(7, 17, 13, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(7, 17, 13, 0.035) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.92), transparent 74%);
}
button,
input,
textarea {
  font: inherit;
}
button,
.button-link {
  min-height: 42px;
  border: 0;
  border-radius: 7px;
  padding: 0 15px;
  background: var(--accent);
  color: #ffffff;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
  transition:
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}
button:hover,
.button-link:hover {
  background: var(--accent-strong);
  box-shadow: 0 10px 22px rgba(13, 124, 114, 0.18);
  transform: translateY(-1px);
}
button:active,
.button-link:active {
  transform: translateY(0);
}
button:focus-visible,
.button-link:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 3px solid rgba(13, 124, 114, 0.32);
  outline-offset: 3px;
}
textarea,
input {
  width: 100%;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: #ffffff;
  color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}
textarea {
  min-height: 108px;
  resize: vertical;
  padding: 12px 13px;
}
input {
  min-height: 42px;
  padding: 0 11px;
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
  width: 100%;
  max-width: 100vw;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  overflow-x: hidden;
}
.rail {
  position: sticky;
  top: 0;
  min-width: 0;
  max-width: 100vw;
  min-height: 100vh;
  display: grid;
  align-content: start;
  gap: 24px;
  background:
    linear-gradient(180deg, rgba(29, 111, 61, 0.22), transparent 18rem),
    linear-gradient(145deg, var(--rail), var(--rail-2));
  color: #f4fff8;
  padding: 24px 18px;
}
.brand {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 11px;
  align-items: center;
}
.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: #0d7c72;
  font-weight: 900;
}
.brand-title {
  margin: 0;
  color: #ffffff;
  font-size: 1.02rem;
  font-weight: 900;
}
.brand-subtitle,
.rail-label {
  margin: 0;
  color: #bdd1c7;
  font-size: 0.82rem;
}
.rail-nav {
  display: grid;
  gap: 7px;
}
.rail-nav a {
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 10px 11px;
  color: #e8f6ef;
  text-decoration: none;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}
.rail-nav a[aria-current="page"],
.rail-nav a:hover {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.11);
}
.rail-nav a:hover {
  transform: translateX(2px);
}
.rail-status {
  display: grid;
  gap: 7px;
  margin-top: 6px;
  padding: 15px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}
.rail-status strong {
  max-width: 16ch;
  color: #ffffff;
  font-size: 0.98rem;
}
.workspace {
  position: relative;
  z-index: 1;
  min-width: 0;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
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
  border: 1px solid rgba(159, 175, 170, 0.58);
  border-radius: 8px;
  background: rgba(251, 252, 250, 0.94);
  box-shadow: var(--shadow-soft);
}
.topbar {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.62fr);
  gap: 20px;
  align-items: end;
  margin-bottom: 16px;
  padding: 24px;
  overflow: hidden;
}
.topbar::after {
  display: block;
  width: 100%;
  height: 5px;
  grid-column: 1 / -1;
  content: "";
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--green), var(--amber));
}
.topbar > *,
.main-grid > *,
.section-head > *,
.field,
.primary-stack {
  min-width: 0;
}
.eyebrow {
  margin: 0 0 5px;
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
}
h1,
h2,
h3,
p,
a,
button,
strong,
dd {
  overflow-wrap: anywhere;
}
h1 {
  max-width: 18ch;
  margin: 0;
  color: var(--ink-strong);
  font-size: 2.08rem;
  line-height: 1.06;
  text-wrap: balance;
}
h2 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 1.08rem;
}
h3 {
  margin: 0;
  color: var(--ink-strong);
  font-size: 0.96rem;
}
.topbar p,
.section-note {
  max-width: 62ch;
  margin: 7px 0 0;
  color: var(--muted);
}
.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.metric {
  min-width: 0;
  min-height: 70px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 11px;
  background: linear-gradient(180deg, #ffffff, var(--surface-2));
}
.metric span {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
}
.metric strong {
  display: block;
  margin-top: 4px;
  color: var(--ink-strong);
  font-size: 0.98rem;
  overflow-wrap: anywhere;
}
.query-panel {
  min-width: 0;
  margin-bottom: 16px;
  padding: 18px;
}
.query-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 112px 104px;
  gap: 12px;
  align-items: end;
}
.field {
  display: grid;
  gap: 7px;
}
.field label {
  color: var(--muted-strong);
  font-size: 0.84rem;
  font-weight: 800;
}
.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.38fr) minmax(310px, 0.82fr);
  gap: 16px;
  align-items: start;
  margin-bottom: 18px;
}
.primary-stack {
  display: grid;
  gap: 16px;
}
.answer-panel,
.audit-panel,
.evidence-section,
.auth-panel,
.report-panel,
.source-panel {
  min-width: 0;
  padding: 18px;
}
.answer-panel {
  background:
    linear-gradient(90deg, rgba(13, 124, 114, 0.1), transparent 32%),
    rgba(251, 252, 250, 0.96);
}
.audit-panel {
  position: sticky;
  top: 24px;
  box-shadow: var(--shadow);
}
.section-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
summary {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  font-weight: 900;
  cursor: pointer;
}
.badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border: 1px solid rgba(13, 124, 114, 0.15);
  border-radius: 7px;
  padding: 0 9px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.78rem;
  font-weight: 900;
}
.badge.warn {
  border-color: rgba(166, 98, 18, 0.18);
  background: #fff2d8;
  color: var(--amber);
}
.answer-copy {
  display: grid;
  gap: 12px;
  max-width: 68ch;
  color: var(--ink-strong);
  font-size: 1.08rem;
}
.answer-copy p {
  margin: 0;
}
.citation-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  margin-left: 7px;
  border: 1px solid #8fcac2;
  border-radius: 7px;
  padding: 0 9px;
  background: #effdfa;
  color: var(--accent-strong);
  font-size: 0.84rem;
  font-weight: 900;
  text-decoration: none;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}
.citation-pill:hover {
  border-color: var(--accent);
  background: #dff6f1;
  transform: translateY(-1px);
}
`;
