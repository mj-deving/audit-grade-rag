# Admin Runbook

## Backup

Back up Postgres, the SQLite ledger files, WAL/SHM companions, signing keys, and
report artifacts together. Store backups encrypted.

## Restore

Restore storage, start the application in read-only verification mode, run
`pnpm audit:verify`, and only then enable operator traffic.

## Incidents

Provider outage: switch to deterministic local profile or pause generation.
Eval failure: block release until the failing case is corrected or the corpus is
updated. Replay drift: inspect named artifact before trusting historical output.
Tamper detection: preserve the failed export and rotate exposed keys.
