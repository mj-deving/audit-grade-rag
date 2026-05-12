import { generateKeyPairSync, sign } from "node:crypto";

export type LocalPasskey = {
  readonly credentialId: string;
  readonly publicKeyPem: string;
  signChallenge(challenge: string): string;
};

export function createLocalPasskey(credentialId = "local-passkey"): LocalPasskey {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const exportedPublicKey = publicKey.export({ format: "pem", type: "spki" });
  return {
    credentialId,
    publicKeyPem: exportedPublicKey,
    signChallenge: (challenge) =>
      sign("SHA256", Buffer.from(challenge), privateKey).toString("base64url"),
  };
}
