---
task: "Audit-Grade RAG — EU-regulated-industries knowledge assistant"
slug: 20260510-091500_audit-grade-rag-v1
project: audit-grade-rag
effort: comprehensive
effort_source: explicit
phase: observe
progress: 0/0
mode: interactive
started: 2026-05-10T09:15:00+02:00
updated: 2026-05-10T09:15:00+02:00
---

## Problem

Off-the-shelf retrieval-augmented-generation products (LangChain Cloud, LlamaIndex Cloud, Vectara, the major US hyperscaler RAG offerings) ship as "ask your documents" demos: a chunker, a vector store, a model, a chat UI. They do not ship the artifacts a regulated DACH organisation — Bank, Versicherung, pharmazeutisches Unternehmen, Behörde — needs to put a RAG system into production under BaFin MaRisk, EU AI Act, DSGVO, GxP, or EBA-Leitlinien scrutiny: chunk-level provenance attached to every retrieved span, an immutable hash-chained audit ledger every regulator can replay, deterministic re-execution of any past answer bit-for-bit (frozen seed + frozen model version + frozen prompt version), an evaluation harness with adversarial cases that distinguishes "groundedness" from "fluent hallucination", and a regulator-shaped report (initially: EU AI Act §50 transparency disclosure) that compliance can hand to an auditor without translating engineer-shaped logs into compliance-shaped narratives by hand. The pattern in the German market today is either "we don't ship RAG to production because compliance won't sign off" or "we built a one-off internal tool whose audit story is whatever the team had time to build, which is rarely enough." There is no credible open-source-first project filling the gap; the few commercial vendors who claim "compliance-grade RAG" charge enterprise prices for what is largely a slide-deck claim, not a reproducible-from-source system. This project is the engineer-built reference implementation that closes the gap, scoped to one corpus + one regulator-shaped report for v1 so that the PRD-able scope is finite and the result is demo-able to both engineering interviewers (G3 / Festanstellung evidence) and prospective customers (G6 / commercial PAI).

## Vision

A self-hostable Next.js + Hono application at `audit-grade-rag.example.local` where a compliance officer pastes a question, the operator console shows the answer with every claim citation-linked to the exact chunk in the exact source PDF page, the audit trail panel shows the SHA-256 hash chain entry that records the (query, retrieved chunks, generated answer, model version, prompt version, seed, timestamp, user) tuple, the "Replay" button reproduces the answer bit-for-bit from that ledger entry six months later, the "Generate AI Act §50 disclosure" button emits a regulator-shaped PDF the BaFin/BaSt/Aufsichtsbehörde can read without translation, and the eval-harness dashboard shows current groundedness / citation-accuracy / refusal-correctness scores against a versioned golden set with adversarial cases. Euphoric surprise: a Sparkasse compliance team that previously told their developers "RAG is forbidden until compliance signs off" runs this against a sample BaFin-Rundschreiben corpus on Monday, generates the §50 disclosure on Tuesday, and on Wednesday the Bereichsleiter-Compliance asks engineering to deploy it across the whole Beratungsabteilung — because the audit story is no longer hand-waving but an open-source-auditable system the Innenrevision can read.

## Out of Scope

