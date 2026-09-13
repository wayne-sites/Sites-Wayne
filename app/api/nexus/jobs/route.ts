import { NextRequest, NextResponse } from "next/server";
import { parseNexusWorkerJobRequest } from "@/lib/nexus-worker-jobs";
import { enqueueNexusWorkerJobForUser, listNexusWorkerJobsForUser } from "@/lib/server/nexus-worker-store";
import { apiError, bodyWithinLimit, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const user = await getCurrentUser();
  if (!user) return apiError("Autenticação necessária.", 401, id, "auth_required");

  try {
    const jobs = await listNexusWorkerJobsForUser(user.id, 20);
    return NextResponse.json(
      { jobs, requestId: id },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    log("error", "nexus-worker", "job_status_list_failed", { requestId: id, userId: user.id, error });
    return apiError("Não foi possível consultar os jobs do Nexus Worker.", 503, id, "worker_jobs_unavailable");
  }
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 280_000)) return apiError("Job muito grande.", 413, id, "body_too_large");

  const user = await getCurrentUser();
  if (!user) return apiError("Autenticação necessária.", 401, id, "auth_required");

  const usage = rateLimit(`nexus-worker-job-enqueue:${user.id}`, 120, 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Muitos jobs enfileirados em sequência.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }

  const parsed = parseNexusWorkerJobRequest(json);
  if (!parsed.ok) {
    return apiError(
      parsed.error === "paid_execution_disabled" ? "Execução paga está desabilitada neste runtime." : "Job inválido.",
      parsed.error === "paid_execution_disabled" ? 409 : 400,
      id,
      parsed.error,
    );
  }

  try {
    const job = await enqueueNexusWorkerJobForUser(user.id, parsed.data);
    log("info", "nexus-worker", "job_queued", {
      requestId: id,
      userId: user.id,
      jobId: job.job_id,
      projectId: job.project_id,
      capability: job.capability,
      toolId: job.tool_id,
    });
    return NextResponse.json(
      { job, requestId: id },
      { status: 202, headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_job_enqueue_failed";
    const ownership = message.includes("job_project_not_owned");
    const toolBlocked = message.includes("worker_tool_not_approved");
    const paid = message.includes("paid_execution_disabled");
    log(ownership || toolBlocked || paid ? "warn" : "error", "nexus-worker", "job_queue_rejected", {
      requestId: id,
      userId: user.id,
      capability: parsed.data.capability,
      error,
    });
    return apiError(
      ownership ? "Projeto não encontrado." : toolBlocked ? "Capability ainda não está aprovada para execução por worker." : paid ? "Execução paga está desabilitada." : "Não foi possível enfileirar o job.",
      ownership ? 404 : toolBlocked || paid ? 409 : 503,
      id,
      ownership ? "job_project_not_owned" : toolBlocked ? "worker_tool_not_approved" : paid ? "paid_execution_disabled" : "worker_job_enqueue_failed",
    );
  }
}
