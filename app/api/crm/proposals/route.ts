import { NextRequest, NextResponse } from "next/server";
import { parseCrmProposalCreateInput } from "@/lib/crm-proposals";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isCrmAdmin } from "@/lib/server/crm-store";
import { createCrmProposal, getCrmProposalById, listCrmProposals } from "@/lib/server/crm-proposals";
import { apiError, bodyWithinLimit, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

async function authorizeAdmin(requestIdValue: string) {
  const user = await getCurrentUser();
  if (!user) return { response: apiError("Autenticação necessária.", 401, requestIdValue, "auth_required") } as const;
  try {
    const admin = await isCrmAdmin(user.id);
    if (!admin) return { response: apiError("Acesso ao CRM não autorizado.", 403, requestIdValue, "crm_forbidden") } as const;
    return { user, admin } as const;
  } catch (error) {
    log("error", "crm-proposals", "admin_check_failed", { requestId: requestIdValue, userId: user.id, error });
    return { response: apiError("CRM temporariamente indisponível.", 503, requestIdValue, "crm_unavailable") } as const;
  }
}

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const auth = await authorizeAdmin(id);
  if ("response" in auth) return auth.response;
  try {
    const proposals = await listCrmProposals(200);
    return NextResponse.json({ proposals, role: auth.admin.role, requestId: id }, { headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch (error) {
    log("error", "crm-proposals", "proposal_list_failed", { requestId: id, userId: auth.user.id, error });
    return apiError("Não foi possível carregar as propostas.", 502, id, "crm_unavailable");
  }
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 32_768)) return apiError("Solicitação muito grande.", 413, id, "body_too_large");
  const auth = await authorizeAdmin(id);
  if ("response" in auth) return auth.response;

  const usage = rateLimit(`crm-proposal-create:${auth.user.id}`, 20, 30 * 60_000);
  if (!usage.allowed) return NextResponse.json({ error: "Muitas propostas em sequência. Aguarde um momento.", code: "rate_limited", requestId: id }, { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } });

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }
  const parsed = parseCrmProposalCreateInput(json);
  if (!parsed.ok) return apiError(parsed.error, 400, id, "invalid_proposal");

  try {
    const created = await createCrmProposal(parsed.data, auth.user.id);
    if (!created) throw new Error("proposal_create_returned_empty");
    const proposal = await getCrmProposalById(created.id);
    if (!proposal) throw new Error("proposal_lookup_failed");
    return NextResponse.json({
      proposal,
      reviewUrl: `${request.nextUrl.origin}/proposta/${proposal.public_id}`,
      requestId: id,
    }, { status: 201, headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch (error) {
    log("error", "crm-proposals", "proposal_create_failed", { requestId: id, userId: auth.user.id, leadId: parsed.data.lead_id, error });
    return apiError("Não foi possível criar a proposta. Confirme se o lead está qualificado.", 502, id, "proposal_unavailable");
  }
}