- **No multi-tenant SaaS in v1.** Single-tenant self-host only. The audit story is dramatically simpler when one organisation owns the data, the keys, and the ledger; multi-tenant data-residency, tenant key isolation, and per-tenant audit-export are deferred to v2.
- **No billing, usage metering, or per-seat licensing.** v1 is licensable as a one-time-fee or commercial-friendly OSS license; per-seat metering is a separate concern when SaaS lands.
- **No SSO / SAML / OIDC in v1.** Operator console uses email + WebAuthn passkey only. Enterprise SSO is the second-most-requested integration but adds materially to the auth attack surface; v1.1 ships SSO via a single battle-tested library (Auth.js + Auth0/Authentik adapter), not a homegrown stack.
- **No custom embedding training.** v1 ships with one open-source default (`bge-m3` recommended; `jina-embeddings-v3` as the alternative for German-heavy corpora) behind a provider-pluggable interface so a customer can swap to their own on-prem model. Training pipelines are out of scope.
- **No multi-corpus federation.** v1 is one corpus per deployment. Cross-corpus queries, federation routers, and cross-corpus citation reconciliation are explicitly out of scope.
- **No multi-language operator UI in v1.** Operator console is German-only at launch; corpus content can be multilingual via the embedding model. English UI is v1.1.
- **No native iOS / Android / desktop applications.** Web only.
- **No alternative regulator report formats in v1.** The PRD ships exactly one: EU AI Act §50 transparency disclosure. BaFin MaRisk AT 4.4-style summary, EBA-Leitlinien evidence packs, and FDA 21 CFR Part 11 attestations are added one-at-a-time post-v1, each behind its own ISC pack.
- **No real-time collaborative answer drafting.** The operator console is a single-user-at-a-time tool in v1; collaborative review is out of scope.
- **No automatic doc-ingestion from email / SharePoint / Confluence.** v1 ingests from a watched filesystem directory; integration adapters are v1.1+.
- **No model-fine-tuning in scope.** The product is RAG-with-rigorous-grounding; fine-tuning a base model on the corpus is a different engineering project and would change the audit story (a fine-tuned model is itself an in-scope artifact under EU AI Act high-risk classification).
- **No retrieval over images or audio in v1.** Text + tables in PDFs, DOCX, and Markdown are the supported corpus types. OCR for scanned PDFs is in scope (via tesseract); image-to-text retrieval is not.

## Principles

- **Audit is a property, not a feature.** Every architectural choice is judged against whether it makes the audit story easier or harder to attest to. If a design choice makes the system faster but the audit log shallower, the audit log wins.
- **Provenance is per-claim, not per-answer.** "Groundedness" is the claim that every assertion in a generated answer points to a specific retrieved span. Per-answer citation links are theatre; per-claim citations are the contract.
- **Determinism beats convenience.** A regulator must be able to replay any past answer bit-for-bit. Any source of nondeterminism (LLM sampling, retrieval randomness, embedding-model upgrades, prompt-template drift) is either eliminated, frozen-and-versioned, or surfaced in the audit ledger.
- **The audit ledger is append-only and authoritative.** If an action is not in the ledger, it did not happen. If it is in the ledger, it cannot be edited. Hash chaining is non-negotiable.
- **Refusal is a feature.** A correct refusal on an out-of-corpus question scores higher than a fluent fabrication. The eval harness rewards correct refusals.
- **Open-source-auditable beats opaque-but-claimed.** Every compliance claim the system makes is backed by code a regulator's IT-Revision can read. No black-box "compliance scoring" components.
- **DACH-market constraints are first-class.** Data residency in EU regions, DSGVO-conformant logging (no PHI/PII in DEBUG logs), German UI for the operator console, German+English error messages, and ICS/MEZ timestamps are not "i18n add-ons" — they are baseline.
- **Operability is a deliverable.** A feature is not done when it works in dev; it is done when an operator can diagnose its failures from the dashboard and run the documented runbook.
- **Self-hostable means actually self-hostable.** No required SaaS dependencies in the critical path. The default install must work air-gapped except for outbound LLM calls (and even those must have a documented on-prem fallback path via vLLM).

## Constraints

