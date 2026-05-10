# Replay

Replay loads a ledger entry, checks corpus snapshot hash, prompt hash, embedding
model version, model version, and provider capability. Deterministic providers
must return byte-equal answers. Drift-detecting cloud profiles compare bytes and
return drift on mismatch. Unsupported profiles return replay unsupported.

Replay never edits the original ledger row; every replay result creates a new
ledger row.
