import { createVerify, randomBytes } from "node:crypto";
import type { LedgerEntry, Role } from "../../domain/types.js";
import { sha256Hex, stableId } from "../../lib/hash.js";
import type { Clock } from "../../lib/time.js";
import { systemClock } from "../../lib/time.js";
import type { AuditLedger } from "../audit/ledger.js";

export type Operator = {
  readonly id: string;
  readonly emailHash: string;
  readonly role: Role;
  readonly status: "active" | "disabled" | "deleted";
  readonly passkeyRegistered: boolean;
  readonly passkeyCredentialId: string | null;
  readonly passkeyPublicKeyPem: string | null;
  readonly tombstoneHash: string | null;
};

export type Session = {
  readonly id: string;
  readonly operatorId: string;
  readonly createdAtMs: number;
  readonly lastSeenAtMs: number;
  readonly expiresAtMs: number;
  readonly absoluteExpiresAtMs: number;
};

export type MagicLinkRequest = {
  readonly status: "accepted";
  readonly token: string;
  readonly expiresAtMs: number;
  readonly recoveryOnly: boolean;
};

export type CookiePolicy = {
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: "Strict";
  readonly maxAgeSeconds: number;
};

type Challenge = {
  readonly tokenHash: string;
  readonly emailHash: string;
  readonly expiresAtMs: number;
  readonly recoveryOnly: boolean;
  readonly consumedAtMs: number | null;
};

type AttemptWindow = {
  readonly startMs: number;
  readonly attempts: number;
};

type PasskeyChallenge = {
  readonly operatorId: string;
  readonly challenge: string;
  readonly purpose: "registration" | "authentication";
  readonly expiresAtMs: number;
  readonly consumedAtMs: number | null;
};

const magicLinkTtlMs = 10 * 60 * 1000;
const passkeyChallengeTtlMs = 5 * 60 * 1000;
const rateLimitWindowMs = 15 * 60 * 1000;
const idleTimeoutMs = 30 * 60 * 1000;
const absoluteTimeoutMs = 8 * 60 * 60 * 1000;
const maxAttempts = 5;

export class AuthService {
  readonly cookiePolicy: CookiePolicy = {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAgeSeconds: idleTimeoutMs / 1000,
  };

  private readonly operators = new Map<string, Operator>();
  private readonly challenges: Challenge[] = [];
  private readonly passkeyChallenges: PasskeyChallenge[] = [];
  private readonly sessions = new Map<string, Session>();
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly deletionTombstones = new Map<string, string>();

  constructor(
    private readonly ledger: AuditLedger,
    private readonly clock: Clock = systemClock,
  ) {}

  requestMagicLink(email: string): MagicLinkRequest {
    const emailHash = hashEmail(email);
    this.recordAttempt(emailHash);
    const operator = this.findOperatorByEmailHash(emailHash);
    const token = randomBytes(24).toString("base64url");
    const challenge: Challenge = {
      tokenHash: sha256Hex(token),
      emailHash,
      expiresAtMs: this.clock.now() + magicLinkTtlMs,
      recoveryOnly: operator?.passkeyRegistered ?? false,
      consumedAtMs: null,
    };
    this.challenges.push(challenge);
    return {
      status: "accepted",
      token,
      expiresAtMs: challenge.expiresAtMs,
      recoveryOnly: challenge.recoveryOnly,
    };
  }

  consumeMagicLink(token: string): MagicLinkConsumption {
    const tokenHash = sha256Hex(token);
    const challenge = this.challenges.find((candidate) => candidate.tokenHash === tokenHash);
    if (
      challenge === undefined ||
      challenge.consumedAtMs !== null ||
      challenge.expiresAtMs <= this.clock.now()
    ) {
      throw new Error("Magic link is invalid or expired");
    }
    const operator = this.getOrCreateOperator(challenge.emailHash);
    const consumed = { ...challenge, consumedAtMs: this.clock.now() };
    this.challenges.splice(this.challenges.indexOf(challenge), 1, consumed);
    return { operatorId: operator.id, webauthnRegistrationRequired: !operator.passkeyRegistered };
  }

  createPasskeyRegistrationOptions(operatorId: string): PasskeyOptions {
    const operator = this.requireOperator(operatorId);
    return this.createPasskeyChallenge(operator.id, "registration");
  }

