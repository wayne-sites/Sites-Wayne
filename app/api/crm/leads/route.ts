import { NextRequest, NextResponse } from "next/server";
import { parseCrmLeadInput } from "@/lib/crm";
import { insertCrmLead } from "@/lib/server/crm-store";
import { apiError, bodyWithinLimit, clientIp, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

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
