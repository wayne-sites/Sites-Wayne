import { NextRequest, NextResponse } from "next/server";
import { validatePublicationProject, safePublicationSlug } from "@/lib/builder/publication";
import { createBuilderJobToken, insertBuilderAgentJob } from "@/lib/builder/job-store";
import { getCurrentUser } from "@/lib/supabase/auth";
import { bodyWithinLimit, clientIp, isSameOrigin, requestId } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { log } from "@/lib/server/logger";

function safeOptionalObject(value: unknown, maxBytes: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > maxBytes) return null;
  return JSON.parse(serialized) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada.", requestId: id }, { status: 403 });
  }
  if (!bodyWithinLimit(request, 130_000)) {
    return NextResponse.json({ error: "Pacote muito grande para publicação.", requestId: id }, { status: 413 });
  }

  const usage = rateLimit(`builder-publish:${clientIp(request)}`, 3, 86_400_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Limite diário de publicações Preview atingido.", code: "builder_publish_rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido.", requestId: id }, { status: 400 });
  }

  let project;
  try {
    project = validatePublicationProject(body.project);
  } catch (error) {
    log("warn", "nexus-builder-agent", "publish_project_rejected", { requestId: id, error });
    return NextResponse.json(
      {
        error: "O pacote contém um recurso que não pode ser publicado automaticamente com segurança.",
        code: "builder_publish_project_rejected",
        requestId: id,
      },
      { status: 400 },
    );
  }

  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const publishSlug = `${safePublicationSlug(project.name)}-${suffix}`.slice(0, 63);
  const { token, hash } = createBuilderJobToken();
  const user = await getCurrentUser().catch(() => null);

  try {
    const job = await insertBuilderAgentJob({
      user_id: user?.id || null,
      project_name: project.name,
      publish_slug: publishSlug,
      project,
      plan: safeOptionalObject(body.plan, 24_000),
      audit: safeOptionalObject(body.audit, 8_000),
      provider: typeof body.provider === "string" ? body.provider.slice(0, 80) : null,
      model: typeof body.model === "string" ? body.model.slice(0, 120) : null,
      generation_path: typeof body.generationPath === "string" ? body.generationPath.slice(0, 80) : null,
      status_token_hash: hash,
    });

    return NextResponse.json(
      {
        id: job.id,
        token,
        status: job.status,
        publishSlug: job.publish_slug,
        remaining: usage.remaining,
        requestId: id,
      },
      { status: 202, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    log("error", "nexus-builder-agent", "publish_enqueue_failed", { requestId: id, error });
    return NextResponse.json(
      { error: "A fila de publicação está temporariamente indisponível.", code: "builder_publish_unavailable", requestId: id },
      { status: 503 },
    );
  }
}
