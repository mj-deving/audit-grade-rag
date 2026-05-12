# Archived Codex run prompt — audit-grade-rag PRD/skill repair pass — 2026-05-11

ARCHIVED: Superseded by `.codex-run-2026-05-11-round2.md` and retained for audit history only. Do not launch this prompt.

You are Codex running in `/home/mj/projects/audit-grade-rag/`. Project doctrine lives in `AGENTS.md`. The `docs/MASTER_PRD.md` is marked `Status: FROZEN`; this run is the explicit unfreeze for a gap-closure pass and you MUST record the status transition in §13.

## Current state (do not re-discover — verified by Isidore 2026-05-11)

The recently-upgraded GoalMode skill (`~/.claude/skills/GoalMode/`) added `Tools/PrdSpecificityGate.ts` enforcing Hard Rules #8 (documentation + wiring), #9 (no stub on provider), #10 (no §7.5 scope drift). Running the gate against this project today:

```
bun ~/.claude/skills/GoalMode/Tools/PrdSpecificityGate.ts ./ISA.md ./docs/MASTER_PRD.md
```

returns **FAIL** with four violation classes covering ~11 specific gaps:

1. `structure` — MASTER_PRD has no `## §7.5` Live-Provider Integration Tests section
2. `rule-8-missing-coverage` — six provider categories declared in ISA `## Constraints` (LLM provider, Embedding model, Vector store, PDF renderer, Auth library, UI framework) have zero matching §7.5 entries
3. `rule-9-stub-on-provider` — three ISA `## Test Strategy` rows (ISC-16..20, ISC-27..29, ISC-44..47) specify stub/mock/in-memory/fake while real providers are declared in Constraints
4. `rule-8-missing-wiring` — four filesystem gaps: no `tests/integration-live/`, no `test:integration:live` script, `check:full` doesn't chain it, `vitest.config.ts` lacks an `integration-live` project

This is the work. Do not expand it.

## Goal

Bring PrdSpecificityGate from FAIL → PASS, while simultaneously improving the GoalMode skill itself with anything you learn doing so. Three tracks, all mandatory.

## Track A — PRD repair (the main work)

1. Re-run the gate and capture the exact violations as `AUDITS/2026-05-11-prd-fix/gate-before.json`.
2. For each violation, apply the minimum fix:
   - **structure + rule-8-missing-coverage:** add `## §7.5 Live-Provider Integration Tests` to MASTER_PRD with one `### §7.5.<N>` entry per declared provider category. Each entry MUST name the specific real provider keyword recognized by `PROVIDER_CATEGORIES` (anthropic, bge-m3, pgvector, typst, webauthn, next.js OR replace next.js with the Hono+SSR-strings stack already used in `src/` — if Next.js is dropped, also remove the "UI framework" declaration from ISA Constraints so the §7.5 ↔ Constraints set stays bidirectional and no `rule-scope-drift` fires).
   - **rule-9-stub-on-provider:** rewrite the three offending ISA Test Strategy rows to remove stub/mock/in-memory/fake wording. Replace with real-provider test specifications that name the actual SDK/library (e.g. "Vitest + `@anthropic-ai/sdk` live call against `claude-sonnet-4-6`"). Preserve ISC-IDs (no renumbering, per ID-stability rule).
   - **rule-8-missing-wiring:** apply Bootstrap Phase 5 + Phase 6 doctrine:
     - Create `tests/integration-live/` with at least one `.spec.ts` per declared provider category that issues a real call when the matching API key/binary is present and **fails loudly** when absent (do not silently skip).
     - Add `"test:integration:live": "vitest run --project integration-live"` to `package.json` scripts.
     - Update `"check:full"` to chain `pnpm test:integration:live` after `pnpm test:integration`.
     - Add `{ test: { name: "integration-live", include: ["tests/integration-live/**/*.{spec,test}.ts"], testTimeout: 60000 } }` to `vitest.config.ts` projects.
