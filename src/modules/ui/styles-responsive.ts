export const responsiveConsoleCss = `
@media (max-width: 980px) {
  .app-shell {
    grid-template-columns: 1fr;
  }
  .rail {
    position: static;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 14px 16px;
  }
  .brand {
    margin: 0;
  }
  .rail-nav {
    grid-template-columns: repeat(3, minmax(0, auto));
    grid-column: 1 / -1;
  }
  .rail-status {
    margin: 0;
    padding: 0;
    border-top: 0;
    text-align: right;
  }
  .rail-status strong {
    max-width: 22ch;
  }
  .workspace {
    max-width: 100%;
    padding: 16px;
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
  .metric:last-child {
    grid-column: 1 / -1;
  }
  .audit-panel {
    position: static;
  }
}
@media (max-width: 640px) {
  body {
    font-size: 15px;
  }
  .rail {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 12px;
  }
  .brand {
    grid-template-columns: 38px minmax(0, 1fr);
  }
  .brand-mark {
    width: 38px;
    height: 38px;
  }
  .rail-nav {
    display: flex;
    gap: 8px;
    max-width: 100%;
    overflow-x: auto;
  }
  .rail-nav a {
    min-width: max-content;
    padding: 8px 10px;
  }
  .rail-status {
    display: none;
  }
  .workspace {
    padding: 12px 10px;
  }
  .topbar,
  .query-panel,
  .answer-panel,
  .audit-panel,
  .evidence-section,
  .auth-panel,
  .report-panel,
  .source-panel {
    padding: 14px;
  }
  .topbar {
    gap: 12px;
  }
  .topbar p,
  .section-note {
    max-width: 100%;
  }
  h1 {
    max-width: 20ch;
    font-size: 1.34rem;
    line-height: 1.08;
  }
  .audit-proof,
  .evidence-grid {
    grid-template-columns: 1fr;
  }
  .status-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .metric {
    min-height: 58px;
    padding: 8px;
  }
  .metric span {
    font-size: 0.72rem;
  }
  .metric strong {
    font-size: 0.8rem;
  }
  .section-head {
    flex-wrap: wrap;
  }
  .section-head > .badge,
  summary .section-note {
    display: none;
  }
  .query-panel {
    margin-bottom: 12px;
  }
  .main-grid,
  .primary-stack {
    gap: 12px;
  }
  .audit-list,
  .report-list,
  .source-list,
  .chunk-meta {
    grid-template-columns: 94px minmax(0, 1fr);
  }
}
`;
