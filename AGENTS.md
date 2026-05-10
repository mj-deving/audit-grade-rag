---
name: Doctrine
purpose: PAI accumulated coding doctrine, ported into the shape of a Codex AGENTS.md so Codex inherits PAI's testing philosophy, anti-slop rules, naming conventions, and engineering standards
sources:
  - ~/.claude/CLAUDE.md (Operational Rules + Local Operating Rules)
  - ~/.claude/PAI/USER/DA_IDENTITY.md (Engineering Standards)
  - ~/.claude/PAI/USER/DA/isidore/opinions.yaml (failure modes, anti-slop mandate)
  - ~/.claude/skills/TDD/SKILL.md (test pyramid)
  - ~/.claude/skills/CodeReview/SKILL.md (5-axis evaluation)
  - ~/.claude/skills/Frontend/SKILL.md (anti-slop rules)
  - ~/.claude/PAI/Patterns/README.md (Verification-First, Plan-Before-Build, Context > Prompts)
---

# PAI Doctrine for Codex (port into project AGENTS.md)

> **What this is.** The PAI engineering doctrine, condensed and re-shaped for Codex consumption. The Bootstrap workflow appends this to a project's `AGENTS.md` so Codex inherits PAI's accumulated wisdom. Edit project-specific overrides at the bottom of the generated `AGENTS.md`, never in this template.

---

## §1. Engineering standards (non-negotiable)

1. **Solve the actual problem, not a nearby easy one.** Trace root causes. Never patch symptoms.
2. **Every claim is verified.** No "should work" — run it, read it, prove it.
3. **Code is crafted, not generated.** Write each line as if it ships to production today.
4. **Simplicity is the highest sophistication.** Fewest moving parts that fully solve the problem.
5. **Own the outcome.** Don't hand back partial work. Downstream breakage is your problem.
6. **Build over ask for reversible actions.** Editing a file is reversible. Force-push is not. Match action to risk.

## §2. Anti-slop rules (hard refusals)

Generic AI patterns are forbidden in code, comments, commit messages, and PR descriptions:

- No "in essence", "let's explore", "comprehensive", "robust" as filler.
- No em-dash rhythm tics, no tricolon-as-rhythm.
- No "this elegantly handles…" — describe what it does, not how good it is.
- No comments that restate what the code says ("// increment counter").
- No "should work" status reports — verified or not, no in-between.

If a draft contains these patterns, REWRITE the line. Do not ship it.

## §3. Code style (file-level)

- **TypeScript strict** is required. No `any` without a `// FIXME(type):` comment naming the unknown.
- **Files < 500 LOC.** If a file approaches 500, split BEFORE adding the next feature.
- **Functions < 60 LOC** (Biome `noExcessiveCognitiveComplexity` enforces this).
- **Names describe purpose, not type** (`scoreCandidates`, not `processArray`).
- **No dead code.** `knip` runs on every build; output must be empty.
- **Default to no comments.** Comment only when the WHY is non-obvious.

## §4. Tests (the 3-layer pyramid)

| Layer | What | Forbidden |
|---|---|---|
| **L1 unit** | Pure logic, mocks fast | `expect(1+1).toBe(2)` mock-slop |
| **L2 integration** | Real DB (SQLite or pg-tmp), real CLI spawns, real file I/O | Mocking layers you actually own |
| **L3 end-to-end** | Docker prod-sim, real HTTP, real agent loops | Skipping the auth layer "for speed" |

**Hard rules:**
- `.skip()` on a test is a build failure (custom ESLint rule).
- A new feature lands with at least L1 + L2 tests.
- L3 runs in CI, not on every commit.
- Every test names what it's mocking and why, in a header comment.

## §5. Verification-first (PAI Pattern P3)

> *"Give Claude a way to verify = 2-3x quality"* — Cherney via PAI Patterns.

Before writing code that does X, write the verification *for* X:
- A test that fails until X works.
- A `pnpm verify:<x>` script with exit code 0 = pass.
- A grep-able log line so the run can be checked from outside.

Without verification, do not start.

## §6. Commit hygiene

- Atomic commits — one logical change per commit.
- Subject line ≤ 72 chars, imperative mood.
- Body explains WHY, not WHAT (the diff shows what).
- **Never `--no-verify`.** lefthook is enforcement, not friction.
- **Never amend a pushed commit.** Stack a fix instead.

## §7. Logging

- One centralized logger module per project (e.g. `src/lib/logger.ts`).
- Log levels: `trace` `debug` `info` `warn` `error`.
- `info` is for state transitions, not "entered function" noise.
- `error` includes a structured cause chain (`{ at, cause, retryable }`).
- Never `console.log` — caught by ESLint custom rule.

## §8. Security

- Never hardcode secrets. Use `.env` + `dotenv-safe`.
- Never log secret values, even at `trace`.
- Validate at boundaries (HTTP/CLI input), trust internal calls.
- Run `pnpm audit --prod` and fail build on high+ vulnerabilities.
- For dependencies: prefer fewer, prefer well-maintained, prefer typed.

## §9. Architecture (PAI Pattern P5: Context > Prompts)

- A project has ONE `AGENTS.md` at root that names: stack, layout, build, test, ship.
- A project's logic is grouped by *concern*, not by *type* (`features/billing/`, not `controllers/billing/`).
- Cross-feature shared code goes to `src/lib/`. If a function in `lib/` is used by only one feature, move it back.

## §10. Failure modes the agent must avoid

(Adapted from PAI `opinions.yaml` — observed in human collaborators, equally true of agents.)

- **scope-drift** — quietly widening the goal mid-task. If a new requirement appears, it goes to a follow-up issue, not the current PR.
- **rushing** — shipping the second draft when the third would clear the bar. Run the eval pass before claiming done.
- **premature-close-on-iteration** — refining loops cut off before convergence. If output is close-but-not-stellar, do one more pass.
- **plan-too-narrow / discipline-gap** — broaden the plan up front; once set, refuse scope additions inside the execution window.
- **`--no-verify` shortcut** — never. If the gate fails, fix the gate or fix the code, do not bypass.

## §11. The "done" contract

Codex may report "done" only when ALL of:

- [ ] `pnpm check:full` exits 0 (this single command runs typecheck + lint + unit + knip + integration + e2e — see Bootstrap Phase 6 scripts)
- [ ] `pnpm build` exits 0
- [ ] All Master PRD §9 acceptance criteria are checked off
- [ ] No new ESLint warnings introduced (warnings count must be ≤ baseline)
- [ ] Commit hygiene verified (atomic, imperative, lefthook fast-gate passed on every commit, no `--no-verify`)
- [ ] No `.skip`, `.only`, `xit`, `xdescribe`, or `it.todo` introduced
- [ ] No `console.*` calls introduced (logger.ts only)
- [ ] No new `// FIXME` or `// TODO` comments without an associated PRD line reference

Anything less and the agent keeps working. The fast gate (lefthook pre-commit) is *not* sufficient — it skips integration + e2e for latency reasons. The done-contract requires `pnpm check:full`.

---

## Project-specific

- Master PRD: `docs/MASTER_PRD.md` (FROZEN — do not edit requirements unless §13 records the status update)
- Stack: Node 22, pnpm 9, TypeScript strict, Vitest, Biome, ESLint, knip, lefthook, GitHub Actions
- Build: `pnpm build`
- Test (fast, pre-commit): `pnpm check:fast`
- Test (full, agent-done gate): `pnpm check:full`
- Run dev: `pnpm dev`
- Done contract: see `docs/MASTER_PRD.md` §11
