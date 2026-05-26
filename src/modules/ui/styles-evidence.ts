export const evidenceConsoleCss = `
.audit-proof {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  margin-bottom: var(--space-5);
  border-top: 1px solid var(--column-rule);
  border-bottom: 1px solid var(--column-rule);
}

.audit-proof div {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4) var(--space-3) var(--space-4) 0;
  border-right: 1px solid var(--column-rule);
}

.audit-proof div:last-child {
  border-right: 0;
  padding-left: var(--space-4);
}

.audit-proof span {
  color: var(--column-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  line-height: 1.3;
}

.audit-proof strong {
  color: var(--column-ink);
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.005em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.audit-list,
.report-list,
.source-list,
.chunk-meta {
  display: grid;
  grid-template-columns: minmax(110px, 0.4fr) minmax(0, 1fr);
  gap: 0;
}

.audit-list dt,
.report-list dt,
.source-list dt,
.chunk-meta dt {
  padding: var(--space-3) var(--space-3) var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  line-height: 1.4;
}

.audit-list dd,
.report-list dd,
.source-list dd,
.chunk-meta dd {
  min-width: 0;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.audit-list dt:last-of-type,
.report-list dt:last-of-type,
.source-list dt:last-of-type,
.chunk-meta dt:last-of-type,
.audit-list dd:last-of-type,
.report-list dd:last-of-type,
.source-list dd:last-of-type,
.chunk-meta dd:last-of-type {
  border-bottom: 0;
}

.audit-panel .audit-list dt {
  color: var(--column-muted);
  border-bottom-color: var(--column-rule);
}

.audit-panel .audit-list dd {
  color: var(--column-ink);
  border-bottom-color: var(--column-rule);
}

.replay-form {
  margin-top: var(--space-5);
}

.replay-button {
  width: 100%;
  background: transparent;
  border-color: var(--column-ink);
  color: var(--column-ink);
}

.replay-button:hover {
  background: var(--column-ink);
  color: var(--column);
  border-color: var(--column-ink);
}

.replay-button:focus-visible {
  outline-color: var(--column-ink);
}

.replay-legend {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--column-rule);
}

.replay-legend .legend-title {
  color: var(--column-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  margin-bottom: var(--space-3);
}

.replay-legend ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.replay-legend li {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  color: var(--column-ink);
  font-size: var(--text-sm);
  line-height: 1.45;
}

.replay-result {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
  min-width: 0;
}

.diff {
  grid-column: 1 / -1;
  margin: 0;
  padding: var(--space-3);
  background: var(--paper-3);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.55;
  overflow: auto;
  border-left: 3px solid var(--seal);
}

.evidence-section {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5) 0;
  border-top: var(--rule-w) solid var(--rule);
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-5);
  min-width: 0;
}

.chunk-card {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4) 0 var(--space-5);
  border-top: 1px solid var(--ink);
  background: transparent;
  transition: background-color 200ms ease;
  position: relative;
}

.chunk-card::before {
  content: "";
  position: absolute;
  top: -1px;
  left: 0;
  width: 28px;
  height: 2px;
  background: var(--seal);
}

.chunk-card:hover {
  background: var(--paper-2);
}

.chunk-text {
  max-height: 132px;
  min-width: 0;
  overflow: auto;
  padding-left: var(--space-3);
  border-left: 1px solid var(--rule);
  color: var(--ink-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-style: italic;
  line-height: 1.6;
}

.source-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--seal);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  text-decoration: none;
  border-bottom: 1px solid var(--seal);
  padding-bottom: 2px;
  align-self: start;
}

.source-link::after {
  content: "→";
  font-family: var(--font-body);
  letter-spacing: 0;
}

.source-link:hover {
  color: var(--seal-2);
  border-bottom-color: var(--seal-2);
}

.auth-shell,
.report-shell,
.source-shell {
  width: min(100%, 760px);
  margin: 0 auto;
  padding: var(--space-8) var(--space-5);
}

.auth-panel,
.report-panel,
.source-panel {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-7) 0;
  border-top: var(--rule-w-strong) solid var(--ink);
  border-bottom: var(--rule-w-strong) solid var(--ink);
  position: relative;
}

.auth-panel::before,
.report-panel::before,
.source-panel::before {
  content: "";
  position: absolute;
  top: -4px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--ink);
}

.auth-panel::after,
.report-panel::after,
.source-panel::after {
  content: "";
  position: absolute;
  bottom: -4px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--ink);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr)) auto;
  gap: var(--space-5);
  align-items: end;
  min-width: 0;
}

mark {
  display: block;
  padding: var(--space-5);
  background: var(--paper-3);
  color: var(--ink);
  font-family: var(--font-body);
  font-style: italic;
  font-size: var(--text-md);
  line-height: 1.7;
  border-left: 3px solid var(--seal);
}

.status-callout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--ink);
  background: var(--paper);
  position: relative;
}

.status-callout::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 4px;
  background: var(--ink);
}

.status-callout.answered {
  border-color: var(--stamp-green);
  background: var(--stamp-green-wash);
}

.status-callout.answered::before {
  background: var(--stamp-green);
}

.status-callout.refused {
  border-color: var(--stamp-amber);
  background: var(--stamp-amber-wash);
}

.status-callout.refused::before {
  background: var(--stamp-amber);
}

.status-callout.blocked {
  border-color: var(--stamp-red);
  background: var(--stamp-red-wash);
}

.status-callout.blocked::before {
  background: var(--stamp-red);
}

.status-callout.error {
  border-color: var(--stamp-red);
  background: var(--stamp-red-wash);
}

.status-callout.error::before {
  background: var(--stamp-red);
}

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  font-style: italic;
  line-height: 1;
  flex-shrink: 0;
}

.status-callout.answered .status-icon {
  color: var(--stamp-green);
}

.status-callout.refused .status-icon {
  color: var(--stamp-amber);
}

.status-callout.blocked .status-icon,
.status-callout.error .status-icon {
  color: var(--stamp-red);
}

.status-title {
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--ink);
  margin-bottom: var(--space-1);
}

.status-body {
  color: var(--ink-2);
  font-size: var(--text-sm);
  line-height: 1.6;
  font-style: italic;
}

.disclaimer {
  color: var(--ink-faint);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-style: italic;
  line-height: 1.6;
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule);
}
`;
