import { NextRequest, NextResponse } from "next/server";
import { applicationOrigin } from "@/lib/app-origin";
import { normalizeCaptchaToken } from "@/lib/auth-security";
import { getFeatureStatus } from "@/lib/server/features";
import { apiError, bodyWithinLimit, clientIp, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";
import { isSupabaseAuthUnavailable, isSupabaseRateLimited, sendRecoveryEmail } from "@/lib/supabase/auth";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!getFeatureStatus("auth").ready) return apiError("A recuperação ainda não foi ativada.", 503, id, "auth_disabled");
  if (!isSameOrigin(request) || !bodyWithinLimit(request, 4_096)) return apiError("Solicitação inválida.", 400, id, "invalid_request");
  const body = await request.json().catch(() => ({})) as { email?: unknown; captchaToken?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const captchaToken = normalizeCaptchaToken(body.captchaToken);
  if (!captchaToken) return apiError("Confirme a proteção anti-bot e tente novamente.", 400, id, "captcha_required");
  if (/^\S+@\S+\.\S+$/.test(email)) {
    const usage = rateLimit(`auth-recover:${clientIp(request)}`, 3, 60 * 60_000);
    if (!usage.allowed) return apiError("Aguarde antes de solicitar outro e-mail.", 429, id, "rate_limited");
    try {
      await sendRecoveryEmail(email, `${applicationOrigin(request.nextUrl.origin)}/redefinir-senha`, captchaToken);
    } catch (error) {
      log("warn", "auth", "recovery_delivery_failed", { requestId: id });
      if (isSupabaseRateLimited(error)) return apiError("Aguarde antes de solicitar outro e-mail.", 429, id, "rate_limited");
      if (isSupabaseAuthUnavailable(error)) return apiError("O serviço de recuperação está temporariamente indisponível. Tente novamente.", 503, id, "auth_upstream_unavailable");
    }
  }
  return NextResponse.json({ ok: true, message: "Se a conta existir, enviaremos as instruções por e-mail.", requestId: id });
}
