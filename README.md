<div align="center">

# Audit-Grade RAG

**Self-hosted RAG where every answer is cited, signed into a hash chain, and replayable byte-for-byte.**

[![CI](https://github.com/mj-deving/audit-grade-rag/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mj-deving/audit-grade-rag/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-22-3c873a?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-9-f69220?logo=pnpm&logoColor=white)
![Replay](https://img.shields.io/badge/replay-drift_detecting-0f766e)
![Audit](https://img.shields.io/badge/audit-ledger_signed-111827)
![Analytics](https://img.shields.io/badge/analytics-none-b91c1c)

**[Live demo](https://audit-grade-rag-demo.mjdeving.com/demo)** · [What it does](#why-this-exists) · [Architecture](#architecture) · [Verification](#verification) · [Run it locally](#five-minute-install)

</div>

**[Try the live demo](https://audit-grade-rag-demo.mjdeving.com/demo).** Ask a question about Article 50 of the EU AI Act, read the cited answer, then open the Ed25519-signed audit row it wrote and replay it byte-for-byte. Public, no login; the operator console stays passkey-gated on its own hostname.

<p align="center">
  <a href="https://audit-grade-rag-demo.mjdeving.com/demo"><img src="docs/screenshot.png" alt="The public demo: a cited answer to an Article 50 question above the Ed25519-signed audit row that recorded it" width="900"></a>
</p>

Audit-Grade RAG treats every answer as an auditable event: the retrieved evidence is kept, each
claim is checked against its citation, ledger rows are hash-chained and Ed25519-signed, replay names
five kinds of drift, and an EU AI Act Article 50 report bundle rebuilds from local state. The local
profile is deterministic, so the eval and replay gates in [Verification](#verification) run with no
cloud credentials and no third-party JavaScript.

## Why This Exists

Most RAG tools optimize for the answer box. Regulated operators need the
surrounding evidence:

- What corpus snapshot was active?
- Which chunks were retrieved?
- Which claims were cited?
- Which model, prompt, embedding profile, and seed were used?
- Can the answer be replayed later?
- Can the system produce a disclosure bundle without hand assembly?

Audit-Grade RAG makes those questions first-class product behavior instead of
after-the-fact logging.

## What Makes It Audit-Grade

| Capability | What ships in this repo |
| --- | --- |
| Cited answers | Claim parser and validator reject uncited or wrong-snapshot citations. |
| Refusal path | Low-evidence retrieval refuses before calling the LLM provider. |
| Append-only ledger | Every answered, refused, blocked, replayed, and reported event is hash-chained and signed. |
| Replay | Replay checks corpus snapshot, prompt hash, embedding model, model profile, and provider capability. |
| Drift reporting | Prompt, corpus, model artifact, cloud byte mismatch, and unsupported-provider states are named. |
| Article 50 bundle | Deterministic JSON, PDF-shaped artifact, audit excerpt, and manifest hashes. |
| Eval gate | Golden-set parser with groundedness, citation accuracy, refusal correctness, and per-tag breakdown. |
| Operator UI | German console with CSP, keyboard-reachable controls, no external scripts, and no analytics. |

## Implementation Status

- Claude CLI OAuth LLM provider: wired for local L4 through `tests/integration-live/anthropic.spec.ts`; `RUN_LIVE_TESTS=1` calls `claude -p --output-format json --json-schema` through the installed Claude Code OAuth session. The Anthropic SDK adapter remains available for deployable API-key environments, but it is not required for local GoalMode evidence.
- bge-m3 embedding model: wired for L4 through `tests/integration-live/bge-m3.spec.ts`; with `RUN_LIVE_TESTS=1`, it uses `BGE_M3_EMBEDDING_ENDPOINT` when set, otherwise starts a local TEI `BAAI/bge-m3` container with CPU-safe `float32` by default and caches model artifacts under ignored `.live-cache/bge-m3`. A cold cache downloads the 2.2 GB ONNX data shard and should be run only when WSL memory/disk budget is acceptable; a VPS-hosted TEI endpoint behind SSH tunneling is the preferred low-WSL-resource path when available. See `docs/bge-m3-live-provider.md`.
- pgvector vector store: wired for L4 through `tests/integration-live/pgvector.spec.ts`; with `RUN_LIVE_TESTS=1`, it uses `DATABASE_URL` when set, otherwise starts an isolated local `pgvector/pgvector:pg16` container.
- Typst PDF renderer: wired for L4 through `tests/integration-live/typst.spec.ts`; deferred unless `RUN_LIVE_TESTS=1` and the `typst` binary is on `PATH`.
- WebAuthn auth library: wired for L4 through `tests/integration-live/webauthn.spec.ts`; application passkey storage is reopened until the HTTP flow verifies real WebAuthn assertions instead of credential-ID presence.
- Hono SSR UI framework: wired for L4 through `tests/integration-live/hono-ssr.spec.ts`; `RUN_LIVE_TESTS=1` instantiates the real Hono app and renders `/console` with CSP evidence.

## Five-Minute Install

```bash
git clone https://github.com/mj-deving/audit-grade-rag.git
cd audit-grade-rag
corepack enable
pnpm install --frozen-lockfile
docker-compose up -d postgres
export DATABASE_URL=postgres://audit_grade_rag:audit_grade_rag@127.0.0.1:5432/audit_grade_rag
pnpm ingest --corpus ./examples/eu-ai-act
pnpm dev
```

Open:

```text
http://127.0.0.1:3000/console
```

The dev server bootstraps an operator, uses `examples/eu-ai-act`, runs a
deterministic query, and renders the console with answer, citation, evidence
cards, and audit state.

For environments that keep Postgres attached to the foreground, the same
database step is `docker-compose up postgres` in a separate terminal. The
subsequent `pnpm ingest` command uses the `DATABASE_URL` above so the five-minute
path exercises the Postgres + pgvector ingestion path instead of the local
in-memory fallback.

## Production Container

The container starts `pnpm start`, not the fixture dev server. With `DATABASE_URL`
set, runtime queries use the Postgres + pgvector store and append query rows to
the SQLite ledger at `AUDIT_LEDGER_PATH`.

Required production environment:

```bash
DATABASE_URL=postgres://audit_grade_rag:audit_grade_rag@postgres:5432/audit_grade_rag
BGE_M3_EMBEDDING_ENDPOINT=http://embeddings/embed
AUDIT_LEDGER_PATH=/var/lib/audit-grade-rag/audit.sqlite
CORPUS_DIR=examples/eu-ai-act
```

The bundled Compose file persists Postgres in `postgres-data` and the signed
ledger in `audit-ledger`; both services bind to `127.0.0.1` only. Verify a live
container with:

```bash
curl -fsS http://127.0.0.1:3000/health
```

## MCP Adapter

The repo ships a local stdio MCP adapter for operator-controlled proof work. It
does not add public HTTP routes. In production, run it on the host/container
side against the loopback app URL; the public hostname remains Cloudflare
Access-gated.

Tools:

- `health`: `GET /health`
- `rag_query`: authenticated `/api/query` with answer, citations, retrieved chunks, and ledger id
- `audit_verify`: verify the configured SQLite ledger path
- `replay`: authenticated `/api/audit/:entryId/replay`

Run locally:

```bash
AGR_BASE_URL=http://127.0.0.1:3000 \
AGR_OPERATOR_EMAIL=mcp-operator@example.local \
AGR_LEDGER_PATH=/absolute/path/to/audit.sqlite \
AGR_MCP_CREDENTIAL_PATH=/absolute/path/to/mcp-passkey.json \
pnpm mcp
```

Protocol smoke without live credentials:

```bash
pnpm mcp:smoke
```

Claude Code project config shape:

```bash
claude mcp add audit-grade-rag --scope project \
  -e AGR_BASE_URL=http://127.0.0.1:3025 \
  -e AGR_OPERATOR_EMAIL=mcp-operator@example.local \
  -e AGR_LEDGER_PATH=/var/lib/audit-grade-rag/audit.sqlite \
  -e AGR_MCP_CREDENTIAL_PATH=/var/lib/audit-grade-rag/mcp-passkey.json \
  -- pnpm --dir /absolute/path/to/audit-grade-rag mcp
```

## Try the Core Workflows

```bash
# Preview ingestion without writing rows.
pnpm ingest --corpus examples/eu-ai-act --dry-run

# Export a sealed ledger excerpt.
pnpm audit:export \
  --since 2026-05-10T00:00:00.000Z \
  --until 2026-05-10T23:59:59.999Z \
  --out /tmp/agr-export

# Verify exported ledger rows.
pnpm audit:verify --ledger /tmp/agr-export/audit-ledger.sqlite

# Replay an audited answer.
pnpm audit:replay

# Generate an Article 50 report bundle.
pnpm report \
  --format eu-ai-act-50 \
  --since 2026-05-10T00:00:00.000Z \
  --until 2026-05-10T23:59:59.999Z \
  --out /tmp/agr-report
```

## Architecture

![Audit-Grade RAG data flow — query through retrieval, refusal gate, Claude generation, hash-chained signed ledger, and deterministic replay with five named drift states](docs/diagrams/dataflow.png)

```text
src/app/              Runtime composition
src/commands/         CLI and dev-server entrypoints
src/domain/           Shared domain types
src/modules/auth/     Operator auth and session state
src/modules/ingest/   Corpus ingestion and snapshots
src/modules/retrieval Retrieval ranking and refusal logic
src/modules/generation Prompting, providers, claim validation
src/modules/audit/    Signed hash-chain ledger
src/modules/replay/   Replay verification states
src/modules/eval/     Golden-set parser and thresholds
src/modules/report/   Article 50 report bundle
src/modules/ui/       German operator-console HTML/CSS
docs/                 Operator, security, audit, replay, and report docs
examples/eu-ai-act/   PDF/DOCX/Markdown corpus fixtures
```

### Request Path

```text
operator session
  -> active corpus snapshot
  -> dense and BM25 candidates
  -> RRF merge
  -> out-of-corpus gate
  -> cited generation
  -> claim validation
  -> signed ledger row
  -> replay/report surfaces
```

## Verification

```bash
pnpm check:fast
pnpm check:full
pnpm build
```

`pnpm check:full` runs typecheck, Biome, ESLint, unit tests, knip, integration
tests, build-backed e2e, and the eval harness.

The CI workflow runs the same full gate on push and pull request.

### What is verified

- Golden eval on the Article 50 corpus: groundedness 1.0, citation accuracy 1.0, refusal correctness
  1.0 against thresholds of 0.95 / 0.95 / 0.90, five tags green.
- Test suite: 28 unit and 27 integration tests green; typecheck, Biome, ESLint, and knip clean.
- Live demo verified in a real browser on 2026-07-15: a cited answer, the Ed25519-signed audit row it
  wrote, byte-for-byte replay of that row, and the operator routes returning 404 on the public demo
  hostname.

## Docker Compose

```bash
docker compose up --build
```

The container serves the operator console on:

```text
http://127.0.0.1:3000/console
```

## Docs

- [Architecture spine](docs/ARCHITECTURE.md): the one-minute map of contract, provenance, primitives, proof, and limits
- [Data residency](docs/data-residency.md)
- [Audit ledger](docs/audit-ledger.md)
- [Replay](docs/replay.md)
- [Article 50 report](docs/report-eu-ai-act-50.md)
- [German operator guide](docs/operator-guide.de.md)
- [Admin runbook](docs/admin-runbook.md)
- [Security](docs/security.md)
- [Privacy](docs/privacy.md)
- [Eval harness](docs/eval-harness.md)
- [Master PRD](docs/MASTER_PRD.md)

## Current Scope

This repository targets a single-tenant, one-corpus v1 deployment. The local
development profile is deterministic so replay and report gates are testable;
production profiles must supply configured storage, WebAuthn ceremonies,
provider credentials, TLS, key management, disk encryption, backups, and
retention policy enforcement.

Cloud LLM replay is not advertised as indefinitely byte-stable. Cloud byte
mismatches are reported as replay drift unless the configured provider profile
proves bit-equal replay support.

## License

Licensed under the [Apache License 2.0](LICENSE).
