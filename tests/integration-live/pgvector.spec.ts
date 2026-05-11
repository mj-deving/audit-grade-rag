import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { disabledLiveProvider, liveProviderEnabled, requiredEnv } from "./live-provider.js";

describe("pgvector L4 provider contract", () => {
  it("runs vector SQL against Postgres when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("pgvector")).toMatchObject({
        category: "pgvector",
        live: false,
      });
      return;
    }

    const connectionString = requiredEnv("DATABASE_URL", "pgvector");
    const client = new Client({ connectionString });
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
    }
  });
});