- **Stack:** TypeScript end-to-end. Backend on Node 22 with Hono (preferred over Fastify for its smaller surface and middleware ergonomics around the audit-pipeline). Frontend Next.js 15 (App Router) + shadcn/ui + Tailwind. No Python services in the critical path.
- **Storage — retrieval:** Postgres 16 + `pgvector` ≥ 0.7 (HNSW index). No managed-vector-DB-only option (Pinecone/Weaviate/Qdrant Cloud) in v1. Self-host-first.
- **Storage — audit ledger:** SQLite (WAL mode) per deployment, hash-chained, signed, exportable as a single sealed `.sqlite + .sig` artifact for regulator hand-off. Postgres for the audit ledger is permitted as an opt-in for high-volume deployments but SQLite is the default — single-file is half the audit story.
- **Embedding model:** Default `bge-m3` (1024-dim, multilingual, strong on German). `jina-embeddings-v3` supported for German-heavy corpora. Provider interface pluggable; on-prem German models (Aleph Alpha Pharia, T-Systems OpenTelekomCloud Embedding) must be swap-in via config.
- **LLM provider:** Anthropic Claude Sonnet 4.6 default via the SDK. Provider interface compatible with on-prem vLLM serving any HuggingFace causal-LM that exposes an OpenAI-compatible API (Mistral-Large-Instruct, Llama-3.3-70B, Mixtral-8x22B). No silent fallback — provider is config-frozen per deployment.
- **Determinism:** All LLM calls pass `temperature=0`, fixed `seed`, frozen `model_version`, frozen `prompt_version` (semver-tagged), frozen `embedding_model_version`. The seed and all four versions are recorded in the audit ledger.
- **Citations:** Every assertion in a generated answer must reference at least one retrieved-chunk-ID. Uncited assertions are blocked at output by a post-generation validator; the validator failure path is itself logged.
- **Audit ledger schema:** `(id BLOB PRIMARY KEY, prev_hash BLOB, query TEXT, retrieved_chunks JSON, generated_answer TEXT, claim_citations JSON, model_version TEXT, prompt_version TEXT, embedding_model_version TEXT, seed INTEGER, timestamp INTEGER, user_id TEXT, signature BLOB)`. `id` is `SHA256(prev_hash || canonical_json(rest))`. Any node tampering breaks the chain at verify time.
- **Replay:** `audit-replay <ledger.sqlite> <entry-id>` reproduces the answer bit-for-bit if frozen artifacts (model, prompt, embedding model, corpus snapshot) are accessible. Drift in any frozen artifact returns a structured `ReplayDriftError` naming the drifted artifact.
- **Performance:** Operator console p95 ≤ 1.5s on a 50K-chunk corpus on commodity hardware (8-core, 32GB, NVMe). End-to-end query (retrieve → generate → cite-validate → ledger-write) p95 ≤ 8s with cloud LLM, ≤ 25s with on-prem 70B vLLM.
- **Security:** TLS 1.3 only. AES-256-GCM at rest for the audit ledger and the corpus index. Operator passkey via WebAuthn; no passwords. No telemetry by default.
- **Eval harness:** Versioned golden set lives in-repo at `eval/golden/`. Adversarial cases tagged: `ambiguous`, `out-of-corpus`, `contradictory`, `multi-hop`, `numerical`. Pass criteria: groundedness ≥ 0.95, citation-accuracy ≥ 0.95, refusal-correctness ≥ 0.90 on the latest golden snapshot.
- **Regulator report:** EU AI Act §50 transparency disclosure for v1, emitted as PDF + JSON + sealed audit-ledger excerpt in a single `.zip` artifact. PDF rendered via Typst (already in PAI stack), not headless Chrome.
- **Code quality (per GoalMode skill Bootstrap):** TypeScript strict, Biome, ESLint with custom rules (max 500 LOC/file, no `.skip`/`.only` tests, no `console.*` outside `lib/logger.ts`), knip clean, lefthook fast gate at pre-commit, integration at pre-push, full gate `pnpm check:full` at agent-done + CI on push.
- **License:** Business Source License 1.1 (BSL) with a four-year change date to Apache 2.0. Permits self-hosting and modification; restricts hosted-SaaS competitors during the BSL window. Sole exception: a Festanstellung-evidence release to Apache 2.0 if and when G6 commercialisation is abandoned.

## Goal

Deliver a self-hostable, open-source-auditable RAG application that ingests one configurable corpus, answers operator questions with per-claim citations to retrieved chunks, records every (query, retrieved-chunks, generated-answer, model-version, prompt-version, embedding-model-version, seed, timestamp, user) tuple to a hash-chained append-only SQLite audit ledger, replays any past answer bit-for-bit on demand, scores groundedness / citation-accuracy / refusal-correctness against a versioned adversarial golden set with all three metrics ≥ acceptance threshold, and emits a regulator-shaped EU AI Act §50 transparency-disclosure PDF + sealed-ledger artifact, all behind a German-language operator console — ready for a DACH-regulated-industry pilot deployment without a single hand-edit to the audit story.

## Criteria

### Identity, session, and operator console

- [x] ISC-1: Operator login at `/auth/operator` accepts an email, sends a 10-minute-expiry magic link, and creates a session bound to a WebAuthn passkey on first login.
- [x] ISC-2: Subsequent logins require WebAuthn passkey only; magic-link flow is recovery-only and rate-limited (5 attempts / 15 min / email).
- [x] ISC-3: Session cookie is `HttpOnly; Secure; SameSite=Strict`; idle timeout 30 min; absolute lifetime 8 h.
- [x] ISC-4: Operator console German UI ships with all error messages, button labels, audit panels, and report-generation copy in `de-DE`; `Accept-Language` parsing exists but `de-DE` is the only fully translated locale in v1.
- [x] ISC-5: Anti: `/auth/operator` does not accept passwords; password fields do not exist in the database schema.
- [x] ISC-6: Anti: No anonymous query path. `GET /api/query` without a session returns `401`.

