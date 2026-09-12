import { NextRequest, NextResponse } from "next/server";
import { parseProposalDecisionInput } from "@/lib/crm-proposals";
import { approveCrmProposal, getCrmProposalByPublicId, rejectCrmProposal, updateCrmProposal } from "@/lib/server/crm-proposals";
import { apiError, bodyWithinLimit, clientIp, fetchWithTimeout, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

type PreferenceResponse = { id?: string; init_point?: string; sandbox_init_point?: string; message?: string };

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return apiError("Origem não autorizada.", 403, id, "origin_denied");
  if (!bodyWithinLimit(request, 16_384)) return apiError("Solicitação muito grande.", 413, id, "body_too_large");
  const usage = rateLimit(`crm-proposal-public:${clientIp(request)}`, 20, 30 * 60_000);
  if (!usage.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde antes de continuar.", code: "rate_limited", requestId: id }, { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds), "cache-control": "no-store" } });

  let json: unknown;
  try { json = await request.json(); }
  catch { return apiError("Dados inválidos.", 400, id, "invalid_json"); }
  const parsed = parseProposalDecisionInput(json);
  if (!parsed.ok) return apiError(parsed.error, 400, id, "invalid_decision");

  try {
    const current = await getCrmProposalByPublicId(parsed.data.public_id);
    if (!current) return apiError("Proposta não encontrada.", 404, id, "proposal_not_found");
    const expired = new Date(current.valid_until).getTime() < Date.now();
    if (expired && current.status === "ready") {
      await updateCrmProposal(current.id, { status: "expired" });
      return apiError("Esta proposta expirou.", 410, id, "proposal_expired");
    }

    if (parsed.data.action === "reject") {
      if (current.status !== "ready") return apiError("Esta proposta não pode mais ser recusada.", 409, id, "proposal_locked");
      const rejected = await rejectCrmProposal(current.public_id);
      if (!rejected) return apiError("Não foi possível recusar a proposta.", 409, id, "proposal_locked");
      return NextResponse.json({ status: rejected.status, requestId: id }, { headers: { "cache-control": "no-store" } });
    }

    if (current.status === "paid") return NextResponse.json({ status: "paid", checkoutUrl: current.checkout_url, requestId: id }, { headers: { "cache-control": "no-store" } });
    if (current.status === "payment_pending" && current.checkout_url) return NextResponse.json({ status: current.status, checkoutUrl: current.checkout_url, requestId: id }, { headers: { "cache-control": "no-store" } });
    if (!["ready", "approved", "payment_pending"].includes(current.status)) return apiError("Esta proposta não pode ser aprovada agora.", 409, id, "proposal_locked");

    const approved = current.status === "ready"
      ? await approveCrmProposal(current.public_id, parsed.data.approver_name || "")
      : current;
    if (!approved) throw new Error("proposal_approval_empty");
    if (approved.status === "expired") return apiError("Esta proposta expirou.", 410, id, "proposal_expired");
    if (approved.checkout_url) return NextResponse.json({ status: approved.status, checkoutUrl: approved.checkout_url, requestId: id }, { headers: { "cache-control": "no-store" } });

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) return apiError("Pagamento temporariamente indisponível. A aprovação foi registrada; tente novamente depois.", 503, id, "payment_not_configured");

    const proposal = await getCrmProposalByPublicId(current.public_id);
    if (!proposal || !proposal.items?.length || !proposal.lead) throw new Error("proposal_details_missing");
    const origin = request.nextUrl.origin;
    const returnUrl = (status: string) => `${origin}/proposta/${proposal.public_id}?payment=${status}`;
    const payerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(proposal.lead.contact) ? proposal.lead.contact : undefined;

    const response = await fetchWithTimeout("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-idempotency-key": proposal.id,
      },
      body: JSON.stringify({
        items: proposal.items.sort((a, b) => a.position - b.position).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description || undefined,
          quantity: item.quantity,
          currency_id: "BRL",
          unit_price: item.unit_price_cents / 100,
        })),
        payer: { name: proposal.lead.name, ...(payerEmail ? { email: payerEmail } : {}) },
        external_reference: proposal.id,
        metadata: { kind: "crm_proposal", crm_proposal_id: proposal.id, lead_id: proposal.lead_id },
        back_urls: { success: returnUrl("success"), pending: returnUrl("pending"), failure: returnUrl("failure") },
        auto_return: "approved",
        notification_url: `${origin}/api/mercado-pago/webhook?source_news=webhooks`,
        statement_descriptor: "WAYNE NEXUS",
        payment_methods: { installments: 3 },
      }),
    }, 12_000);
    const preference = await response.json() as PreferenceResponse;
    if (!response.ok || !preference.id || !preference.init_point) throw new Error(preference.message || `mercado_pago_${response.status}`);

    const checkoutUrl = process.env.MERCADO_PAGO_TEST_MODE === "true" ? preference.sandbox_init_point || preference.init_point : preference.init_point;
    const updated = await updateCrmProposal(proposal.id, {
      status: "payment_pending",
      payment_provider: "mercado_pago",
      payment_status: "preference_created",
      provider_preference_id: preference.id,
      checkout_url: checkoutUrl,
    });
    if (!updated) throw new Error("proposal_preference_persist_failed");
    return NextResponse.json({ status: updated.status, checkoutUrl, requestId: id }, { headers: { "cache-control": "no-store", "x-request-id": id } });
  } catch (error) {
    log("error", "crm-proposal-public", "proposal_decision_failed", { requestId: id, publicId: parsed.data.public_id, action: parsed.data.action, error });
    return apiError("Não foi possível concluir esta etapa agora. Nenhuma cobrança foi confirmada como paga.", 502, id, "proposal_unavailable");
  }
}