3. Re-run the gate. Capture as `AUDITS/2026-05-11-prd-fix/gate-after.json`. Must exit 0 before Track A is done.
4. Record the FROZEN → modified → FROZEN status transition in MASTER_PRD `§13` per the project's own doctrine.

## Track B — Skill improvement (in-parallel)

Anywhere in Track A you hit friction the GoalMode skill should have anticipated, append a **Gotcha** to `~/.claude/skills/GoalMode/SKILL.md` (Gotchas section, append-only, no rewriting existing entries). Every entry MUST cite the specific Track A moment that surfaced it. Examples of friction worth capturing:

- "When a project ships MASTER_PRD with `Status: FROZEN` but no §7.5 at all, MasterPRD workflow Phase 3.5 should X..."
- "ISA Constraints used keyword `webauthn passkey` which PROVIDER_CATEGORIES already recognizes; ISA Constraints used `react` which it doesn't — extend PROVIDER_CATEGORIES with `react` OR canonicalize Constraints keywords"
- "L4 test for embeddings using `bge-m3` is awkward because the model is loaded locally not via API — the fail-loudly pattern needs a different signal (e.g. model file presence) — document"
- "When an ISC band like ISC-16..20 has a single stub-on-provider row covering 5 ISCs, the rewrite should split into per-ISC rows OR keep the band but name each ISC's real-provider test target"

Do not invent improvements you didn't actually need. **Cite-or-skip.** If a Gotcha doesn't have a concrete Track A trigger, don't write it.

If you change `PROVIDER_CATEGORIES` in `PrdSpecificityGate.ts` to recognize a new keyword, also update the corresponding row in `~/.claude/skills/GoalMode/SKILL.md` Tools table (the row describing the gate) so the doc reflects the new vocabulary.

## Track C — Honest README (cheap, same-PR scope)

Add an `## Implementation status` section to `README.md` immediately after the existing "Why This Exists" / "What Makes It Audit-Grade" block. Disclose for each declared provider category whether it's **wired** (real SDK call lands in `tests/integration-live/`) or **deferred** (deterministic stand-in, real wiring planned). Format: one bullet per category, plain English, no defensive hedging.

This is the G3-portfolio "honesty gradient" — recruiters reading the README must see the truth before they open `src/`.

## Constraints

- **Scope discipline.** Closing the gate + the three tracks above is the entire scope. No new features. No refactors. No documentation rewrites outside what the gate forces.
- **Atomic commits.** One provider category fix per commit. Conventional commit format. Each commit must leave `pnpm check:fast` green.
- **Final gate.** Before declaring done, `pnpm check:full` must exit 0 AND `bun ~/.claude/skills/GoalMode/Tools/PrdSpecificityGate.ts ./ISA.md ./docs/MASTER_PRD.md` must exit 0.
- **API keys.** `ANTHROPIC_API_KEY` may not be present locally. L4 tests must be wired to fail-loudly when absent. Use a `RUN_LIVE_TESTS=1` env gate so CI can opt into running the live half.
- **License file.** BSL 1.1 is a separate task, not in this run.
- **Stuck protocol.** If you hit the same approach failing twice on a single track, write `STUCK: <track> <attempt> — <reason>` to `AUDITS/2026-05-11-prd-fix/STUCK.log` and move to the next track. Do not loop.

## Done definition

ALL of the following must hold:

- [ ] `bun ~/.claude/skills/GoalMode/Tools/PrdSpecificityGate.ts ./ISA.md ./docs/MASTER_PRD.md` exits 0
- [ ] `pnpm check:full` exits 0
- [ ] ≥1 new Gotcha lands in `~/.claude/skills/GoalMode/SKILL.md` with a Track A citation
- [ ] `README.md` has the `## Implementation status` section
- [ ] MASTER_PRD `§13` records the status transition for this run
- [ ] `AUDITS/2026-05-11-prd-fix/gate-before.json` + `gate-after.json` exist
- [ ] All commits are atomic, conventional-format, and pushed to `origin/main`

Begin by running the gate and writing the violation list to AUDITS. Then work the three tracks. Report back when the Done definition holds.