### Corpus ingestion and indexing

- [x] ISC-7: `pnpm ingest --corpus <dir>` walks a watched directory, extracts text from PDF / DOCX / Markdown, OCRs scanned PDFs via tesseract, chunks at 800-token windows with 100-token overlap, and writes `(doc_id, page, char_offset, chunk_text)` rows to Postgres.
- [x] ISC-8: Each chunk row is embedded via the configured embedding model and indexed in `pgvector` HNSW with `m=16, ef_construction=128`.
- [x] ISC-9: Re-ingestion of an unchanged document is a no-op (content hash check); a changed document creates a new `corpus_snapshot_id` and the previous chunks remain queryable for replay.
- [x] ISC-10: A `corpus_snapshot_id` is recorded in the audit ledger for every query so old answers replay against the corpus state they were generated against.
- [x] ISC-11: `pnpm ingest --dry-run` reports document count, chunk count, embedding-model name, and estimated index size without writing.

### Retrieval

- [x] ISC-12: Hybrid retrieval: BM25 (top-50) + dense vector (top-50) merged via reciprocal-rank fusion to a final top-K (default K=8, configurable per query 1..20).
- [x] ISC-13: Each retrieved chunk carries `(chunk_id, doc_id, page, char_offset, retrieval_score, retrieval_method)` in the response payload.
- [x] ISC-14: Anti: Retrieval never returns chunks from a `corpus_snapshot_id` other than the one bound to the active query.
- [x] ISC-15: A `relevance_score < 0.3` retrieval result for ALL top-K chunks triggers a structured `OutOfCorpus` answer instead of a generated response.

### Generation and per-claim citation

- [ ] ISC-16: LLM call uses `temperature=0`, fixed seed (default `42`, configurable), frozen `model_version`, frozen `prompt_version` (e.g. `prompts/answer/v3.tmpl`).
- [ ] ISC-17: The generation prompt instructs the model to emit assertions tagged with `[chunk:<chunk_id>]` markers; the response parser extracts assertions and their citation lists.
- [ ] ISC-18: A post-generation validator rejects any assertion lacking at least one valid `chunk_id` reference; rejected outputs trigger one regeneration attempt with the validator feedback in the prompt; second failure surfaces a structured `UngroundedGenerationError` to the operator.
- [ ] ISC-19: Anti: An answer with at least one uncited claim is never returned to the operator. The validator block is itself recorded in the audit ledger.
- [ ] ISC-20: The operator console renders each citation as a clickable link that opens the source PDF page at the cited `char_offset`, with the chunk text highlighted.

### Audit ledger

- [ ] ISC-21: Every query writes a ledger row with: `id` (SHA-256 of prev_hash + canonical_json(rest)), `prev_hash`, `query`, `retrieved_chunks` (JSON), `generated_answer`, `claim_citations` (JSON), `model_version`, `prompt_version`, `embedding_model_version`, `seed`, `corpus_snapshot_id`, `timestamp`, `user_id`, `signature`.
- [ ] ISC-22: Validator-blocked outputs and `OutOfCorpus` returns are also ledgered (with an `outcome` field distinguishing `answered` / `refused-out-of-corpus` / `blocked-uncited`).
- [ ] ISC-23: `audit-verify <ledger.sqlite>` walks the chain, recomputes hashes, and exits 0 only when every row's hash and signature verify against the previous row.
- [ ] ISC-24: Tampering with any ledger row (hex-edit one byte) causes `audit-verify` to exit non-zero and name the first invalid row.
- [ ] ISC-25: Ledger export produces a sealed artifact: `audit-<ISO-date>.sqlite` + `audit-<ISO-date>.sqlite.sig` (Ed25519, key configured per deployment) in a single `.zip`.
- [ ] ISC-26: Anti: There is no SQL `UPDATE` or `DELETE` path on the ledger table in application code; only `INSERT`. A regression test enforces this via grep + parse.

### Replay

