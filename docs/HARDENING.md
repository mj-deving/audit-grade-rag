# Production Hardening

Tracks this build from demo to production-ready-to-a-named-scope, against the MJ-OS
production-readiness standard (the two-layer floor: engineering + AI). The product ISA
(`ISA.md`) stays frozen at its v1 verify state; this file is the hardening spine and its
criteria live here until each is closed with tool evidence.

## Scope and the honest claim target

Production for this build is single-operator self-host. Its production is the operator's
own daily use and the evals run against it, not customer traffic. The claim, once the
floor holds, is:

> production-ready to level: single-operator self-host; scope: public read-only demo plus
> passkey-gated operator console on my own infra (automation-host VPS). Not multi-tenant,
> not customer-facing.

Until every criterion below is closed, this build is a demo with a named-scope roadmap,
not production-ready. No bare badge.

## Gap-scan result (2026-07-15)

Passing floor dimensions: deploy/rollback, disposability, testing-on-data-path,
prompt-injection surface (read-only, no tools), LLM observability (Langfuse OTel on main),
per-call spend cap (`maxBudgetUsd`), secrets out of code. Open floor items become the
criteria below.

## Criteria

Each names the probe that falsifies it. Closed only on tool evidence of the right modality.

- [ ] H-1 (Evals as gate): the golden set holds at least 100 cases across the adversarial
  tag taxonomy, and a seeded regression under threshold fails CI. Falsifier: `wc -l` on the
  golden set under 100, or a deliberately-wrong answer does not drop a metric below its gate.
- [x] H-2 (AI reliability): every model and embedding call retries 429 and 5xx with bounded
  exponential backoff plus jitter, under a per-call timeout, with a defined fallback.
  Falsifier: a simulated 429 crashes the call, or no retry path exists in the provider.
  Closed: `src/lib/resilience.ts` (backoff+jitter), embedding fetch wrapped and unit-tested
  (429-then-200 retries, 503 exhausts, 400 does not); Anthropic SDK client sets explicit
  `maxRetries`+`timeout`; the Claude-CLI provider retries on a timed-out invocation (transient),
  not on a deterministic non-zero exit. Mutation-falsified: disabling the retry guard turns 4
  tests red.
- [x] H-3 (Fault tolerance): every outbound network call (Postgres, embedding endpoint,
  model) carries a timeout; a dead dependency fails fast instead of hanging. Falsifier: a
  call constructed with no timeout, or a stalled dependency hangs the request.
  Closed: embedding fetch uses `AbortSignal.timeout`; `src/lib/pg-pool.ts` sets
  `connectionTimeoutMillis` + `statement_timeout` + `query_timeout` on both pools; Anthropic
  client `timeout`.
- [x] H-4 (Supply chain): a dependency scan runs in CI and fails the build on a high or
  critical advisory. Falsifier: no dependency-scan step in CI, or a seeded high advisory does
  not fail it. Closed: `pnpm audit` targets an npm endpoint that now returns 410, so CI runs
  osv-scanner (pinned image) over `pnpm-lock.yaml` and gates on HIGH/CRITICAL via
  `scripts/osv-check.ts` (`src/lib/osv-gate.ts`, unit-tested against seeded critical/low/
  malformed fixtures). Fails closed: advisories with no CVSS `max_severity` fall back to the
  severity label, and an advisory whose severity cannot be established at all is flagged rather
  than passed; CI treats any osv-scanner exit other than 0/1 as an infra failure. CI-run
  caveat: the gate logic is unit-verified; the osv-scanner invocation itself proves on the
  first CI run of this branch. First real run flagged two HIGH advisories already on main: hono
  (CVSS 7.1, shipped web framework) was bumped to 4.12.30; the vite dev-server advisory
  (GHSA-fx2h-pf6j-xcff, dev/test-only, not on the shipped Linux surface, vitest 4.1.5 pins the
  vulnerable version) is a fail-closed triage allowlist entry in `osv-gate.ts` with a reason and
  a 2026-10-15 review date. `partitionFindings` blocks any advisory not on that list.
- [ ] H-5 (Alerting): a health and error-rate alert fires without a user reporting the break.
  Falsifier: no alert wired; a downed container is learned from a visitor.
- [ ] H-6 (Data durability): an automated backup of the ledger and Postgres exists with a
  tested restore that re-verifies the signed chain. Falsifier: no automated backup, or a
  restore that has never been exercised end to end.
- [ ] H-7 (Reliability SLO): a written, measured success target (p95 latency and success
  rate) exists and is measured against the running deploy. Falsifier: a target with no
  measurement, or no target at all.
- [ ] H-8 (DDL vs fault-tolerance timeout): schema and index DDL (notably the HNSW build) is
  not governed by the short pool `statement_timeout`/`query_timeout`, so a one-time index
  build on a populated table cannot fail as if it were a slow runtime query. Falsifier:
  `CREATE INDEX ... USING hnsw` on a populated `corpus_chunks` exceeds the pool timeout and
  `ensureSchema()` fails. Deferred from wave 1 (Forge audit NF-2, low live exposure: the index
  is built `IF NOT EXISTS` against an empty table and filled by fast incremental inserts). Fix
  path: lift the timeout for the DDL transaction only (`SET LOCAL statement_timeout = 0` plus a
  per-query `query_timeout` override), verified against a real Postgres.

## Test strategy

| ISC | type | check | threshold | tool |
|---|---|---|---|---|
| H-1 | eval | golden-set size and a seeded-regression run | >=100 cases; regression fails gate | `wc -l`, `pnpm eval` |
| H-2 | unit | fake transport returns 429 then 200; assert retried | retries, succeeds, bounded | vitest + mutation-falsify |
| H-3 | unit | call with a stalled fake dependency | rejects on timeout, no hang | vitest + mutation-falsify |
| H-4 | ci | audit step present and fails on a seeded advisory | non-zero exit on high+ | CI run |
| H-5 | manual | kill a container, confirm the alert fires | alert observed | deploy-side, Marius gate |
| H-6 | integration | back up, wipe, restore, verify chain | chain verifies post-restore | `pnpm audit:verify` |
| H-7 | manual | SLO doc plus a measured sample from the deploy | target stated and measured | runbook + probe |

## Waves

Ordered by dependency and blast radius (self-contained code first, deploy-side infra last).

- **Wave 1 (self-contained code, no infra):** H-2, H-3, H-4. Lands as one Forge-audited PR.
- **Wave 2 (evals, the single most load-bearing item):** H-1. Dataset authoring; own PR.
- **Wave 3 (deploy-side, needs an operator hand on the VPS/CF):** H-5, H-6, H-7. Backup
  cron, alert wiring, SLO measurement against the live deploy.

Each wave: code and test together, mutation-falsify the test, full gate green, mandatory
cross-vendor audit (model id read from the auditing vendor's own banner, builder never the
auditor), remediate first-hand, then land. No wave closes the production-ready claim on its
own; the claim holds only when every criterion above is checked.
