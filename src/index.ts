export type { ReferenceApp } from "./app/reference-app.js";
export { createReferenceApp } from "./app/reference-app.js";
export type * from "./domain/types.js";
export type { JsonPrimitive, JsonRecord, JsonValue } from "./lib/canonical-json.js";
export { canonicalJson, toJsonValue } from "./lib/canonical-json.js";
export { logger } from "./lib/logger.js";
export type { MasterPrdContract } from "./lib/master-prd.js";
export { inspectMasterPrd, readMasterPrdContract } from "./lib/master-prd.js";
export { AuditLedger, verifyExportedLedgerEntries } from "./modules/audit/ledger.js";
export { AuthService, hashEmail, hashOperatorId, UnauthorizedError } from "./modules/auth/auth.js";
export type { EvalMetrics, EvalRun, ExpectedOutcome, GoldenCase } from "./modules/eval/eval.js";
export {
  defaultPassingEval,
  evaluateGoldenSet,
  loadGoldenSet,
  parseGoldenSet,
} from "./modules/eval/eval.js";
export {
  DeterministicStubProvider,
  defaultEmbeddingProfile,
  defaultPromptTemplate,
  defaultProviderProfile,
  EvidenceEchoProvider,
  generateAnswer,
  parseCitedClaims,
  renderPrompt,
  validateClaims,
} from "./modules/generation/generation.js";
export { IngestionStore } from "./modules/ingest/ingest.js";
export type { ReplayArtifacts, ReplayResult } from "./modules/replay/replay.js";
export { assertReplayPass, ReplayDriftError, replayLedgerEntry } from "./modules/replay/replay.js";
export type { Article50Report, ReportBundle, ReportRequest } from "./modules/report/report.js";
export { generateArticle50Report, reportWindowLabel } from "./modules/report/report.js";
export { parseTopK, reciprocalRankFusion, retrieveChunks } from "./modules/retrieval/retrieval.js";
export {
  assertNoPromptSecrets,
  isEgressAllowed,
  redactOperationalMeta,
} from "./modules/security/redaction.js";
export type { ConsoleView } from "./modules/ui/console.js";
export {
  germanCopy,
  renderAuthOperator,
  renderConsole,
  renderReportView,
  renderSourceViewer,
} from "./modules/ui/console.js";
