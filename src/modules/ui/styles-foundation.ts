export const foundationConsoleCss = `
:root {
  color-scheme: light;
  --paper: #f4ede0;
  --paper-2: #efe6d4;
  --paper-3: #e8dcc4;
  --paper-edge: #d8c9a8;
  --ink: #14110d;
  --ink-2: #2a241c;
  --ink-3: #4a4135;
  --ink-muted: #6b5f4d;
  --ink-faint: #8a7c66;
  --rule: #c9b993;
  --rule-strong: #8a7c66;
  --rule-hair: rgba(20, 17, 13, 0.18);
  --seal: #7a1f1f;
  --seal-2: #5e1313;
  --seal-ink: #f4ede0;
  --seal-wash: #ecd9d4;
  --stamp-green: #355c3a;
  --stamp-green-wash: #dfe7d8;
  --stamp-amber: #8a5a12;
  --stamp-amber-wash: #f1e2bf;
  --stamp-red: #7a1f1f;
  --stamp-red-wash: #ecd9d4;
  --column: #1a1612;
  --column-ink: #f0e4cd;
  --column-muted: #b8a98a;
  --column-rule: rgba(240, 228, 205, 0.18);
  --text-xs: 0.6875rem;
  --text-sm: 0.8125rem;
  --text-base: 0.9375rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;
  --text-3xl: 2.875rem;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 22px;
  --space-6: 28px;
  --space-7: 40px;
  --space-8: 56px;
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --rule-w: 1px;
  --rule-w-strong: 2px;
  --shadow-deep: 0 1px 0 rgba(20, 17, 13, 0.06), 0 18px 28px -22px rgba(20, 17, 13, 0.22);
  --font-display: "Hoefler Text", "Garamond Premier Pro", "Adobe Caslon Pro", "Sorts Mill Goddy", Garamond, Georgia, "Times New Roman", serif;
  --font-body: Georgia, "Hoefler Text", "Iowan Old Style", "Charter", "Cambria", "Times New Roman", serif;
  --font-mono: "JetBrains Mono", "IBM Plex Mono", "Berkeley Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace;
  --tracking-wide: 0.18em;
  --tracking-wider: 0.26em;
}

html {
  box-sizing: border-box;
  background: var(--paper);
  font-size: 16px;
  line-height: 1.55;
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

body {
  margin: 0;
  min-width: 0;
  background:
    radial-gradient(120% 60% at 50% -10%, rgba(20, 17, 13, 0.05), transparent 70%),
    radial-gradient(80% 80% at 100% 100%, rgba(122, 31, 31, 0.04), transparent 60%),
    repeating-linear-gradient(45deg, rgba(20, 17, 13, 0.012) 0 2px, transparent 2px 4px),
    var(--paper);
  color: var(--ink-2);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.6;
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
  color: inherit;
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
  min-height: 44px;
  padding: 0 var(--space-5);
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  line-height: 1;
  transition: background-color 180ms ease, color 180ms ease, transform 180ms ease;
}

button:hover,
.button-link:hover {
  background: var(--seal);
  border-color: var(--seal);
  color: var(--paper);
  transform: translateY(-1px);
}

button:active,
.button-link:active {
  transform: translateY(0);
}

button.secondary,
.button-link.secondary {
  background: transparent;
  color: var(--ink);
}

button.secondary:hover,
.button-link.secondary:hover {
  background: var(--ink);
  color: var(--paper);
}

input,
textarea {
  width: 100%;
  border: 0;
  border-bottom: var(--rule-w-strong) solid var(--ink);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  padding: 10px 2px;
  font-family: var(--font-body);
  font-size: var(--text-md);
  transition: border-color 160ms ease, background-color 160ms ease;
}

textarea {
  min-height: 132px;
  resize: vertical;
  padding: var(--space-3) 2px;
  line-height: 1.6;
}

button:focus-visible,
.button-link:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--seal);
  outline-offset: 3px;
}

input:focus-visible,
textarea:focus-visible {
  outline: none;
  border-bottom-color: var(--seal);
  background: rgba(122, 31, 31, 0.04);
}

h1,
h2,
h3,
p,
dd {
  margin: 0;
}

h1 {
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 500;
  font-style: normal;
  font-size: var(--text-3xl);
  line-height: 1.04;
  letter-spacing: -0.012em;
  max-width: 22ch;
  text-wrap: balance;
}

h1 em {
  color: var(--seal);
  font-style: italic;
  font-weight: 500;
}

h2 {
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--text-lg);
  letter-spacing: 0.005em;
  line-height: 1.2;
}

h3 {
  color: var(--ink);
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: var(--text-sm);
  letter-spacing: 0.02em;
  line-height: 1.35;
}

strong {
  font-weight: 700;
}

dd {
  color: var(--ink-2);
}

p,
.section-note {
  color: var(--ink-3);
  max-width: 64ch;
  font-size: var(--text-base);
  line-height: 1.65;
}

.section-note {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  font-weight: 500;
}

.skip-link {
  position: absolute;
  left: var(--space-4);
  top: var(--space-4);
  z-index: 20;
  padding: var(--space-2) var(--space-3);
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  font-weight: 600;
  transform: translateY(-160%);
  transition: transform 160ms ease;
}

.skip-link:focus-visible {
  transform: translateY(0);
}
`;
