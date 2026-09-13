import { NextRequest, NextResponse } from "next/server";
import { planNexusExecutionV2 } from "@/lib/nexus-capability-router";
import { executeNexusNativeCapability } from "@/lib/nexus-native-tools";
import { NEXUS_DEFAULT_RUNTIME } from "@/lib/nexus-tool-network";
import { persistNexusNativeExecutionForUser } from "@/lib/server/nexus-core-store";
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

function cleanUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : null;
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
  const projectId = cleanUuid(body.project_id);
  if (!capability) return apiError("Capability inválida.", 400, id, "invalid_capability");
  if (!projectId) return apiError("Projeto Nexus inválido.", 400, id, "invalid_project_id");

  const plan = planNexusExecutionV2(capability, NEXUS_DEFAULT_RUNTIME, { zeroCostMode: true, allowPaid: false });
  if (plan.status !== "ready" || plan.execution !== "native" || !plan.toolId) {
    return NextResponse.json(
      { error: "Esta capability não pode ser executada no runtime nativo atual.", code: plan.blockedReason || "native_execution_blocked", plan, requestId: id },
      { status: 409, headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  }

  let result;
  try {
    result = executeNexusNativeCapability(capability, body.input);
  } catch (error) {
    const code = error instanceof Error ? error.message : "native_execution_failed";
    log("warn", "nexus-native", "execution_failed", { requestId: id, userId: user.id, projectId, capability, code });
    return apiError("Não foi possível executar esta capability nativa.", 400, id, code);
  }

  try {
    const persistence = await persistNexusNativeExecutionForUser({
      userId: user.id,
      projectId,
      toolId: result.toolId,
      capability,
      executionInput: body.input as Record<string, unknown>,
      executionOutput: result.output,
    });

    log("info", "nexus-native", "execution_persisted", {
      requestId: id,
      userId: user.id,
      projectId,
      capability,
      toolId: result.toolId,
      toolRunId: persistence.tool_run_id,
      artifactId: persistence.artifact_id,
    });

    return NextResponse.json(
      {
        result,
        artifactPersisted: true,
        persistenceStatus: "persisted",
        execution: {
          toolRunId: persistence.tool_run_id,
          artifactId: persistence.artifact_id,
          artifactPath: persistence.artifact_path,
          artifactKind: persistence.artifact_kind,
        },
        requestId: id,
      },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "nexus_native_persistence_failed";
    const projectNotOwned = message.includes("nexus_project_not_owned");
    log("error", "nexus-native", "persistence_failed", { requestId: id, userId: user.id, projectId, capability, toolId: result.toolId, error });
    return apiError(
      projectNotOwned ? "Projeto Nexus não encontrado." : "A execução ocorreu, mas não foi possível persistir o artefato com segurança.",
      projectNotOwned ? 404 : 503,
      id,
      projectNotOwned ? "nexus_project_not_found" : "nexus_artifact_persistence_failed",
    );
  }
}