  registerPasskey(input: PasskeyRegistrationInput): Operator {
    const operator = this.requireOperator(input.operatorId);
    this.consumePasskeyChallenge(operator.id, input.challenge, "registration");
    if (!verifyPasskeySignature(input.publicKeyPem, input.challenge, input.signatureBase64Url)) {
      throw new Error("WebAuthn registration failed");
    }
    const updated = {
      ...operator,
      passkeyRegistered: true,
      passkeyCredentialId: input.credentialId,
      passkeyPublicKeyPem: input.publicKeyPem,
    };
    this.operators.set(operator.id, updated);
    return updated;
  }

  createPasskeyAuthenticationOptions(operatorId: string): PasskeyOptions {
    const operator = this.requireOperator(operatorId);
    if (!operator.passkeyRegistered || operator.status !== "active") {
      throw new Error("WebAuthn login failed");
    }
    return this.createPasskeyChallenge(operator.id, "authentication");
  }

  loginWithPasskey(input: PasskeyAuthenticationInput): Session {
    const operator = this.requireOperator(input.operatorId);
    if (
      !operator.passkeyRegistered ||
      operator.passkeyCredentialId !== input.credentialId ||
      operator.passkeyPublicKeyPem === null ||
      operator.status !== "active"
    ) {
      throw new Error("WebAuthn login failed");
    }
    this.consumePasskeyChallenge(operator.id, input.challenge, "authentication");
    if (
      !verifyPasskeySignature(
        operator.passkeyPublicKeyPem,
        input.challenge,
        input.signatureBase64Url,
      )
    ) {
      throw new Error("WebAuthn login failed");
    }
    const now = this.clock.now();
    const session: Session = {
      id: stableId("sess", [operator.id, String(now), randomBytes(8).toString("hex")]),
      operatorId: operator.id,
      createdAtMs: now,
      lastSeenAtMs: now,
      expiresAtMs: now + idleTimeoutMs,
      absoluteExpiresAtMs: now + absoluteTimeoutMs,
    };
    this.sessions.set(session.id, session);
    this.ledger.append({
      entryType: "operator.login.success",
      outcome: "operator-login-success",
      userIdHash: hashOperatorId(operator.id),
      timestampMs: now,
      extra: { operatorIdHash: hashOperatorId(operator.id) },
    });
    return session;
  }

  requireSession(sessionId: string | null): Session {
    if (sessionId === null) {
      throw new UnauthorizedError("anonymous query");
    }
    const session = this.sessions.get(sessionId);
    if (session === undefined || this.isExpired(session)) {
      throw new UnauthorizedError("session expired");
    }
    return session;
  }

  tombstoneOperator(operatorId: string): Operator {
    const operator = this.requireOperator(operatorId);
    const originalUserIdHash = hashOperatorId(operator.id);
    const tombstoneHash = sha256Hex(`${operator.id}:${operator.emailHash}:deleted`);
    const updated = {
      ...operator,
      emailHash: tombstoneHash,
      status: "deleted" as const,
      tombstoneHash,
    };
    this.operators.set(operator.id, updated);
    this.deletionTombstones.set(originalUserIdHash, tombstoneHash);
    for (const [sessionId, session] of this.sessions) {
      if (session.operatorId === operatorId) {
        this.sessions.delete(sessionId);
      }
    }
    this.ledger.append({
      entryType: "operator.identity.deleted",
      outcome: "operator-identity-deleted",
      userIdHash: tombstoneHash,
      timestampMs: this.clock.now(),
      extra: { tombstoneHash },
    });
    return updated;
  }

  retentionLedgerEntries(): readonly LedgerEntry[] {
    return this.ledger.entries().map((entry) => {
      const tombstoneHash = this.deletionTombstones.get(entry.userIdHash);
      if (tombstoneHash === undefined) {
        return entry;
      }
      return {
        ...entry,
        userIdHash: tombstoneHash,
        metadata: { ...entry.metadata, operatorIdentityDeleted: true, tombstoneHash },
      };
    });
  }

  schemaColumns(): readonly string[] {
    return [
      "operators.id",
      "operator_identities.email_hash",
      "webauthn_credentials.public_key",
      "sessions.id",
    ];
  }

  getOperator(operatorId: string): Operator | undefined {
    return this.operators.get(operatorId);
  }

