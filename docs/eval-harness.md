# Eval Harness

Golden sets are JSONL files with `id`, `question`, `expected_outcome`, optional
`expected_chunks`, and `tags`. Empty files, missing IDs, duplicate IDs, missing
questions, and missing expected outcomes fail.

The gate computes groundedness, citation accuracy, refusal correctness, and
per-tag breakdown. Thresholds are groundedness `0.95`, citation accuracy `0.95`,
and refusal correctness `0.90`. `pnpm check:full` runs the eval harness.
