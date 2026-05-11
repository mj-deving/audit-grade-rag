# Eval Harness

The v1 golden set lives at `eval/golden/v1.jsonl`. The fixture corpus lives at
`corpus-fixtures/` and contains attribution-cleared German excerpts from EU AI
Act Article 50.

Golden sets are JSONL files with `id`, `question`, `expected_outcome`, optional
`expected_chunks`, and `tags`. The required v1 tags are represented in the
committed file: `ambiguous`, `out-of-corpus`, `contradictory`, `multi-hop`, and
`numerical`. Empty files, missing IDs, duplicate IDs, missing questions, and
missing expected outcomes fail.

The gate computes groundedness, citation accuracy, refusal correctness, and
per-tag breakdown. Thresholds are groundedness `0.95`, citation accuracy `0.95`,
and refusal correctness `0.90`. `pnpm eval` exits non-zero when any threshold is
missed or the golden set is empty. `pnpm check:full` runs the eval harness.

The default pinned tuple for `pnpm eval` is:

- model: `stub-llm@1.0.0`
- prompt: `eval-prompt@1.0.0`
- embedding model: `bge-m3@local-1024-v1`
- corpus snapshot: `corpus-fixtures:v1`
