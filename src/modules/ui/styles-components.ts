export const componentConsoleCss = `
.query-panel,
.answer-panel,
.audit-panel,
.evidence-section,
.auth-panel,
.report-panel,
.source-panel {
  background: transparent;
  border: 0;
}

.query-panel {
  margin-bottom: var(--space-6);
  padding: 0 0 var(--space-6);
  border-bottom: var(--rule-w) solid var(--rule);
}

.query-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 110px 140px;
  gap: var(--space-5);
  align-items: end;
  min-width: 0;
}

.field {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.field label {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.75fr);
  gap: var(--space-7);
  align-items: start;
  min-width: 0;
}

.primary-stack {
  display: grid;
  gap: var(--space-6);
  min-width: 0;
}

.answer-panel {
  min-width: 0;
  padding: var(--space-5) 0;
  border-top: var(--rule-w) solid var(--rule);
}

.audit-panel {
  position: sticky;
  top: var(--space-6);
  min-width: 0;
  padding: var(--space-5) var(--space-5) var(--space-6);
  background: var(--column);
  color: var(--column-ink);
  border: var(--rule-w-strong) solid var(--ink);
  box-shadow: var(--shadow-deep);
}

.audit-panel::before {
  content: "";
  display: block;
  width: 28px;
  height: 1.5px;
  background: var(--column-ink);
  margin-bottom: var(--space-4);
}

.audit-panel h2 {
  color: var(--column-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
}

.audit-panel .section-note {
  color: var(--column-muted);
}

.section-head,
summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  min-height: 32px;
}

.section-head {
  min-width: 0;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

.audit-panel .section-head {
  border-bottom-color: var(--column-rule);
}

summary {
  color: var(--ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--rule);
}

summary::-webkit-details-marker {
  display: none;
}

summary::after {
  content: "[ + ]";
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.04em;
  color: var(--ink-faint);
  margin-left: var(--space-2);
}

details[open] > summary::after {
  content: "[ − ]";
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 var(--space-3);
  border: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  line-height: 1;
  white-space: nowrap;
}

.badge.accent {
  border-color: var(--seal);
  color: var(--seal);
}

.badge.ok,
.badge.is-positive {
  border-color: var(--stamp-green);
  background: var(--stamp-green-wash);
  color: var(--stamp-green);
}

.badge.is-warning,
.badge.warn {
  border-color: var(--stamp-amber);
  background: var(--stamp-amber-wash);
  color: var(--stamp-amber);
}

.badge.danger,
.badge.is-danger {
  border-color: var(--stamp-red);
  background: var(--stamp-red-wash);
  color: var(--stamp-red);
}

.badge.is-info {
  border-color: var(--ink);
  background: transparent;
  color: var(--ink);
}

.audit-panel .badge {
  border-color: var(--column-ink);
  color: var(--column-ink);
}

.audit-panel .badge.ok {
  border-color: var(--stamp-green-wash);
  background: var(--stamp-green-wash);
  color: var(--stamp-green);
}

.audit-panel .badge.warn {
  border-color: var(--stamp-amber-wash);
  background: var(--stamp-amber-wash);
  color: var(--stamp-amber);
}

.audit-panel .badge.danger {
  border-color: var(--stamp-red-wash);
  background: var(--stamp-red-wash);
  color: var(--stamp-red);
}

.answer-copy {
  display: grid;
  gap: var(--space-4);
  max-width: 68ch;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: 1.7;
}

.answer-copy p {
  color: var(--ink);
  font-size: var(--text-md);
  text-indent: 1.5em;
}

.answer-copy p:first-child {
  text-indent: 0;
}

.answer-copy p:first-child::first-letter {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 3.2em;
  line-height: 0.85;
  float: left;
  margin: 0.05em 0.1em 0 -0.04em;
  color: var(--seal);
}

.answer-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--stamp-green);
  background: var(--stamp-green-wash);
  color: var(--stamp-green);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

.answer-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--stamp-green);
  display: inline-block;
}

.citation-pill {
  display: inline-flex;
  align-items: baseline;
  margin: 0 1px 0 4px;
  padding: 0 5px;
  border: 0;
  background: transparent;
  color: var(--seal);
  font-family: var(--font-mono);
  font-size: 0.78em;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  text-decoration: none;
  border-bottom: 1px dotted var(--seal);
  transition: background-color 160ms ease, color 160ms ease;
}

.citation-pill::before {
  content: "[";
  margin-right: 1px;
  color: var(--ink-faint);
}

.citation-pill::after {
  content: "]";
  margin-left: 1px;
  color: var(--ink-faint);
}

.citation-pill:hover {
  background: var(--seal-wash);
  color: var(--seal-2);
}

.citation-pill:focus-visible {
  outline-color: var(--seal);
}
`;
