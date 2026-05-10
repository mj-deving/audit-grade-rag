# Audit Ledger

The audit ledger appends canonical JSON payloads, links each row to the previous
hash, and signs each row with an Ed25519 key. Query answers, refusals, blocked
outputs, replay outcomes, report generation, ingest completion, and operator
identity deletion are ledgered.

Verification walks sequence order, recomputes canonical payload hashes, checks
previous-hash linkage, and names the first invalid row. Export produces
`audit-ledger.sqlite`, `audit-ledger.signatures.json`, and `manifest.json`.
