import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import { disabledLiveProvider, liveProviderEnabled } from "./live-provider.js";

describe("WebAuthn L4 provider contract", () => {
  it("verifies an ES256 passkey-style challenge when live provider tests are enabled", async () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("webauthn")).toMatchObject({
        category: "webauthn",
        live: false,
      });
      return;
    }

    const keyPair = await webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const challenge = new TextEncoder().encode("audit-grade-rag-webauthn-challenge");
    const signature = await webcrypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      challenge,
    );
    const verified = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.publicKey,
      signature,
      challenge,
    );

    expect(verified).toBe(true);
  });
});
