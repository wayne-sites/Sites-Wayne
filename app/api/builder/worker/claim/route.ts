import { NextRequest, NextResponse } from "next/server";
import { claimBuilderAgentJob, updateBuilderAgentJob } from "@/lib/builder/job-store";
import { verifyBuilderWorkerToken } from "@/lib/builder/github-oidc";
import { validatePublicationProject, publicPreviewPath } from "@/lib/builder/publication";
import { log } from "@/lib/server/logger";

export async function POST(request: NextRequest) {
  let worker;
  try {
    worker = await verifyBuilderWorkerToken(request.headers.get("authorization"));
  } catch (error) {
    log("warn", "nexus-builder-agent", "worker_oidc_rejected", { error });
    return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  }

  try {
    const job = await claimBuilderAgentJob(worker.workerId);
    if (!job) return NextResponse.json({ job: null }, { headers: { "cache-control": "no-store" } });

    let project;
    try {
      project = validatePublicationProject(job.project);
    } catch (error) {
      await updateBuilderAgentJob(job.id, {
        status: "failed",
        error_code: "project_revalidation_failed",
        error_message: "O pacote falhou na revalidação do worker.",
        completed_at: new Date().toISOString(),
      }, worker.workerId);
      log("error", "nexus-builder-agent", "worker_project_revalidation_failed", { jobId: job.id, error });
      return NextResponse.json({ job: null, skippedInvalidJob: true }, { headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        projectName: job.project_name,
        publishSlug: job.publish_slug,
        previewPath: publicPreviewPath(job.publish_slug),
        project,
        provider: job.provider,
        model: job.model,
        generationPath: job.generation_path,
        attempts: job.attempts,
      },
      worker: { runId: worker.runId },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    log("error", "nexus-builder-agent", "worker_claim_failed", { workerId: worker.workerId, error });
    return NextResponse.json({ error: "Não foi possível obter um job." }, { status: 503 });
  }
}
