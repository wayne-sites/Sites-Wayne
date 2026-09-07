import { NextRequest, NextResponse } from "next/server";
import { parseNexusProjectInput } from "@/lib/nexus-core";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createNexusProjectForUser, listNexusProjectsForUser } from "@/lib/server/nexus-core-store";
import { apiError, bodyWithinLimit, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

async function requireUser(requestIdValue: string) {
  const user = await getCurrentUser();
  if (!user) return { response: apiError("Autenticação necessária.", 401, requestIdValue, "auth_required") } as const;
  return { user } as const;
}

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const auth = await requireUser(id);
  if ("response" in auth) return auth.response;
  try {
    const projects = await listNexusProjectsForUser(auth.user.id, 100);
    return NextResponse.json({ projects, requestId: id }, { headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch (error) {
    log("error", "nexus-core", "project_list_failed", { requestId: id, userId: auth.user.id, error });
    return apiError("Nexus Core temporariamente indisponível.", 503, id, "nexus_core_unavailable");
  }
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 1_200_000)) return apiError("Projeto muito grande para esta operação.", 413, id, "body_too_large");

  const auth = await requireUser(id);
  if ("response" in auth) return auth.response;

  const usage = rateLimit(`nexus-project-create:${auth.user.id}`, 30, 60 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Muitos projetos criados em sequência. Aguarde antes de continuar.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }

  const parsed = parseNexusProjectInput(json);
  if (!parsed.ok) return apiError(parsed.error, 400, id, "invalid_project");

  try {
    const project = await createNexusProjectForUser(auth.user.id, parsed.data);
    if (!project) throw new Error("nexus_project_create_empty");
    return NextResponse.json({ project, requestId: id }, { status: 201, headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch (error) {
    log("error", "nexus-core", "project_create_failed", { requestId: id, userId: auth.user.id, projectType: parsed.data.project_type, error });
    return apiError("Não foi possível criar o projeto no Nexus Core.", 503, id, "nexus_core_unavailable");
  }
}
