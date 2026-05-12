import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { disabledLiveProvider, liveProviderEnabled, optionalEnv } from "./live-provider.js";

const execFileAsync = promisify(execFile);

describe("pgvector L4 provider contract", () => {
  it("runs vector SQL against Postgres when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("pgvector")).toMatchObject({
        category: "pgvector",
        live: false,
      });
      return;
    }

    const database = await postgresDatabase();
    const client = new Client({ connectionString: database.url });
    await client.connect();

    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      const result = await client.query<{ distance: string }>(
        "SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance",
      );
      const distance = Number(result.rows[0]?.distance);
      expect(distance).toBeCloseTo(1, 6);
    } finally {
      await client.end();
      await database.cleanup();
    }
  });
});

type DatabaseHandle = {
  readonly url: string;
  cleanup(): Promise<void>;
};

async function postgresDatabase(): Promise<DatabaseHandle> {
  const configured = optionalEnv("DATABASE_URL");
  if (configured !== undefined) {
    return { url: configured, cleanup: () => Promise.resolve() };
  }

  const dockerConfigDir = await mkdtemp(join(tmpdir(), "agr-live-docker-config-"));
  await writeFile(join(dockerConfigDir, "config.json"), "{}");
  const name = `agr-live-pgvector-${String(process.pid)}-${String(Date.now())}`;
  await docker(
    "run",
    [
      "--rm",
      "-d",
      "--name",
      name,
      "-e",
      "POSTGRES_DB=audit_grade_rag",
      "-e",
      "POSTGRES_USER=audit_grade_rag",
      "-e",
      "POSTGRES_PASSWORD=audit_grade_rag",
      "-p",
      "127.0.0.1::5432",
      "pgvector/pgvector:pg16",
    ],
    dockerConfigDir,
  );
  const port = await dockerPort(name, dockerConfigDir);
  await waitForPostgres(name, dockerConfigDir);
  const url = `postgres://audit_grade_rag:audit_grade_rag@127.0.0.1:${port}/audit_grade_rag`;
  await waitForSql(url);
  return {
    url,
    cleanup: async () => {
      await docker("rm", ["-f", name], dockerConfigDir);
      await rm(dockerConfigDir, { recursive: true, force: true });
    },
  };
}

async function waitForSql(url: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("postgres did not accept SQL connections");
}

async function docker(
  command: string,
  args: readonly string[],
  dockerConfigDir: string,
): Promise<string> {
  const result = await execFileAsync("docker", [command, ...args], {
    encoding: "utf8",
    env: { ...process.env, DOCKER_CONFIG: dockerConfigDir },
  });
  return result.stdout.trim();
}

async function dockerPort(containerName: string, dockerConfigDir: string): Promise<string> {
  const output = await docker("port", [containerName, "5432/tcp"], dockerConfigDir);
  const port = output.match(/:(\d+)$/u)?.[1];
  if (port === undefined) {
    throw new Error(`could not discover postgres port for ${containerName}`);
  }
  return port;
}

async function waitForPostgres(containerName: string, dockerConfigDir: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await docker(
        "exec",
        [containerName, "pg_isready", "-U", "audit_grade_rag", "-d", "audit_grade_rag"],
        dockerConfigDir,
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`postgres container ${containerName} did not become ready`);
}
