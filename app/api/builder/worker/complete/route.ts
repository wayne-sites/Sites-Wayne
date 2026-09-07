import { NextRequest, NextResponse } from "next/server";
import { updateBuilderAgentJob } from "@/lib/builder/job-store";
import { verifyBuilderWorkerToken } from "@/lib/builder/github-oidc";
import { bodyWithinLimit } from "@/lib/server/http";
import { log } from "@/lib/server/logger";

const allowedStatuses = new Set(["ci_passed", "preview_ready", "failed"]);

function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  if (!bodyWithinLimit(request, 20_000)) {
    return NextResponse.json({ error: "Payload muito grande." }, { status: 413 });
  }

  let worker;
  try {
    worker = await verifyBuilderWorkerToken(request.headers.get("authorization"));
  } catch (error) {
    log("warn", "nexus-builder-agent", "worker_complete_oidc_rejected", { error });
    return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = safeText(body.id, 80);
  const status = safeText(body.status, 30);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Resultado inválido." }, { status: 400 });
  }

  const branchName = safeText(body.branchName, 140);
  const commitSha = safeText(body.commitSha, 40);
  const prUrl = safeText(body.prUrl, 300);
  const previewUrl = safeText(body.previewUrl, 500);
  const ciUrl = safeText(body.ciUrl, 500);
  const prNumber = Number(body.prNumber || 0);

  if (branchName && !/^builder-agent\/[a-z0-9-]{3,120}$/.test(branchName)) {
    return NextResponse.json({ error: "Branch inválida." }, { status: 400 });
  }
  if (commitSha && !/^[0-9a-f]{40}$/i.test(commitSha)) {
    return NextResponse.json({ error: "Commit inválido." }, { status: 400 });
  }
  if (prUrl && !/^https:\/\/github\.com\/wayne-sites\/Sites-Wayne\/pull\/\d+$/.test(prUrl)) {
    return NextResponse.json({ error: "PR inválido." }, { status: 400 });
  }
  if (previewUrl && !/^https:\/\/[a-z0-9.-]+\.vercel\.app\/generated\/[a-z0-9-]+\/index\.html$/i.test(previewUrl)) {
    return NextResponse.json({ error: "Preview inválido." }, { status: 400 });
  }

  try {
    const updated = await updateBuilderAgentJob(id, {
      status: status as "ci_passed" | "preview_ready" | "failed",
      branch_name: branchName || undefined,
      commit_sha: commitSha || undefined,
      pr_number: Number.isInteger(prNumber) && prNumber > 0 ? prNumber : undefined,
      pr_url: prUrl || undefined,
      preview_url: previewUrl || undefined,
      ci_url: ciUrl || undefined,
      error_code: status === "failed" ? safeText(body.errorCode, 100) || "worker_failed" : null,
      error_message: status === "failed" ? safeText(body.errorMessage, 500) || "O worker não concluiu o job." : null,
      completed_at: status === "preview_ready" || status === "failed" ? new Date().toISOString() : undefined,
    }, worker.workerId);

    if (!updated) return NextResponse.json({ error: "Job não pertence a este worker." }, { status: 409 });
    return NextResponse.json({ ok: true, status: updated.status }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    log("error", "nexus-builder-agent", "worker_complete_failed", { workerId: worker.workerId, jobId: id, error });
    return NextResponse.json({ error: "Não foi possível concluir o job." }, { status: 503 });
  }
}
