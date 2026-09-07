import { NextRequest, NextResponse } from "next/server";
import { parseCrmLeadInput, parseCrmLeadPatchInput } from "@/lib/crm";
import { getCurrentUser } from "@/lib/supabase/auth";
import { insertCrmLead, isCrmAdmin, listCrmLeads, updateCrmLead } from "@/lib/server/crm-store";
import { apiError, bodyWithinLimit, clientIp, isSameOrigin, requestId } from "@/lib/server/http";
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
    log("error", "crm-leads", "admin_check_failed", { requestId: requestIdValue, userId: user.id, error });
    return { response: apiError("CRM temporariamente indisponível.", 503, requestIdValue, "crm_unavailable") } as const;
  }
}

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const auth = await authorizeAdmin(id);
  if ("response" in auth) return auth.response;
  try {
    const leads = await listCrmLeads(200);
    return NextResponse.json({ leads, role: auth.admin.role, requestId: id }, { headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch (error) {
    log("error", "crm-leads", "lead_list_failed", { requestId: id, userId: auth.user.id, error });
    return apiError("Não foi possível carregar os leads.", 502, id, "crm_unavailable");
  }
}

export async function PATCH(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 16_384)) return apiError("Solicitação muito grande.", 413, id, "body_too_large");

  const auth = await authorizeAdmin(id);
  if ("response" in auth) return auth.response;
  const usage = rateLimit(`crm-update:${auth.user.id}`, 60, 10 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Muitas alterações em sequência. Aguarde um momento.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }

  const parsed = parseCrmLeadPatchInput(json);
  if (!parsed.ok) return apiError(parsed.error, 400, id, "invalid_lead_update");

  try {
    const lead = await updateCrmLead(parsed.data.id, parsed.data.patch);
    if (!lead) return apiError("Lead não encontrado.", 404, id, "lead_not_found");
    return NextResponse.json({ lead, requestId: id }, { headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch (error) {
    log("error", "crm-leads", "lead_update_failed", { requestId: id, userId: auth.user.id, leadId: parsed.data.id, error });
    return apiError("Não foi possível atualizar o lead.", 502, id, "crm_unavailable");
  }
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 16_384)) return apiError("Solicitação muito grande.", 413, id, "body_too_large");

  const usage = rateLimit(`crm-lead:${clientIp(request)}`, 8, 30 * 60_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde antes de enviar outro pedido.", code: "rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } },
    );
  }

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }

  const parsed = parseCrmLeadInput(json);
  if (!parsed.ok) return apiError(parsed.error, 400, id, "invalid_lead");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return apiError("CRM temporariamente indisponível.", 503, id, "crm_not_configured");
  }

  try {
    const lead = await insertCrmLead(parsed.data);
    if (!lead) throw new Error("lead_insert_returned_empty");
    return NextResponse.json(
      { captured: true, leadCode: lead.id.slice(0, 8).toUpperCase(), stage: lead.stage, requestId: id },
      { status: 201, headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    log("error", "crm-leads", "lead_capture_failed", { requestId: id, source: parsed.data.source, error });
    return apiError("Não foi possível registrar o pedido agora. Você ainda pode continuar pelo WhatsApp.", 502, id, "crm_unavailable");
  }
}
