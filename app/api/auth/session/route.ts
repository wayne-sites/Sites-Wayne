import { NextRequest, NextResponse } from "next/server";
import { getFeatureStatus } from "@/lib/server/features";
import { bodyWithinLimit, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { acceptCurrentTerms, getUserFromAccessToken, isSupabaseAuthUnavailable, readSessionTokens, refreshSupabaseSession, setSessionCookies } from "@/lib/supabase/auth";

function authResponse(body: Record<string, unknown>, id: string, status = 200) {
  return NextResponse.json({ ...body, requestId: id }, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": id },
  });
}

export async function GET(request: NextRequest) {
  const id = requestId(request);
  if (!getFeatureStatus("auth").ready) return authResponse({ authenticated: false, enabled: false }, id);

  const { accessToken, refreshToken } = await readSessionTokens();
  if (accessToken) {
    try {
      const user = await getUserFromAccessToken(accessToken);
      return authResponse({ authenticated: true, enabled: true, user }, id);
    } catch (error) {
      if (isSupabaseAuthUnavailable(error)) {
        log("error", "auth", "session_upstream_unavailable", { requestId: id, phase: "access" });
        return authResponse({ error: "Não foi possível confirmar a sessão agora.", code: "auth_upstream_unavailable" }, id, 503);
      }
      log("warn", "auth", "access_session_invalid", { requestId: id });
    }
  }

  if (refreshToken) {
    try {
      const session = await refreshSupabaseSession(refreshToken);
      const response = authResponse({ authenticated: true, enabled: true, user: session.user }, id);
      setSessionCookies(response, session);
      log("info", "auth", "session_refreshed", { requestId: id });
      return response;
    } catch (error) {
      if (isSupabaseAuthUnavailable(error)) {
        log("error", "auth", "session_upstream_unavailable", { requestId: id, phase: "refresh" });
        return authResponse({ error: "Não foi possível renovar a sessão agora.", code: "auth_upstream_unavailable" }, id, 503);
      }
      log("warn", "auth", "session_refresh_failed", { requestId: id });
    }
  }

  return authResponse({ authenticated: false, enabled: true }, id);
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!getFeatureStatus("auth").ready) return authResponse({ error: "Login indisponível.", code: "auth_disabled" }, id, 503);
  if (!isSameOrigin(request) || !bodyWithinLimit(request, 20_000)) return authResponse({ error: "Solicitação inválida.", code: "invalid_request" }, id, 400);

  const body = await request.json().catch(() => ({})) as { accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown; acceptedTerms?: unknown };
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
  const expiresIn = Number(body.expiresIn || 3_600);
  if (!accessToken || !refreshToken || accessToken.length > 8_192 || refreshToken.length > 8_192) {
    log("warn", "auth", "callback_payload_invalid", { requestId: id });
    return authResponse({ error: "Sessão inválida.", code: "invalid_callback_session" }, id, 400);
  }

  try {
    let user = await getUserFromAccessToken(accessToken);
    if (user.user_metadata?.terms_version !== "2026-08-17") {
      if (body.acceptedTerms !== true) {
        log("warn", "auth", "callback_terms_required", { requestId: id });
        return authResponse({ error: "Aceite os Termos e a Política de Privacidade para continuar.", code: "terms_required" }, id, 400);
      }
      const updated = await acceptCurrentTerms(accessToken);
      user = updated.user || user;
    }

    const response = authResponse({ authenticated: true, user }, id);
    setSessionCookies(response, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number.isFinite(expiresIn) ? expiresIn : 3_600,
    });
    log("info", "auth", "callback_session_validated", { requestId: id });
    return response;
  } catch (error) {
    if (isSupabaseAuthUnavailable(error)) {
      log("error", "auth", "callback_upstream_unavailable", { requestId: id });
      return authResponse({ error: "Não foi possível validar a sessão agora.", code: "auth_upstream_unavailable" }, id, 503);
    }
    log("warn", "auth", "callback_session_rejected", { requestId: id });
    return authResponse({ error: "Sessão inválida.", code: "invalid_callback_session" }, id, 401);
  }
}