- [ ] ISC-27: `audit-replay <ledger.sqlite> <entry-id>` re-issues the same query against the same `corpus_snapshot_id`, with the same model/prompt/embedding versions and seed, and asserts byte-equality with the original `generated_answer`.
- [ ] ISC-28: Replay against a drifted artifact (corpus snapshot purged, model version retired, prompt version edited) returns a structured `ReplayDriftError` naming the drifted artifact and exits non-zero. Never silently produces a different answer.
- [ ] ISC-29: A replay run is itself ledgered (with `outcome=replay-success` or `outcome=replay-drift`) so a regulator can see who replayed what when.

### Eval harness

- [ ] ISC-30: Golden set lives at `eval/golden/v<N>.jsonl` with `{question, expected_outcome, expected_chunks?, tags[]}`. Tags include `ambiguous`, `out-of-corpus`, `contradictory`, `multi-hop`, `numerical`.
- [ ] ISC-31: `pnpm eval` runs all golden questions against a pinned (model, prompt, corpus_snapshot) tuple and outputs `groundedness`, `citation-accuracy`, `refusal-correctness`, and per-tag breakdowns.
- [ ] ISC-32: Eval thresholds: groundedness ≥ 0.95, citation-accuracy ≥ 0.95, refusal-correctness ≥ 0.90. Fall below threshold → `pnpm eval` exits non-zero.
- [ ] ISC-33: The eval harness is part of `pnpm check:full` and therefore part of the GoalMode-style done-contract.
- [ ] ISC-34: Anti: `pnpm eval` does not pass on an empty golden set. Empty-set runs are explicit failures.

### Regulator report (EU AI Act §50)

- [ ] ISC-35: `pnpm report --format=eu-ai-act-50 --since=<ISO> --until=<ISO> --out=<dir>` produces `disclosure.pdf` (Typst-rendered), `disclosure.json` (machine-readable), and a sealed `audit-excerpt.zip` covering the time window.
- [ ] ISC-36: The §50 PDF includes: system identity, deployment context, model versions used, embedding-model version, corpus-snapshot identity & SHA, query volume + outcome breakdown, eval scores at the report's time-window end, refusal-rate, the complete prompt-template versions in an appendix, and a verifiable hash of the sealed audit-excerpt.
- [ ] ISC-37: Re-running the same `--since/--until` against the same ledger produces byte-identical PDF + JSON outputs (deterministic Typst rendering + frozen template version).
- [ ] ISC-38: Anti: Report generation never reads outside the named time window. Out-of-window ledger rows are not included even when the operator drags the window.

### Operator console UI

- [ ] ISC-39: `/console` renders a query box, a retrieved-chunks panel (collapsible, citation-anchored), an answer panel with inline citation pills, and an audit-trail panel showing the ledger row that was just written.
- [ ] ISC-40: The "Replay" button on any historical ledger row triggers a replay and renders pass / drift / error inline with the diff if drift.
- [ ] ISC-41: The "Generate AI Act §50 Report" view exposes time-window pickers and renders the resulting `.zip` for download.
- [ ] ISC-42: WCAG 2.2 AA across the operator console (keyboard navigation, contrast ratios, screen-reader landmarks).
- [ ] ISC-43: Anti: No analytics, telemetry, or third-party JS in the operator console. CSP is `default-src 'self'`.

### DSGVO / compliance baseline

- [ ] ISC-44: Logger never logs query text or retrieved-chunk text at INFO or below; only `(user_id_hash, query_id, latency_ms, outcome)` at INFO. Full content is in the audit ledger only.
- [ ] ISC-45: Operator deletion removes their session + their `user_id` mapping but preserves ledger rows (with `user_id` replaced by a deletion-tombstone hash) for the regulator-required retention window.
- [ ] ISC-46: A documented `data-residency.md` declares which deployment regions are supported; default install runs entirely on-prem with outbound LLM-API calls being the only egress.
- [ ] ISC-47: Anti: No PII or query content is ever sent to a non-LLM-provider third-party in v1.

### Build, test, ship (GoalMode contract)

- [x] ISC-48: `pnpm check:full` runs typecheck + Biome + ESLint + knip + Vitest (unit + integration) + e2e (`agent-browser`-driven) + eval harness, and exits 0.
- [x] ISC-49: lefthook fast gate runs at every commit; pre-push runs integration; CI runs `pnpm check:full` on every push.
- [ ] ISC-50: README ships a 5-minute install: `git clone && pnpm install && docker-compose up postgres && pnpm ingest --corpus ./examples/eu-ai-act && pnpm dev` produces a working operator console.
- [ ] ISC-51: Anti: No commit lands on `main` with a failing CI run. Branch-protection rules enforce this on the GitHub side.

