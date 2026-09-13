import { NextRequest, NextResponse } from "next/server";
import { parseNexusWorkerAnnouncement } from "@/lib/nexus-worker-protocol";
import { hashNexusWorkerToken, workerTokenFromAuthorization } from "@/lib/server/nexus-worker-auth";
import { heartbeatNexusWorker } from "@/lib/server/nexus-worker-store";
import { apiError, bodyWithinLimit, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!bodyWithinLimit(request, 96_000)) return apiError("Anúncio muito grande.", 413, id, "body_too_large");

  const token = workerTokenFromAuthorization(request.headers.get("authorization"));
  const tokenHash = token ? hashNexusWorkerToken(token) : null;
  if (!tokenHash) return apiError("Credencial de worker inválida.", 401, id, "worker_auth_required");

  const usage = rateLimit(`nexus-worker-heartbeat:${tokenHash}`, 120, 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Heartbeats em excesso.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }

  const parsed = parseNexusWorkerAnnouncement(json);
  if (!parsed.ok) return apiError("Anúncio de worker inválido.", 400, id, parsed.error);

  try {
    const heartbeat = await heartbeatNexusWorker(tokenHash, parsed.data);
    log("info", "nexus-worker", "heartbeat_accepted", {
      requestId: id,
      workerId: heartbeat.worker_id,
      platform: parsed.data.platform,
      tools: parsed.data.tools.length,
      capabilities: parsed.data.capabilities.length,
    });
    return NextResponse.json(
      { heartbeat, protocolVersion: parsed.data.protocolVersion, requestId: id },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_heartbeat_failed";
    const authFailure = message.includes("worker_credential_invalid");
    const disabled = message.includes("worker_disabled");
    const mismatch = message.includes("worker_platform_mismatch");
    log(authFailure ? "warn" : "error", "nexus-worker", "heartbeat_rejected", { requestId: id, error });
    return apiError(
      authFailure ? "Credencial de worker inválida." : disabled ? "Worker desativado." : mismatch ? "Plataforma do worker não corresponde ao enrollment." : "Heartbeat rejeitado.",
      authFailure ? 401 : disabled || mismatch ? 409 : 503,
      id,
      authFailure ? "worker_credential_invalid" : disabled ? "worker_disabled" : mismatch ? "worker_platform_mismatch" : "worker_heartbeat_failed",
    );
  }
}
