import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DockerConfig = {
  readonly dir: string;
  cleanup(): Promise<void>;
};

export async function createDockerConfig(): Promise<DockerConfig> {
  const dir = await mkdtemp(join(tmpdir(), "agr-live-docker-config-"));
  await writeFile(join(dir, "config.json"), "{}");
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export async function docker(
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

export async function dockerPort(
  containerName: string,
  containerPort: string,
  dockerConfigDir: string,
): Promise<string> {
  const output = await docker("port", [containerName, containerPort], dockerConfigDir);
  const port = output.match(/:(\d+)$/u)?.[1];
  if (port === undefined) {
    throw new Error(`could not discover ${containerPort} port for ${containerName}`);
  }
  return port;
}
