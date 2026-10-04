import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { planNexusExecutionV2 } from "@/lib/nexus-capability-router";
import { NEXUS_DEFAULT_RUNTIME } from "@/lib/nexus-tool-network";
import { apiError, bodyWithinLimit, isSameOrigin, requestId } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";

function cleanCapability(value: unknown) {
  if (typeof value !== "string") return null;
  const capability = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+){1,7}$/.test(capability) || capability.length > 120) return null;
  return capability;
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 16_384)) return apiError("Solicitação muito grande.", 413, id, "body_too_large");

  const user = await getCurrentUser();
  if (!user) return apiError("Autenticação necessária.", 401, id, "auth_required");

  const usage = rateLimit(`nexus-execution-plan:${user.id}`, 120, 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Muitos planos em sequência. Aguarde antes de continuar.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }
  if (!json || typeof json !== "object" || Array.isArray(json)) return apiError("Plano inválido.", 400, id, "invalid_plan");

  const input = json as Record<string, unknown>;
  const capability = cleanCapability(input.capability);
  if (!capability) return apiError("Capability inválida.", 400, id, "invalid_capability");

  const zeroCostMode = input.zero_cost_mode !== false;
  const allowPaid = input.allow_paid === true;
  if (zeroCostMode && allowPaid) return apiError("ZERO COST MODE bloqueia ferramentas pagas.", 409, id, "zero_cost_paid_conflict");

  const plan = planNexusExecutionV2(capability, NEXUS_DEFAULT_RUNTIME, { zeroCostMode, allowPaid });
  return NextResponse.json(
    { plan, requestId: id },
    { headers: { "cache-control": "no-store", "x-request-id": id } },
  );
}
