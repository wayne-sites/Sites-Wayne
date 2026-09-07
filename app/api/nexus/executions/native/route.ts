import { NextRequest, NextResponse } from "next/server";
import { executeNexusNativeCapability } from "@/lib/nexus-native-tools";
import { NEXUS_DEFAULT_RUNTIME, planNexusExecution } from "@/lib/nexus-tool-network";
import { getCurrentUser } from "@/lib/supabase/auth";
import { apiError, bodyWithinLimit, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
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
  if (!bodyWithinLimit(request, 300_000)) return apiError("Entrada muito grande.", 413, id, "body_too_large");

  const user = await getCurrentUser();
  if (!user) return apiError("Autenticação necessária.", 401, id, "auth_required");

  const usage = rateLimit(`nexus-native-execute:${user.id}`, 240, 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Muitas execuções em sequência. Aguarde antes de continuar.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }
  if (!json || typeof json !== "object" || Array.isArray(json)) return apiError("Execução inválida.", 400, id, "invalid_execution");

  const body = json as Record<string, unknown>;
  const capability = cleanCapability(body.capability);
  if (!capability) return apiError("Capability inválida.", 400, id, "invalid_capability");

  const plan = planNexusExecution(capability, NEXUS_DEFAULT_RUNTIME, { zeroCostMode: true, allowPaid: false });
  if (plan.status !== "ready" || plan.execution !== "native" || !plan.toolId) {
    return NextResponse.json(
      { error: "Esta capability não pode ser executada no runtime nativo atual.", code: plan.blockedReason || "native_execution_blocked", plan, requestId: id },
      { status: 409, headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  }

  try {
    const result = executeNexusNativeCapability(capability, body.input);
    log("info", "nexus-native", "execution_succeeded", { requestId: id, userId: user.id, capability, toolId: result.toolId });
    return NextResponse.json(
      { result, artifactPersisted: false, persistenceStatus: "nexus_core_schema_pending", requestId: id },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "native_execution_failed";
    log("warn", "nexus-native", "execution_failed", { requestId: id, userId: user.id, capability, code });
    return apiError("Não foi possível executar esta capability nativa.", 400, id, code);
  }
}
