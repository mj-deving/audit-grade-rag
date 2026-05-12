export const componentConsoleCss = `
.audit-proof {
  display: grid;
  grid-template-columns: 0.72fr 1fr;
  gap: 9px;
  margin-bottom: 14px;
}
.audit-proof div {
  min-width: 0;
  border-radius: 7px;
  padding: 12px;
  background: var(--rail);
  color: #eaf8f1;
}
.audit-proof span {
  display: block;
  color: #a9c2b6;
  font-size: 0.76rem;
}
.audit-proof strong {
  display: block;
  margin-top: 4px;
  color: #ffffff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9rem;
}
.audit-list,
.report-list,
.source-list,
.chunk-meta {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
}
.audit-list dt,
.report-list dt,
.source-list dt,
.chunk-meta dt {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 900;
}
.audit-list dd,
.report-list dd,
.source-list dd,
.chunk-meta dd {
  min-width: 0;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}
.replay-button {
  width: 100%;
  margin-top: 16px;
  background: #153c32;
}
.replay-result {
  display: grid;
  grid-template-columns: repeat(3, max-content);
  gap: 8px;
  margin-top: 12px;
}
.diff {
  grid-column: 1 / -1;
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 7px;
  padding: 10px;
  overflow: auto;
  background: #0d1712;
  color: #effff7;
  font-size: 0.82rem;
}
.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
}
.chunk-card {
  min-width: 0;
  min-height: 238px;
  display: grid;
  gap: 11px;
  align-content: start;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
  background: linear-gradient(180deg, #ffffff, var(--surface-2));
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}
.chunk-card:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-soft);
  transform: translateY(-1px);
}
.chunk-text {
  max-height: 112px;
  margin: 0;
  overflow: auto;
  color: #24302b;
}
.source-link {
  color: var(--blue);
  font-weight: 900;
  text-decoration: none;
}
.source-link:hover {
  text-decoration: underline;
}
.auth-shell,
.report-shell,
.source-shell {
  max-width: 980px;
  margin: 0 auto;
  padding: 36px 20px;
}
.auth-panel,
.report-panel,
.source-panel {
  display: grid;
  gap: 18px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr)) auto;
  gap: 12px;
  align-items: end;
}
mark {
  display: block;
  border-radius: 8px;
  padding: 18px;
  background: #fff6c7;
  color: #1d1d12;
}
`;
