import { NextResponse } from "next/server";

function decodeClaims(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const token = process.env.VERCEL_OIDC_TOKEN || "";
  const claims = token ? decodeClaims(token) : null;
  return NextResponse.json({
    configured: Boolean(token),
    claims: claims ? {
      iss: claims.iss,
      aud: claims.aud,
      sub: claims.sub,
      owner: claims.owner,
      owner_id: claims.owner_id,
      project: claims.project,
      project_id: claims.project_id,
      environment: claims.environment,
    } : null,
  }, { headers: { "cache-control": "no-store" } });
}
