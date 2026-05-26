export const shellConsoleCss = `
.app-shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
  min-width: 0;
}

.rail {
  position: sticky;
  top: 0;
  align-self: start;
  display: grid;
  gap: var(--space-7);
  min-width: 0;
  min-height: 100vh;
  padding: var(--space-7) var(--space-5);
  background: var(--paper-2);
  border-right: var(--rule-w) solid var(--rule);
  color: var(--ink);
}

.rail::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  right: -1px;
  width: 4px;
  background:
    linear-gradient(180deg, var(--seal) 0 6%, transparent 6%);
  pointer-events: none;
}

.brand {
  display: grid;
  gap: var(--space-3);
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: var(--rule-w-strong) solid var(--ink);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  font-style: italic;
  letter-spacing: -0.04em;
  position: relative;
}

.brand-mark::after {
  content: "";
  position: absolute;
  inset: 4px;
  border: 1px solid var(--ink);
  pointer-events: none;
}

.brand-title {
  color: var(--ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.005em;
}

.brand-subtitle {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  font-weight: 500;
  line-height: 1.4;
}

.rail-label {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: var(--space-2);
}

.rail-nav {
  display: grid;
  gap: 0;
  border-top: var(--rule-w) solid var(--rule);
  border-bottom: var(--rule-w) solid var(--rule);
}

.rail-nav a {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 var(--space-3) 0 var(--space-4);
  border-bottom: 1px solid var(--rule);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 500;
  letter-spacing: 0.005em;
  transition: color 160ms ease, background-color 160ms ease;
}

.rail-nav a:last-child {
  border-bottom: 0;
}

.rail-nav a::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 0;
  height: 1.5px;
  background: var(--seal);
  transform: translateY(-50%);
  transition: width 220ms ease;
}

.rail-nav a:hover {
  color: var(--seal);
  background: rgba(122, 31, 31, 0.04);
}

.rail-nav a:hover::before {
  width: 10px;
}

.rail-nav a[aria-current="page"] {
  color: var(--seal);
  background: rgba(122, 31, 31, 0.06);
  font-style: italic;
}

.rail-nav a[aria-current="page"]::before {
  width: 10px;
}

.rail-nav a:focus-visible {
  outline-color: var(--seal);
}

.rail-status {
  display: grid;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: var(--rule-w) solid var(--rule);
}

.rail-status strong {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1.6;
  text-transform: lowercase;
}

.workspace {
  min-width: 0;
  width: min(100%, 1280px);
  margin: 0 auto;
  padding: var(--space-7) var(--space-7) var(--space-8);
}

.topbar {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.6fr);
  gap: var(--space-7);
  align-items: end;
  min-width: 0;
  margin-bottom: var(--space-6);
  padding: var(--space-3) 0 var(--space-5);
  border-bottom: var(--rule-w-strong) solid var(--ink);
}

.topbar::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -6px;
  height: 1px;
  background: var(--ink);
}

.topbar p {
  color: var(--ink-3);
  font-size: var(--text-md);
  line-height: 1.55;
  max-width: 56ch;
  margin-top: var(--space-3);
  font-style: italic;
}

.eyebrow {
  color: var(--seal);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  margin-bottom: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.eyebrow::before {
  content: "§";
  font-family: var(--font-display);
  font-style: italic;
  font-size: 1.05rem;
  letter-spacing: 0;
  line-height: 1;
  color: var(--seal);
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border: var(--rule-w) solid var(--ink);
  background: var(--paper);
}

.metric {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border-right: var(--rule-w) solid var(--rule-strong);
}

.metric:last-child {
  border-right: 0;
}

.metric span {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  line-height: 1.3;
}

.metric strong {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
`;
