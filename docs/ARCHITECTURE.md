# Architecture Spine

The one-minute map of this project: where the contract lives, how outputs prove their
provenance, which parts are reusable, what proves the build, and what it does not do.
It is an index into files that already exist, not a second source of truth. When this
map and a linked file disagree, the linked file wins.

## 1. Contract

The contract is split by longevity, not duplicated:

- `ISA.md` — the ideal-state contract: problem, scope, principles, constraints, and 51
  Ideal State Criteria. The `Constraints` section carries the entity and state model,
  including the audit-ledger row schema.
- `docs/MASTER_PRD.md` — the frozen requirements expansion of the ISA. Frozen means
  breadth changes need an ISA append first.
- `AGENTS.md` §11 — the machine-checkable "done" contract an agent must satisfy.

There is no separate `docs/CONTRACT.md`; `ISA.md` is that surface and a second file
would only drift from it.

## 2. Provenance

Provenance is the product, not a side effect. Every answered, refused, blocked,
replayed, and reported event writes one hash-chained, Ed25519-signed ledger row.

Each row records source identity (corpus snapshot id + hash), actor (a `userIdHash`,
never a raw identity), run identity (the row id is `SHA256(prev_hash || canonical rest)`),
and derivation identity (model, prompt, embedding-model versions, and seed). Errors are
recorded as a class, never as raw payloads.

Detail: `docs/audit-ledger.md`, `docs/replay.md`.

## 3. Primitives

Reusable boundaries live under `src/modules/`, one concern per directory: `audit`
(signed hash-chain ledger), `retrieval` (dense + BM25 + RRF, refusal gate), `generation`
(prompting, providers, claim validation), `replay` (five named drift states), `report`
(Article 50 bundle), `eval` (golden-set harness), `ingest`, `auth`, `security`, `ui`.

These stay project-local by design. The promotion rule is: extract to a shared package
only after a second real reuse. No second consumer exists yet, so nothing is extracted.
The likely first candidates when that pressure arrives are the signed-ledger and the
replay-verifier boundaries.

## 4. Durable State

The request path is synchronous (retrieve, generate, cite-validate, ledger-write; p95
under 8s with a cloud model), so there is no background-job state machine to expose.

The durable, inspectable state is the append-only SQLite ledger itself: WAL mode,
hash-chained, signed, exportable as one sealed `.sqlite + .sig` artifact. Recovery is
replay, which reproduces any past row bit-for-bit or names the drifted artifact.

## 5. Proof Commands

Run from the repo root, no chat history needed:

```bash
pnpm check:full   # typecheck + Biome + ESLint + unit + knip + integration + e2e
pnpm build
pnpm eval         # golden set: groundedness, citation accuracy, refusal correctness
pnpm audit:verify --ledger <path>   # verify a ledger's hash chain and signatures
pnpm audit:replay                    # reproduce an audited answer byte-for-byte
```

CI runs the same full gate on push and pull request. Live browser evidence for the
public demo flow is captured in `docs/screenshot.png` and re-verified on the apex
hostname before a demo claim ships.

## 6. Limits

Named in the ISA `Out of Scope` block (twelve items) and the README `Current Scope`
section, and enforced in behavior, not only prose:

- Single-tenant, one-corpus v1. No multi-tenant SaaS, no SSO, no multi-corpus.
- Cloud-model replay is not advertised as indefinitely byte-stable; cloud byte
  mismatch is reported as replay drift, never hidden.
- No silent retrieval fallback: a low-evidence question is refused before the model is
  called.
- Data-residency and redaction boundaries: `docs/data-residency.md`, `docs/privacy.md`,
  `docs/security.md`.

## Tracking

This repo does not carry its own Beads database. Its delivery lane is tracked in the
MJ-OS portfolio-frontends thread, alongside the other portfolio front-ends.
