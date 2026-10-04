import { NextRequest, NextResponse } from "next/server";
import { NEXUS_WORKER_PLATFORMS, type NexusWorkerPlatform } from "@/lib/nexus-worker-protocol";
import { createNexusWorkerCredential } from "@/lib/server/nexus-worker-auth";
import { enrollNexusWorkerForUser } from "@/lib/server/nexus-worker-store";
import { apiError, bodyWithinLimit, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";
import { getCurrentUser } from "@/lib/supabase/auth";

function parseEnrollment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.name !== "string") return null;
  const name = body.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return null;
  if (typeof body.platform !== "string" || !(NEXUS_WORKER_PLATFORMS as readonly string[]).includes(body.platform)) return null;
  return { name, platform: body.platform as NexusWorkerPlatform };
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 16_384)) return apiError("Solicitação muito grande.", 413, id, "body_too_large");

  const user = await getCurrentUser();
  if (!user) return apiError("Autenticação necessária.", 401, id, "auth_required");

  const usage = rateLimit(`nexus-worker-enroll:${user.id}`, 20, 24 * 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Limite de novos workers atingido. Tente novamente mais tarde.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }
  const enrollment = parseEnrollment(json);
  if (!enrollment) return apiError("Worker inválido.", 400, id, "invalid_worker_enrollment");

  const credential = createNexusWorkerCredential();
  try {
    const worker = await enrollNexusWorkerForUser({
      userId: user.id,
      name: enrollment.name,
      platform: enrollment.platform,
      tokenHash: credential.tokenHash,
    });

    log("info", "nexus-worker", "worker_enrolled", {
      requestId: id,
      userId: user.id,
      workerId: worker.worker_id,
      platform: enrollment.platform,
    });

    return NextResponse.json(
      {
        worker: {
          id: worker.worker_id,
          workspaceId: worker.workspace_id,
          name: enrollment.name,
          platform: enrollment.platform,
          status: worker.status,
        },
        credential: {
          token: credential.token,
          displayOnce: true,
        },
        requestId: id,
      },
      { status: 201, headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    log("error", "nexus-worker", "worker_enrollment_failed", { requestId: id, userId: user.id, platform: enrollment.platform, error });
    return apiError("Não foi possível registrar o worker.", 503, id, "worker_enrollment_failed");
  }
}