## Test Strategy

| ISC | Type | Check | Threshold | Tool |
|---|---|---|---|---|
| ISC-1..6 | integration | Test-driven Hono routes against ephemeral SQLite | All ISC-1..6 pass | Vitest + supertest + sqlite-tmp |
| ISC-7..11 | integration | Run ingestion against a fixture corpus, assert chunk count + embedding count + index reachability | Counts match fixture expectations | Vitest + pg-tmp + tesseract fixture |
| ISC-12..15 | integration | Pinned-corpus retrieval; assert top-K identity for known queries; assert OutOfCorpus on adversarial query | Match golden expected_chunks | Vitest + pinned corpus snapshot |
| ISC-16..20 | integration + unit | Unit-test the citation-validator on synthetic outputs; integration-test full generate→validate→regenerate path with a stubbed LLM | Validator rejects all uncited synthetic cases | Vitest + LLM stub |
| ISC-21..26 | integration + unit | Hash-chain unit tests on synthetic rows; integration tests writing real rows; tamper test that flips one byte | `audit-verify` exits 0 clean, non-zero tampered | Vitest + ts-node + sqlite-tmp |
| ISC-27..29 | integration | Replay a freshly-written ledger row; replay against drifted (manually-edited) prompt version → expect ReplayDriftError | Byte-equal on clean replay; named drift on dirty | Vitest + LLM stub |
| ISC-30..34 | unit + integration | Eval harness self-tests on a 5-question fixture; thresholds enforced; empty-set rejected | Thresholds met, empty rejected | Vitest |
| ISC-35..38 | integration | Generate report; re-generate; diff bytes; out-of-window ledger row test | Byte-identical re-runs; window honored | Vitest + Typst CLI + sha256sum |
| ISC-39..43 | e2e | `agent-browser`-driven flow: login → query → see citations → replay → generate report → CSP scan | Full flow green; CSP report shows zero violations | agent-browser + custom e2e harness |
| ISC-44..47 | unit + integration | Logger redaction unit tests; deletion-tombstone integration test; egress-allowlist test (mock outbound) | No PII in INFO logs; tombstone preserves chain; only LLM-host egress | Vitest + nock |
| ISC-48..51 | meta / CI | `pnpm check:full` on a clean clone; CI workflow run on PR; install-instructions test on a clean container | Exit 0 on all | GitHub Actions + Docker |

## Features

| name | description | satisfies | depends_on | parallelizable |
|---|---|---|---|---|
| `feat/auth-passkey` | Magic-link bootstrap + WebAuthn passkey for operator | ISC-1..6 | — | yes |
| `feat/corpus-ingest` | PDF/DOCX/Markdown ingestion with chunking, embedding, pgvector indexing | ISC-7..11 | — | yes |
| `feat/retrieval-hybrid` | BM25 + dense retrieval with RRF and OutOfCorpus signal | ISC-12..15 | feat/corpus-ingest | no |
| `feat/generation-cited` | Prompt template + citation parser + post-generation validator + regeneration loop | ISC-16..20 | feat/retrieval-hybrid | no |
| `feat/audit-ledger` | Hash-chained SQLite audit ledger with verify CLI and Ed25519 signing | ISC-21..26 | — | yes |
| `feat/replay-tool` | Bit-equal replay against ledger entries; ReplayDriftError on drift | ISC-27..29 | feat/audit-ledger, feat/generation-cited | no |
| `feat/eval-harness` | Adversarial golden set + scorer + threshold gate; integrated into `check:full` | ISC-30..34 | feat/generation-cited | yes |
| `feat/regulator-report` | EU AI Act §50 PDF + JSON + sealed-excerpt zip via Typst | ISC-35..38 | feat/audit-ledger, feat/eval-harness | no |
| `feat/operator-console` | Next.js operator UI: query / chunks / answer / audit / replay / report | ISC-39..43 | feat/auth-passkey, feat/generation-cited, feat/regulator-report | no |
| `feat/dsgvo-baseline` | Logger redaction, deletion tombstones, residency doc, egress allowlist | ISC-44..47 | — | yes |
| `feat/devloop` | GoalMode-style guardrail stack: TS strict, Biome, ESLint, knip, lefthook, CI, pnpm check:full | ISC-48..51 | — | first (gates everything else) |

