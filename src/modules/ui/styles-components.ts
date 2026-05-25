export const componentConsoleCss = `
.audit-proof {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.audit-proof div {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-rail);
  color: var(--color-rail-ink);
}

.audit-proof span {
  color: var(--color-rail-muted);
  font-size: var(--text-xs);
  line-height: 1.3;
}

.audit-proof strong {
  color: #ffffff;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.audit-list,
.report-list,
.source-list,
.chunk-meta {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--space-2) var(--space-3);
  align-items: start;
}

.audit-list dt,
.report-list dt,
.source-list dt,
.chunk-meta dt {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-line);
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 700;
  line-height: 1.35;
}

.audit-list dd,
.report-list dd,
.source-list dd,
.chunk-meta dd {
  min-width: 0;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-line);
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.replay-button {
  width: 100%;
  background: var(--color-rail);
  color: var(--color-rail-ink);
}

.replay-button:hover {
  background: var(--color-rail-2);
}

.replay-button:focus-visible {
  outline-color: #c1d0f6;
}

.replay-result {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
  min-width: 0;
}

.diff {
  grid-column: 1 / -1;
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-rail);
  color: #e7ebf2;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.55;
  overflow: auto;
}

.evidence-section {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-3);
  min-width: 0;
}

.chunk-card {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.chunk-card:hover {
  border-color: var(--color-line-strong);
  box-shadow: var(--shadow-sm);
}

.chunk-text {
  max-height: 120px;
  min-width: 0;
  overflow: auto;
  color: var(--color-ink);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.source-link {
  color: var(--color-accent-ink);
  font-size: var(--text-sm);
  font-weight: 700;
  text-decoration: none;
}

.source-link:hover {
  text-decoration: underline;
}

.auth-shell,
.report-shell,
.source-shell {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: var(--space-7) var(--space-5);
}

.auth-panel,
.report-panel,
.source-panel {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-6);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr)) auto;
  gap: var(--space-3);
  align-items: end;
  min-width: 0;
}

mark {
  display: block;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-warning-soft);
  color: var(--color-ink-strong);
  line-height: 1.6;
}

.notice {
  padding: var(--space-4);
  border: 1px solid var(--color-line);
  border-left: 4px solid var(--color-muted);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  color: var(--color-ink);
}

.notice.is-positive {
  border-left-color: var(--color-positive);
  background: var(--color-positive-soft);
}

.notice.is-warning {
  border-left-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.notice.is-danger {
  border-left-color: var(--color-danger);
  background: var(--color-danger-soft);
}

.notice.is-info {
  border-left-color: var(--color-accent);
  background: var(--color-info-soft);
}

.notice-label {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--color-muted-strong);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.notice.is-positive .notice-label {
  color: var(--color-positive);
}

.notice.is-warning .notice-label {
  color: var(--color-warning);
}

.notice.is-danger .notice-label {
  color: var(--color-danger);
}

.notice.is-info .notice-label {
  color: var(--color-accent-ink);
}
`;
