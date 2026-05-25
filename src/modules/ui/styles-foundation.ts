export const foundationConsoleCss = `
:root {
  color-scheme: light;
  --color-bg: #eef1f5;
  --color-surface: #ffffff;
  --color-surface-2: #f4f6f9;
  --color-surface-3: #e9edf3;
  --color-ink: #1b2532;
  --color-ink-strong: #0f1722;
  --color-muted: #566175;
  --color-muted-strong: #3d4757;
  --color-line: #d4dae3;
  --color-line-strong: #aab4c2;
  --color-accent: #1f3a8a;
  --color-accent-strong: #182f6e;
  --color-accent-soft: #e7ecf8;
  --color-accent-ink: #1b357a;
  --color-rail: #111726;
  --color-rail-2: #1a2233;
  --color-rail-ink: #e7ebf2;
  --color-rail-muted: #9aa6bd;
  --color-positive: #1d6b4a;
  --color-positive-soft: #e3f1ea;
  --color-warning: #8a5a12;
  --color-warning-soft: #f6ecd9;
  --color-danger: #9a2f2c;
  --color-danger-soft: #f6e3e2;
  --color-info: #1f3a8a;
  --color-info-soft: #e7ecf8;
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.375rem;
  --text-2xl: 1.75rem;
  --text-3xl: 2.125rem;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 44px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --shadow-sm: 0 1px 2px rgba(15, 23, 34, 0.06), 0 1px 1px rgba(15, 23, 34, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 23, 34, 0.08);
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

html {
  box-sizing: border-box;
  background: var(--color-bg);
  font-size: 16px;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

body {
  margin: 0;
  min-width: 0;
  background: linear-gradient(180deg, #ffffff 0, var(--color-bg) 220px);
  color: var(--color-ink);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.5;
  overflow-x: hidden;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
textarea {
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

button,
.button-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: var(--color-accent);
  color: #ffffff;
  font-size: var(--text-sm);
  font-weight: 650;
  line-height: 1;
  transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

button:hover,
.button-link:hover {
  background: var(--color-accent-strong);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

button:active,
.button-link:active {
  transform: translateY(0);
}

input,
textarea {
  width: 100%;
  border: 1px solid var(--color-line-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  padding: 10px 12px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

textarea {
  min-height: 132px;
  resize: vertical;
}

button:focus-visible,
.button-link:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

input:focus-visible,
textarea:focus-visible {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(31, 58, 138, 0.14);
  outline: none;
}

h1,
h2,
h3,
p,
dd {
  margin: 0;
}

h1 {
  color: var(--color-ink-strong);
  font-size: var(--text-3xl);
  line-height: 1.08;
  letter-spacing: -0.02em;
  max-width: 20ch;
  text-wrap: balance;
}

h2 {
  color: var(--color-ink-strong);
  font-size: var(--text-lg);
  line-height: 1.25;
}

h3 {
  color: var(--color-ink-strong);
  font-size: var(--text-base);
  line-height: 1.35;
}

strong {
  font-weight: 700;
}

dd {
  color: var(--color-ink);
}

p,
.section-note {
  color: var(--color-muted);
  max-width: 64ch;
}

.skip-link {
  position: absolute;
  left: var(--space-4);
  top: var(--space-4);
  z-index: 20;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: #ffffff;
  font-size: var(--text-sm);
  font-weight: 700;
  transform: translateY(-160%);
  transition: transform 160ms ease;
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.app-shell {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  min-height: 100vh;
  min-width: 0;
}

.rail {
  position: sticky;
  top: 0;
  align-self: start;
  display: grid;
  gap: var(--space-6);
  min-width: 0;
  min-height: 100vh;
  padding: var(--space-6) var(--space-4);
  background: linear-gradient(180deg, var(--color-rail), var(--color-rail-2));
  color: var(--color-rail-ink);
}

.brand {
  display: grid;
  gap: var(--space-2);
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: #ffffff;
  font-size: var(--text-sm);
  font-weight: 800;
  letter-spacing: 0.02em;
}

.brand-title {
  color: var(--color-rail-ink);
  font-size: var(--text-lg);
  font-weight: 750;
  line-height: 1.2;
}

.brand-subtitle,
.rail-label {
  color: var(--color-rail-muted);
  font-size: var(--text-sm);
  line-height: 1.45;
}

.rail-nav {
  display: grid;
  gap: var(--space-2);
}

.rail-nav a {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-3);
  border-left: 3px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-rail-ink);
  font-size: var(--text-sm);
  font-weight: 650;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.rail-nav a:hover {
  background: rgba(255, 255, 255, 0.08);
}

.rail-nav a[aria-current="page"] {
  border-left-color: #6f8ad8;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.rail-nav a:focus-visible {
  outline-color: #c1d0f6;
}

.rail-status {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid rgba(255, 255, 255, 0.14);
}

.workspace {
  min-width: 0;
  width: min(100%, 1240px);
  margin: 0 auto;
  padding: var(--space-6);
}

.topbar,
.query-panel,
.answer-panel,
.audit-panel,
.evidence-section,
.auth-panel,
.report-panel,
.source-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.topbar {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.6fr);
  gap: var(--space-5);
  align-items: end;
  min-width: 0;
  margin-bottom: var(--space-4);
  padding: var(--space-6);
}

.topbar::after {
  content: "";
  display: block;
  grid-column: 1 / -1;
  width: 100%;
  height: 3px;
  border-radius: 999px;
  background: var(--color-accent);
}

.topbar p {
  color: var(--color-muted);
  font-size: var(--text-base);
}

.eyebrow {
  color: var(--color-accent-ink);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.metric {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

.metric span {
  color: var(--color-muted);
  font-size: var(--text-xs);
  line-height: 1.3;
}

.metric strong {
  color: var(--color-ink-strong);
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.query-panel,
.answer-panel,
.audit-panel {
  padding: var(--space-5);
}

.query-panel {
  margin-bottom: var(--space-4);
}

.query-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 120px 110px;
  gap: var(--space-3);
  align-items: end;
  min-width: 0;
}

.field {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.field label {
  color: var(--color-muted-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr);
  gap: var(--space-4);
  align-items: start;
  min-width: 0;
}

.primary-stack {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.answer-panel {
  min-width: 0;
}

.audit-panel {
  position: sticky;
  top: var(--space-6);
  min-width: 0;
  box-shadow: var(--shadow-md);
}

.section-head,
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  min-height: 44px;
}

.section-head {
  min-width: 0;
}

summary {
  color: var(--color-ink-strong);
  font-weight: 800;
  cursor: pointer;
  list-style: none;
}

summary::-webkit-details-marker {
  display: none;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 0 var(--space-2);
  border: 1px solid rgba(31, 58, 138, 0.18);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
  font-size: var(--text-xs);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.badge.is-positive {
  border-color: rgba(29, 107, 74, 0.2);
  background: var(--color-positive-soft);
  color: var(--color-positive);
}

.badge.is-warning,
.badge.warn {
  border-color: rgba(138, 90, 18, 0.22);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.badge.is-danger {
  border-color: rgba(154, 47, 44, 0.2);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.badge.is-info {
  border-color: rgba(31, 58, 138, 0.18);
  background: var(--color-info-soft);
  color: var(--color-accent-ink);
}

.answer-copy {
  display: grid;
  gap: var(--space-3);
  max-width: 70ch;
  color: var(--color-ink-strong);
  font-size: var(--text-md);
  line-height: 1.6;
}

.citation-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  margin-left: var(--space-2);
  padding: 0 var(--space-2);
  border: 1px solid rgba(31, 58, 138, 0.22);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  color: var(--color-accent-ink);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1;
  transition: background-color 160ms ease, box-shadow 160ms ease;
}

.citation-pill:hover {
  background: #dfe6f6;
}

.citation-pill:focus-visible {
  box-shadow: 0 0 0 3px rgba(31, 58, 138, 0.14);
}
`;
