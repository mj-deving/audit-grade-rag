import { describe, expect, it } from "vitest";

import { createHttpApp } from "../../src/app/http-app.js";
import { createRuntimeApp } from "../../src/app/runtime-app.js";
import { disabledLiveProvider, liveProviderEnabled } from "./live-provider.js";

describe("Hono SSR UI framework L4 provider contract", () => {
  it("renders the real operator console route when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("hono-ssr")).toMatchObject({
        category: "hono-ssr",
        live: false,
      });
      return;
    }

    const runtime = createRuntimeApp();
    const session = runtime.bootstrapOperator("operator@example.local");
    const app = createHttpApp(runtime);
    const response = await app.request("/console", {
      headers: { cookie: `agr_session=${encodeURIComponent(session.id)}` },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(html).toContain("Korpusfrage");
    expect(html).toContain("Audit-Spur");
    expect(html).toContain('<main class="workspace" id="main">');
  });
});
