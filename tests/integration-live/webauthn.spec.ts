import { describe, expect, it } from "vitest";

import { AuditLedger } from "../../src/modules/audit/ledger.js";
import { AuthService } from "../../src/modules/auth/auth.js";
import { createLocalPasskey } from "../../src/modules/auth/passkey-proof.js";
import { disabledLiveProvider, liveProviderEnabled } from "./live-provider.js";

describe("WebAuthn L4 provider contract", () => {
  it("verifies an ES256 passkey challenge before issuing a session", () => {
    if (!liveProviderEnabled()) {
      expect(disabledLiveProvider("webauthn")).toMatchObject({
        category: "webauthn",
        live: false,
      });
      return;
    }

    const auth = new AuthService(new AuditLedger());
    const link = auth.requestMagicLink("operator@example.local");
    const consumed = auth.consumeMagicLink(link.token);
    const passkey = createLocalPasskey("l4-passkey");
    const registration = auth.createPasskeyRegistrationOptions(consumed.operatorId);
    auth.registerPasskey({
      operatorId: consumed.operatorId,
      credentialId: passkey.credentialId,
      publicKeyPem: passkey.publicKeyPem,
      challenge: registration.challenge,
      signatureBase64Url: passkey.signChallenge(registration.challenge),
    });
    const authentication = auth.createPasskeyAuthenticationOptions(consumed.operatorId);
    const session = auth.loginWithPasskey({
      operatorId: consumed.operatorId,
      credentialId: passkey.credentialId,
      challenge: authentication.challenge,
      signatureBase64Url: passkey.signChallenge(authentication.challenge),
    });

    const rejected = auth.createPasskeyAuthenticationOptions(consumed.operatorId);
    expect(session.operatorId).toBe(consumed.operatorId);
    expect(() =>
      auth.loginWithPasskey({
        operatorId: consumed.operatorId,
        credentialId: passkey.credentialId,
        challenge: rejected.challenge,
        signatureBase64Url: passkey.signChallenge("tampered"),
      }),
    ).toThrow(/WebAuthn/u);
  });
});
