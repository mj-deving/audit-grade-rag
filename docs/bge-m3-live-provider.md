# bge-m3 Live Provider Runbook

This runbook covers the remaining L4 embedding-provider gate. The live test is
`tests/integration-live/bge-m3.spec.ts`.

## Preferred: Shared Host TEI

Use this path when WSL should not spend local CPU, memory, or disk on the bge-m3
model.

Required operator input:

- SSH target reachable from WSL, for example `user@host` or an SSH config alias.
- Whether Docker is already available on that host.
- Allowed host resource budget: CPU, RAM, and disk.
- Whether the TEI container should remain running after verification.
- Preferred local tunnel port. Default: `18080`.

Remote TEI command shape:

```bash
docker run --rm -d \
  --name audit-grade-rag-bge-m3 \
  --cpus 2 \
  --memory 4g \
  -p 127.0.0.1:18080:80 \
  -v "$HOME/audit-grade-rag-bge-m3-cache:/data" \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-m3 \
  --served-model-name bge-m3 \
  --dtype float16 \
  --max-batch-tokens 1024 \
  --max-concurrent-requests 8 \
  --max-client-batch-size 1
```

Local tunnel command shape:

```bash
ssh -N -L 127.0.0.1:18080:127.0.0.1:18080 <ssh-target>
```

Verification command:

```bash
RUN_LIVE_TESTS=1 \
BGE_M3_EMBEDDING_ENDPOINT=http://127.0.0.1:18080/v1/embeddings \
pnpm test:integration:live
```

## Local WSL Fallback

Use this path only when the WSL resource budget is acceptable. The test starts a
local TEI container and stores model artifacts under ignored `.live-cache/bge-m3`.
A cold cache downloads the 2.2 GB ONNX data shard.

Default local caps:

- `BGE_M3_DOCKER_CPUS=2`
- `BGE_M3_DOCKER_MEMORY=4g`
- `BGE_M3_STARTUP_TIMEOUT_SECONDS=7200`

Command:

```bash
RUN_LIVE_TESTS=1 pnpm exec vitest run --project integration-live tests/integration-live/bge-m3.spec.ts
```

Stop any local TEI container if the run is interrupted:

```bash
docker ps --format '{{.Names}}' | rg '^agr-live-bge-m3-' | xargs -r docker rm -f
```

## Endpoint Contract

The endpoint must accept OpenAI-compatible embedding requests:

```json
{"input":["DACH compliance query with German regulatory vocabulary."],"model":"bge-m3"}
```

The response must include `data[0].embedding` with numeric vector values.
