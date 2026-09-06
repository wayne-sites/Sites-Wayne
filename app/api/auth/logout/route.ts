import { NextRequest, NextResponse } from "next/server";
import { apiError, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { clearSessionCookies, readSessionTokens, revokeSupabaseSession } from "@/lib/supabase/auth";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  const { accessToken } = await readSessionTokens();
  const revoked = !accessToken || await revokeSupabaseSession(accessToken);
  if (!revoked) log("warn", "auth", "logout_upstream_unavailable", { requestId: id });
  const response = NextResponse.json({ ok: true, requestId: id }, { headers: { "cache-control": "no-store", "x-request-id": id } });
  clearSessionCookies(response);
  return response;
}
