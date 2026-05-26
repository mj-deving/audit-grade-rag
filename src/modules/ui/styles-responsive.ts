export const responsiveConsoleCss = `
.workspace > *,
.primary-stack > *,
.main-grid > *,
.topbar > *,
.query-grid > *,
.form-grid > *,
.status-strip > * {
  min-width: 0;
}

@media (max-width: 980px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .rail {
    position: static;
    min-height: auto;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-5);
    border-right: 0;
    border-bottom: var(--rule-w-strong) solid var(--ink);
  }

  .rail::before {
    inset: auto 0 0 0;
    width: auto;
    height: 4px;
    background: linear-gradient(90deg, var(--seal) 0 6%, transparent 6%);
  }

  .brand {
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3);
    align-items: center;
  }

  .rail-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border: 0;
  }

  .rail-nav a {
    flex: 0 0 auto;
    border-bottom: 0;
    border-right: 1px solid var(--rule);
    padding: 0 var(--space-4);
    min-height: 40px;
  }

  .rail-nav a:last-child {
    border-right: 0;
  }

  .rail-status {
    grid-column: 1 / -1;
    padding-top: var(--space-3);
    border-top: 1px solid var(--rule);
  }

  .workspace {
    padding: var(--space-5);
  }

  .topbar,
  .main-grid,
  .query-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .audit-panel {
    position: static;
    top: auto;
  }
}

@media (max-width: 640px) {
  body,
  .app-shell {
    overflow-x: hidden;
  }

  body {
    font-size: 15px;
  }

  .rail {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }

  .brand {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .brand-mark {
    width: 52px;
    height: 52px;
    font-size: 1.25rem;
  }

  .rail-nav {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: var(--space-1);
  }

  .rail-status {
    display: none;
  }

  .workspace {
    padding: var(--space-4);
  }

  .topbar,
  .query-panel,
  .answer-panel,
  .audit-panel,
  .evidence-section,
  .auth-panel,
  .report-panel,
  .source-panel {
    padding-left: 0;
    padding-right: 0;
  }

  .audit-panel {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }

  h1 {
    font-size: var(--text-xl);
  }

  .audit-proof {
    grid-template-columns: 1fr;
  }

  .audit-proof div {
    border-right: 0;
    border-bottom: 1px solid var(--column-rule);
    padding: var(--space-3) 0;
  }

  .audit-proof div:last-child {
    border-bottom: 0;
    padding-left: 0;
  }

  .evidence-grid {
    grid-template-columns: 1fr;
  }

  .status-strip {
    grid-template-columns: 1fr;
  }

  .metric {
    border-right: 0;
    border-bottom: 1px solid var(--rule-strong);
  }

  .metric:last-child {
    border-bottom: 0;
  }

  .audit-list,
  .report-list,
  .source-list,
  .chunk-meta {
    grid-template-columns: 94px minmax(0, 1fr);
  }

  .section-head,
  summary {
    flex-wrap: wrap;
  }

  button,
  .button-link,
  .rail-nav a,
  input,
  textarea,
  summary {
    min-height: 44px;
  }

  .auth-shell,
  .report-shell,
  .source-shell {
    padding: var(--space-6) var(--space-4);
  }

  .answer-copy p:first-child::first-letter {
    font-size: 2.4em;
  }
}
`;
