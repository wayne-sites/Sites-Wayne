import "server-only";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { fetchSafeGet } from "@/lib/server/http";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "nexus-builder-agent";
const REPOSITORY = "wayne-sites/Sites-Wayne";
const WORKFLOW_REF = "wayne-sites/Sites-Wayne/.github/workflows/nexus-builder-agent-worker.yml@refs/heads/main";

type OidcHeader = { alg?: string; kid?: string; typ?: string };
type OidcClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  repository?: string;
  ref?: string;
  workflow_ref?: string;
  run_id?: string;
  run_attempt?: string;
  actor?: string;
};

type Jwk = {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
};

let cachedJwks: { expiresAt: number; keys: Jwk[] } | null = null;

function decodeJson<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

async function getJwks() {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;
  const configResponse = await fetchSafeGet(`${ISSUER}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!configResponse.ok) throw new Error("github_oidc_configuration_unavailable");
  const configuration = await configResponse.json() as { jwks_uri?: string };
  if (!configuration.jwks_uri || !configuration.jwks_uri.startsWith(`${ISSUER}/`)) {
    throw new Error("github_oidc_jwks_invalid");
  }
  const jwksResponse = await fetchSafeGet(configuration.jwks_uri, { cache: "no-store" });
  if (!jwksResponse.ok) throw new Error("github_oidc_jwks_unavailable");
  const jwks = await jwksResponse.json() as { keys?: Jwk[] };
  if (!Array.isArray(jwks.keys) || !jwks.keys.length) throw new Error("github_oidc_keys_missing");
  cachedJwks = { keys: jwks.keys, expiresAt: Date.now() + 10 * 60_000 };
  return jwks.keys;
}

export async function verifyBuilderWorkerToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) throw new Error("github_oidc_bearer_missing");
  const token = authorization.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("github_oidc_token_invalid");

  const header = decodeJson<OidcHeader>(parts[0]);
  const claims = decodeJson<OidcClaims>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("github_oidc_algorithm_invalid");

  const keys = await getJwks();
  const jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) throw new Error("github_oidc_key_missing");

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const verified = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], "base64url"),
  );
  if (!verified) throw new Error("github_oidc_signature_invalid");

  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER) throw new Error("github_oidc_issuer_invalid");
  if (!audience.includes(AUDIENCE)) throw new Error("github_oidc_audience_invalid");
  if (!claims.exp || claims.exp <= now - 15) throw new Error("github_oidc_expired");
  if (claims.nbf && claims.nbf > now + 15) throw new Error("github_oidc_not_yet_valid");
  if (claims.repository !== REPOSITORY) throw new Error("github_oidc_repository_invalid");
  if (claims.ref !== "refs/heads/main") throw new Error("github_oidc_ref_invalid");
  if (claims.workflow_ref !== WORKFLOW_REF) throw new Error("github_oidc_workflow_invalid");
  if (!claims.run_id) throw new Error("github_oidc_run_id_missing");

  return {
    workerId: `${claims.run_id}:${claims.run_attempt || "1"}`,
    runId: claims.run_id,
    actor: claims.actor || "github-actions",
  };
}