## Decisions

- **2026-05-10 — Initial scaffold.** Project seeded from the GoalMode skill use-case and the Audit-Grade RAG recommendation in the Bootoshi-blueprint scoping conversation. ISA seeded at E5 because the project will be driven end-to-end by Codex `/goal` mode per `~/.claude/skills/GoalMode/Workflows/MasterPRD.md`, and the GoalMode workflow expects a ≥1500-line Master PRD downstream of an ISA dense enough to make expansion mechanical rather than design-from-scratch.
- **2026-05-10 — Pick EU AI Act §50 over BaFin MaRisk for v1 regulator format.** Rationale: §50 transparency disclosure has the broadest cross-industry applicability (covers Banken, Versicherungen, Pharma, Behörden uniformly) and is regulator-recognised across all 27 EU member states, not just BaFin's jurisdiction. BaFin MaRisk AT 4.4 added in v1.1 once §50 ships and lands a pilot deployment.
- **2026-05-10 — TELOS alignment (G3 Festanstellung).** This project is the demonstrable proof of three rare DACH-market skills in one artifact: (1) RAG with rigorous compliance posture, (2) auditability and reproducibility as engineering practices not afterthoughts, (3) regulator-shaped output that compliance teams can use directly. The README's "How this was built" section (per `GoalMode/Workflows/Launch.md` Phase 6) becomes the portfolio narrative.
- **2026-05-10 — TELOS alignment (G6 commercial PAI).** Self-hostable + BSL 1.1 license + clean separation of audit story from RAG implementation makes this a credible commercial product seed: regulated DACH organisations can buy a one-time-fee on-prem license, and the open-source upstream feeds developer-marketing without enabling SaaS competitors during the BSL window.
- **2026-05-10 — Pick `bge-m3` as default embedding model.** Multilingual (strong on German), 1024-dim (manageable index size), open-source (no provider lock-in for the audit story), permissive license (MIT). `jina-embeddings-v3` listed as alternative for German-only corpora where its higher German benchmark scores justify the dimensionality difference.
- **2026-05-10 — SQLite (WAL) for audit ledger over Postgres.** Single-file artifact is half the audit story (regulator hand-off becomes "send this file"). WAL mode handles concurrent readers without compromising the append-only invariant. Postgres is permitted as an opt-in for high-volume deployments but is explicitly not the default. The hash-chain + Ed25519 signing design is storage-agnostic; the choice is operational.
- **2026-05-10 — `agent-browser` for e2e per PAI doctrine.** The GoalMode skill names `agent-browser` as PAI's preferred browser-automation tool for L3 e2e tests (verified Rust CLI distributed via npm; persistent auth profiles; faster than Playwright for repeated flows). Operator-console e2e ships under `e2e/` driving `agent-browser` from a TypeScript harness; Playwright explicitly out of scope.
- **2026-05-10 — Hono over Fastify.** Hono's smaller surface and middleware ergonomics around the audit-pipeline (every request must traverse the audit-write middleware before the response is sent) made it the cleaner fit. Fastify is the fallback if a Hono limitation appears during EXECUTE.
- **2026-05-10 — German-only operator UI in v1.** English UI added in v1.1. Shipping with German-only matches the DACH-pilot reality (compliance officers read German, not English) and removes a translation-maintenance burden that adds zero audit-story value.
- **2026-05-10 — BSL 1.1 license over Apache 2.0.** BSL with a four-year change date to Apache 2.0 protects the G6 commercial bet during the window when SaaS competitors could fork-and-host before any commercial offering has product-market-fit, while the four-year automatic transition guarantees the project becomes fully open-source eventually. Reverts to Apache 2.0 if G6 is abandoned (decision documented as a falsifier).

## Changelog

(Empty at OBSERVE phase. Conjecture / refuted-by / learned / criterion-now entries land here as the build progresses through the GoalMode `/goal` run and any iterations.)

## Verification

(Empty at OBSERVE phase. Per-ISC evidence — quoted command output, file contents, screenshot paths from `agent-browser` runs, sealed audit-excerpt SHAs — lands here at VERIFY phase, populated by the Codex `/goal` run and audited by Claude in supervisor mode per `GoalMode/Workflows/Launch.md` Phase 5.)
