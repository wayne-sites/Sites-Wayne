import { NextRequest, NextResponse } from "next/server";
import { getBuilderAgentJobStatus, hashBuilderJobToken } from "@/lib/builder/job-store";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Job inválido." }, { status: 400 });
  }

  const token = request.headers.get("x-builder-job-token")?.trim() || "";
  if (token.length < 20 || token.length > 200) {
    return NextResponse.json({ error: "Acesso ao job não autorizado." }, { status: 401 });
  }

  try {
    const job = await getBuilderAgentJobStatus(id, hashBuilderJobToken(token));
    if (!job) return NextResponse.json({ error: "Job não encontrado ou acesso inválido." }, { status: 404 });

    return NextResponse.json({
      id: job.id,
      status: job.status,
      projectName: job.project_name,
      publishSlug: job.publish_slug,
      attempts: job.attempts,
      branchName: job.branch_name,
      commitSha: job.commit_sha,
      prNumber: job.pr_number,
      prUrl: job.pr_url,
      previewUrl: job.preview_url,
      ciUrl: job.ci_url,
      errorCode: job.error_code,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Status temporariamente indisponível." }, { status: 503 });
  }
}
