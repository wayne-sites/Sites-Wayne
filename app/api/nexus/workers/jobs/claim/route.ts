import { NextRequest, NextResponse } from "next/server";
import { hashNexusWorkerToken, workerTokenFromAuthorization } from "@/lib/server/nexus-worker-auth";
import { claimNexusWorkerJob } from "@/lib/server/nexus-worker-store";
import { apiError, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  const id = requestId(request);
  const token = workerTokenFromAuthorization(request.headers.get("authorization"));
  const tokenHash = token ? hashNexusWorkerToken(token) : null;
  if (!tokenHash) return apiError("Credencial de worker inválida.", 401, id, "worker_auth_required");

  const usage = rateLimit(`nexus-worker-job-claim:${tokenHash}`, 600, 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Polling em excesso.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  try {
    const job = await claimNexusWorkerJob(tokenHash);
    if (!job) {
      return NextResponse.json(
        { job: null, requestId: id },
        { headers: { "cache-control": "no-store", "x-request-id": id } },
      );
    }

    log("info", "nexus-worker", "job_claimed", {
      requestId: id,
      jobId: job.job_id,
      projectId: job.project_id,
      toolId: job.tool_id,
      capability: job.capability,
      attempt: job.attempt,
    });

    return NextResponse.json(
      { job, requestId: id },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_job_claim_failed";
    const authFailure = message.includes("worker_credential_invalid");
    const unavailable = message.includes("worker_not_online") || message.includes("worker_not_fresh") || message.includes("worker_disabled");
    log(authFailure || unavailable ? "warn" : "error", "nexus-worker", "job_claim_rejected", { requestId: id, error });
    return apiError(
      authFailure ? "Credencial de worker inválida." : unavailable ? "Worker indisponível para receber jobs." : "Não foi possível consultar a fila.",
      authFailure ? 401 : unavailable ? 409 : 503,
      id,
      authFailure ? "worker_credential_invalid" : unavailable ? "worker_unavailable" : "worker_job_claim_failed",
    );
  }
}
