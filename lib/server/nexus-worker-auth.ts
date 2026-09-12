import "server-only";
import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "nxw1_";
const TOKEN_PATTERN = /^nxw1_[A-Za-z0-9_-]{43}$/;
const PAIRING_PREFIX = "nxp1_";
const PAIRING_PATTERN = /^nxp1_[A-Za-z0-9_-]{16}$/;

export function createNexusWorkerCredential() {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashNexusWorkerToken(token)! };
}

export function createNexusWorkerPairingCode() {
  const code = `${PAIRING_PREFIX}${randomBytes(12).toString("base64url")}`;
  return { code, codeHash: hashNexusWorkerPairingCode(code)! };
}

export function hashNexusWorkerToken(token: unknown) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashNexusWorkerPairingCode(code: unknown) {
  if (typeof code !== "string" || !PAIRING_PATTERN.test(code)) return null;
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function workerTokenFromAuthorization(value: string | null) {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match) return null;
  const token = match[1].trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}
