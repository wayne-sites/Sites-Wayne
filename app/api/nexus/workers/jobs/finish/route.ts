import { NextRequest, NextResponse } from "next/server";
import { parseNexusWorkerJobCompletion } from "@/lib/nexus-worker-jobs";
import { hashNexusWorkerToken, workerTokenFromAuthorization } from "@/lib/server/nexus-worker-auth";
import { finishNexusWorkerJob } from "@/lib/server/nexus-worker-store";
import { apiError, bodyWithinLimit, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!bodyWithinLimit(request, 540_000)) return apiError("Resultado muito grande.", 413, id, "body_too_large");

  const token = workerTokenFromAuthorization(request.headers.get("authorization"));
  const tokenHash = token ? hashNexusWorkerToken(token) : null;
  if (!tokenHash) return apiError("Credencial de worker inválida.", 401, id, "worker_auth_required");

  const usage = rateLimit(`nexus-worker-job-finish:${tokenHash}`, 600, 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Finalizações em excesso.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }

  const parsed = parseNexusWorkerJobCompletion(json);
  if (!parsed.ok) return apiError("Resultado do job inválido.", 400, id, parsed.error);

  try {
    const job = await finishNexusWorkerJob(tokenHash, parsed.data);
    log(job.status === "succeeded" ? "info" : "warn", "nexus-worker", "job_finished", {
      requestId: id,
      jobId: job.job_id,
      status: job.status,
    });
    return NextResponse.json(
      { job, requestId: id },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_job_finish_failed";
    const authFailure = message.includes("worker_credential_invalid");
    const leaseFailure = message.includes("job_lease_invalid") || message.includes("job_lease_expired");
    const disabled = message.includes("worker_disabled");
    log(authFailure || leaseFailure || disabled ? "warn" : "error", "nexus-worker", "job_finish_rejected", { requestId: id, error });
    return apiError(
      authFailure ? "Credencial de worker inválida." : leaseFailure ? "Lease do job inválida ou expirada." : disabled ? "Worker desativado." : "Não foi possível finalizar o job.",
      authFailure ? 401 : leaseFailure || disabled ? 409 : 503,
      id,
      authFailure ? "worker_credential_invalid" : leaseFailure ? "job_lease_invalid" : disabled ? "worker_disabled" : "worker_job_finish_failed",
    );
  }
}
