# Data Residency

The default install runs on customer-controlled infrastructure. Corpus files,
Postgres/pgvector retrieval rows, SQLite audit-ledger files, Typst report
artifacts, operator sessions, and operator identity mappings stay inside the
deployment boundary.

## Supported V1 Regions

- Customer-operated on-prem infrastructure in Germany, Austria, Switzerland, or
  another EEA/EU member state.
- Customer-owned cloud accounts pinned to an EEA/EU region, with Postgres,
  object storage, and application runtime deployed in the same region.
- Air-gapped or restricted-network deployments when the configured LLM endpoint
  is reachable inside the customer network through an on-prem vLLM-compatible
  endpoint.

Deployments outside those regions are not a v1 support target because they need
customer-specific transfer-impact analysis, processor terms, and retention
policy review.

## Default Install Boundary

The default `docker-compose.yml` profile starts Postgres with pgvector and the
application locally. It does not require hosted analytics, telemetry, search,
vector database, document-processing, or reporting services. SQLite ledger
exports and report ZIPs are written to local disk.

The only permitted outbound egress in v1 is the configured LLM provider call.
The default cloud allowlist is `api.anthropic.com`. Customers can replace that
with an internal OpenAI-compatible vLLM endpoint to keep inference traffic
on-prem. All other third-party egress is blocked by policy and covered by tests.

Operational logs may contain `user_id_hash`, `query_id`, `latency_ms`, and
`outcome` at INFO. Query text, retrieved-chunk text, generated-answer text, and
prompt content belong in the signed audit ledger, not in ordinary logs.
