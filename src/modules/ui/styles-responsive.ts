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
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    padding: var(--space-4);
  }

  .brand {
    align-content: start;
  }

  .rail-nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .rail-status {
    padding-top: 0;
    padding-left: var(--space-3);
    border-top: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.14);
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

  .status-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .rail-nav {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: var(--space-1);
  }

  .rail-nav a {
    flex: 0 0 auto;
  }

  .rail-status {
    display: none;
  }

  .workspace {
    padding: var(--space-3);
  }

  .topbar,
  .query-panel,
  .answer-panel,
  .audit-panel,
  .evidence-section,
  .auth-panel,
  .report-panel,
  .source-panel {
    padding: var(--space-4);
  }

  h1 {
    font-size: var(--text-xl);
  }

  .audit-proof,
  .evidence-grid {
    grid-template-columns: 1fr;
  }

  .status-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .metric {
    padding: var(--space-2);
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
    padding: var(--space-6) var(--space-3);
  }
}
`;
