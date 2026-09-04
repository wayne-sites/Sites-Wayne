import { NextRequest, NextResponse } from "next/server";
import { isAcceptableNewPassword } from "@/lib/auth-security";
import { getFeatureStatus } from "@/lib/server/features";
import { apiError, bodyWithinLimit, clientIp, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";
import { isSupabaseAuthUnavailable, updatePassword } from "@/lib/supabase/auth";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!getFeatureStatus("auth").ready) return apiError("Recurso indisponível.", 503, id, "auth_disabled");
  if (!isSameOrigin(request) || !bodyWithinLimit(request, 16_384)) return apiError("Solicitação inválida.", 400, id, "invalid_request");
  const usage = rateLimit(`auth-password:${clientIp(request)}`, 5, 60 * 60_000);
  if (!usage.allowed) return apiError("Muitas tentativas.", 429, id, "rate_limited");
  const body = await request.json().catch(() => ({})) as { accessToken?: unknown; password?: unknown };
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!accessToken || accessToken.length > 8_192 || !isAcceptableNewPassword(password)) return apiError("Link inválido ou senha com menos de 12 caracteres.", 400, id, "invalid_password_reset");
  try { await updatePassword(accessToken, password); return NextResponse.json({ ok: true, requestId: id }); }
  catch (error) {
    if (isSupabaseAuthUnavailable(error)) {
      log("error", "auth", "password_update_upstream_unavailable", { requestId: id });
      return apiError("O serviço de senha está temporariamente indisponível. Tente novamente.", 503, id, "auth_upstream_unavailable");
    }
    log("warn", "auth", "password_update_failed", { requestId: id });
    return apiError("O link expirou ou já foi utilizado.", 400, id, "expired_recovery");
  }
}
