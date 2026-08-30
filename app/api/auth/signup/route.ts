import { NextRequest, NextResponse } from "next/server";
import { applicationOrigin } from "@/lib/app-origin";
import { isAcceptableNewPassword, normalizeCaptchaToken } from "@/lib/auth-security";
import { getFeatureStatus } from "@/lib/server/features";
import { apiError, bodyWithinLimit, clientIp, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";
import { isSupabaseAuthUnavailable, isSupabaseRateLimited, setSessionCookies, signUpWithPassword } from "@/lib/supabase/auth";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!getFeatureStatus("auth").ready) return apiError("O cadastro ainda não foi ativado.", 503, id, "auth_disabled");
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 8_192)) return apiError("Solicitação muito grande.", 413, id, "body_too_large");
  const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown; displayName?: unknown; acceptedTerms?: unknown; captchaToken?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().replace(/[<>]/g, "").slice(0, 80) : "";
  const captchaToken = normalizeCaptchaToken(body.captchaToken);
  if (!captchaToken) return apiError("Confirme a proteção anti-bot e tente novamente.", 400, id, "captcha_required");
  if (!/^\S+@\S+\.\S+$/.test(email) || !isAcceptableNewPassword(password) || displayName.length < 2 || body.acceptedTerms !== "true") return apiError("Revise os dados, use uma senha com pelo menos 12 caracteres e aceite os Termos e a Política de Privacidade.", 400, id, "invalid_signup");
  const usage = rateLimit(`auth-signup:${clientIp(request)}`, 5, 60 * 60_000);
  if (!usage.allowed) return apiError("Muitas tentativas de cadastro.", 429, id, "rate_limited");
  try {
    const result = await signUpWithPassword(email, password, displayName, `${applicationOrigin(request.nextUrl.origin)}/auth/callback`, captchaToken);
    const response = NextResponse.json({ user: result.user, confirmationRequired: !result.access_token, requestId: id }, { status: 201, headers: { "cache-control": "no-store" } });
    if (result.access_token && result.refresh_token && result.expires_in) setSessionCookies(response, { access_token: result.access_token, refresh_token: result.refresh_token, expires_in: result.expires_in });
    return response;
  } catch (error) {
    if (isSupabaseRateLimited(error)) {
      log("warn", "auth", "signup_rate_limited", { requestId: id });
      return apiError("Muitas tentativas de cadastro. Aguarde antes de tentar novamente.", 429, id, "rate_limited");
    }
    if (isSupabaseAuthUnavailable(error)) {
      log("error", "auth", "signup_upstream_unavailable", { requestId: id });
      return apiError("O cadastro está temporariamente indisponível. Tente novamente.", 503, id, "auth_upstream_unavailable");
    }
    log("warn", "auth", "signup_failed", { requestId: id });
    return apiError("Não foi possível concluir o cadastro. Se a conta já existir, tente entrar ou recuperar a senha.", 400, id, "signup_failed");
  }
}
