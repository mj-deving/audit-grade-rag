import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createDockerConfig, type DockerConfig, docker, dockerPort } from "./docker.js";
import {
  disabledLiveProvider,
  liveProviderEnabled,
  optionalBearerHeaders,
  optionalEnv,
} from "./live-provider.js";

describe("bge-m3 L4 provider contract", () => {
  it("calls an OpenAI-compatible bge-m3 embedding endpoint when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("bge-m3")).toMatchObject({
        category: "bge-m3",
        live: false,
      });
      return;
    }

    const endpoint = await bgeM3Endpoint();
    try {
      const payload = await callBgeM3(endpoint.url);
      expect(hasNumericEmbedding(payload)).toBe(true);
    } finally {
      await endpoint.cleanup();
    }
  }, 7_200_000);
});

type EmbeddingEndpoint = {
  readonly url: string;
  cleanup(): Promise<void>;
};

async function bgeM3Endpoint(): Promise<EmbeddingEndpoint> {
  const configured = optionalEnv("BGE_M3_EMBEDDING_ENDPOINT");
  if (configured !== undefined) {
    return { url: configured, cleanup: () => Promise.resolve() };
  }

  return startTeiBgeM3Endpoint();
}

async function startTeiBgeM3Endpoint(): Promise<EmbeddingEndpoint> {
  const dockerConfig = await createDockerConfig();
  const cacheDir = optionalEnv("BGE_M3_CACHE_DIR") ?? join(process.cwd(), ".live-cache", "bge-m3");
  await mkdir(cacheDir, { recursive: true });
  const image =
    optionalEnv("BGE_M3_DOCKER_IMAGE") ??
    "ghcr.io/huggingface/text-embeddings-inference:cpu-latest";
  const name = `agr-live-bge-m3-${String(process.pid)}-${String(Date.now())}`;
  let started = false;

  try {
    await docker(
      "run",
      [
        "--rm",
        "-d",
        "--name",
        name,
        "-p",
        "127.0.0.1::80",
        "-v",
        `${cacheDir}:/data`,
        image,
        "--model-id",
        "BAAI/bge-m3",
        "--served-model-name",
        "bge-m3",
        "--dtype",
        optionalEnv("BGE_M3_DTYPE") ?? "float16",
        "--max-batch-tokens",
        optionalEnv("BGE_M3_MAX_BATCH_TOKENS") ?? "1024",
        "--max-concurrent-requests",
        optionalEnv("BGE_M3_MAX_CONCURRENT_REQUESTS") ?? "8",
        "--max-client-batch-size",
        "1",
      ],
      dockerConfig.dir,
    );
    started = true;
    const port = await dockerPort(name, "80/tcp", dockerConfig.dir);
    const url = `http://127.0.0.1:${port}/v1/embeddings`;
    await waitForBgeM3(url, name, dockerConfig);
    return {
      url,
      cleanup: async () => {
        await docker("rm", ["-f", name], dockerConfig.dir);
        await dockerConfig.cleanup();
      },
    };
  } catch (error) {
    if (started) {
      await docker("rm", ["-f", name], dockerConfig.dir).catch(() => undefined);
    }
    await dockerConfig.cleanup();
    throw error;
  }
}

async function waitForBgeM3(
  endpoint: string,
  containerName: string,
  dockerConfig: DockerConfig,
): Promise<void> {
  const timeoutSeconds = Number(optionalEnv("BGE_M3_STARTUP_TIMEOUT_SECONDS") ?? "7200");
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastFailure = "not attempted";

  while (Date.now() < deadline) {
    try {
      const payload = await callBgeM3(endpoint);
      if (hasNumericEmbedding(payload)) {
        return;
      }
      lastFailure = `response did not contain numeric embedding: ${JSON.stringify(payload)}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const logs = await docker("logs", ["--tail", "80", containerName], dockerConfig.dir).catch(
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  throw new Error(
    `bge-m3 TEI endpoint did not become ready within ${String(
      timeoutSeconds,
    )}s; last failure: ${lastFailure}; logs: ${logs}`,
  );
}

async function callBgeM3(endpoint: string): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...optionalBearerHeaders(optionalEnv("BGE_M3_API_KEY")),
    },
    body: JSON.stringify({
      input: ["DACH compliance query with German regulatory vocabulary."],
      model: "bge-m3",
    }),
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      `bge-m3 live call failed with ${String(response.status)}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function hasNumericEmbedding(payload: unknown): boolean {
  if (!hasDataArray(payload)) {
    return false;
  }

  const first = payload.data[0];
  if (!hasEmbeddingArray(first)) {
    return false;
  }

  return first.embedding.some((value) => typeof value === "number");
}

function hasDataArray(value: unknown): value is { data: unknown[] } {
  const candidate = value as { data?: unknown };
  return isRecord(value) && Array.isArray(candidate.data);
}

function hasEmbeddingArray(value: unknown): value is { embedding: unknown[] } {
  const candidate = value as { embedding?: unknown };
  return isRecord(value) && Array.isArray(candidate.embedding);
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
