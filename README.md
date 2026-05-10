# Audit-Grade RAG

Audit-Grade RAG is a TypeScript reference implementation for a self-hosted,
single-organization RAG assistant with claim-level citations, append-only audit
events, deterministic replay checks, and an EU AI Act Article 50 report bundle.

## Five-Minute Install

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check:full
pnpm dev
```

Open `http://127.0.0.1:3000/auth/operator`, then use the demo operator flow.
The local demo uses deterministic providers and `examples/demo-corpus`.

## Architecture

- `src/modules/auth`: magic-link bootstrap, WebAuthn-shaped passkey state, sessions.
- `src/modules/ingest`: PDF, DOCX, and Markdown fixture ingestion with snapshots.
- `src/modules/retrieval`: dense/BM25 scoring, RRF merge, top-K and refusal threshold.
- `src/modules/generation`: prompt rendering, provider profiles, cited-claim validation.
- `src/modules/audit`: hash-chained signed ledger rows and sealed exports.
- `src/modules/replay`: bit-equal, drift-detecting, and unsupported replay states.
- `src/modules/eval`: golden-set parser and threshold gate.
- `src/modules/report`: deterministic Article 50 JSON/PDF/audit excerpt bundle.
- `src/modules/ui`: German operator-console HTML with CSP and no analytics.

## CLI

```bash
pnpm ingest --corpus examples/demo-corpus --dry-run
pnpm audit:export --since 2026-05-10T00:00:00.000Z --until 2026-05-10T23:59:59.999Z --out /tmp/agr-export
pnpm audit:verify --ledger /tmp/agr-export/audit-ledger.sqlite
pnpm audit:replay
pnpm report --format eu-ai-act-50 --since 2026-05-10T00:00:00.000Z --until 2026-05-10T23:59:59.999Z --out /tmp/agr-report
```

## Limits

The v1 implementation is single-tenant and one-corpus by design. The local demo
uses deterministic stub providers; production profiles must supply real storage,
WebAuthn ceremonies, provider credentials, TLS, key management, and disk
encryption. Cloud LLM replay is not advertised as indefinitely byte-stable:
cloud byte mismatches are reported as replay drift unless the configured provider
profile proves bit-equal replay support.

## Docker Compose

```bash
docker compose up --build
```

The demo serves the German operator console on `http://127.0.0.1:3000/console`.