  private recordAttempt(emailHash: string): void {
    const now = this.clock.now();
    const current = this.attempts.get(emailHash);
    const next =
      current === undefined || now - current.startMs >= rateLimitWindowMs
        ? { startMs: now, attempts: 1 }
        : { startMs: current.startMs, attempts: current.attempts + 1 };
    if (next.attempts > maxAttempts) {
      throw new Error("Rate limit exceeded");
    }
    this.attempts.set(emailHash, next);
  }

  private getOrCreateOperator(emailHash: string): Operator {
    const existing = this.findOperatorByEmailHash(emailHash);
    if (existing !== undefined) {
      return existing;
    }
    const operator: Operator = {
      id: stableId("op", [emailHash]),
      emailHash,
      role: "operator",
      status: "active",
      passkeyRegistered: false,
      passkeyCredentialId: null,
      passkeyPublicKeyPem: null,
      tombstoneHash: null,
    };
    this.operators.set(operator.id, operator);
    return operator;
  }

  private requireOperator(operatorId: string): Operator {
    const operator = this.operators.get(operatorId);
    if (operator === undefined) {
      throw new Error(`Unknown operator: ${operatorId}`);
    }
    return operator;
  }

  private findOperatorByEmailHash(emailHash: string): Operator | undefined {
    return [...this.operators.values()].find((operator) => operator.emailHash === emailHash);
  }

  private isExpired(session: Session): boolean {
    const now = this.clock.now();
    return session.expiresAtMs <= now || session.absoluteExpiresAtMs <= now;
  }

  private createPasskeyChallenge(
    operatorId: string,
    purpose: PasskeyChallenge["purpose"],
  ): PasskeyOptions {
    const challenge = randomBytes(32).toString("base64url");
    const expiresAtMs = this.clock.now() + passkeyChallengeTtlMs;
    this.passkeyChallenges.push({
      operatorId,
      challenge,
      purpose,
      expiresAtMs,
      consumedAtMs: null,
    });
    return { operatorId, challenge, expiresAtMs };
  }

  private consumePasskeyChallenge(
    operatorId: string,
    challenge: string,
    purpose: PasskeyChallenge["purpose"],
  ): void {
    const found = this.passkeyChallenges.find(
      (candidate) =>
        candidate.operatorId === operatorId &&
        candidate.challenge === challenge &&
        candidate.purpose === purpose,
    );
    if (
      found === undefined ||
      found.consumedAtMs !== null ||
      found.expiresAtMs <= this.clock.now()
    ) {
      throw new Error("WebAuthn challenge is invalid or expired");
    }
    const consumed = { ...found, consumedAtMs: this.clock.now() };
    this.passkeyChallenges.splice(this.passkeyChallenges.indexOf(found), 1, consumed);
  }
}

export type MagicLinkConsumption = {
  readonly operatorId: string;
  readonly webauthnRegistrationRequired: boolean;
};

export type PasskeyOptions = {
  readonly operatorId: string;
  readonly challenge: string;
  readonly expiresAtMs: number;
};

export type PasskeyRegistrationInput = {
  readonly operatorId: string;
  readonly credentialId: string;
  readonly publicKeyPem: string;
  readonly challenge: string;
  readonly signatureBase64Url: string;
};

export type PasskeyAuthenticationInput = {
  readonly operatorId: string;
  readonly credentialId: string;
  readonly challenge: string;
  readonly signatureBase64Url: string;
};

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function hashEmail(email: string): string {
  return sha256Hex(email.trim().toLowerCase());
}

export function hashOperatorId(operatorId: string): string {
  return sha256Hex(operatorId);
}

function verifyPasskeySignature(
  publicKeyPem: string,
  challenge: string,
  signatureBase64Url: string,
): boolean {
  const verifier = createVerify("SHA256");
  verifier.update(challenge);
  verifier.end();
  return verifier.verify(publicKeyPem, Buffer.from(signatureBase64Url, "base64url"));
}

export function sessionCookieHeader(sessionId: string, policy: CookiePolicy): string {
  return [
    `agr_session=${encodeURIComponent(sessionId)}`,
    "Path=/",
    `Max-Age=${String(policy.maxAgeSeconds)}`,
    "HttpOnly",
    "Secure",
    `SameSite=${policy.sameSite}`,
  ]
    .filter((part) => part.length > 0)
    .join("; ");
}
