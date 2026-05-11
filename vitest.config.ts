import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { provider: "v8", reporter: ["text", "json"] },
    projects: [
      { test: { name: "unit", include: ["src/**/*.unit.test.ts"] } },
      {
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          pool: "forks",
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: "integration-live",
          include: ["tests/integration-live/**/*.{spec,test}.ts"],
          testTimeout: 60000,
        },
      },
    ],
  },
});
