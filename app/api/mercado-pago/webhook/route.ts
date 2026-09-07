import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMarketplaceOrderById, getWayneOrderById, recordMarketplacePayment, transitionMarketplaceOrder, updateWayneOrder } from "@/lib/supabase-admin";
import { getCrmProposalById, recordCrmProposalPayment } from "@/lib/server/crm-proposals";
import { bodyWithinLimit, fetchSafeGet, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";

type Payment = {
  id?: number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
};

function validSignature(request: NextRequest, dataId: string) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!secret || !signature || !requestId) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=")));
  if (!parts.ts || !parts.v1) return false;
  const signatureTime = Number(parts.ts);
  const signatureTimeMs = signatureTime < 10_000_000_000 ? signatureTime * 1000 : signatureTime;
  if (!Number.isFinite(signatureTimeMs) || Math.abs(Date.now() - signatureTimeMs) > 5 * 60_000) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const calculated = createHmac("sha256", secret).update(manifest).digest("hex");
  const expected = Buffer.from(parts.v1, "utf8");
  const actual = Buffer.from(calculated, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: NextRequest) {
  const requestIdentifier = requestId(request);
  if (!bodyWithinLimit(request, 65_536)) return NextResponse.json({ error: "Payload muito grande." }, { status: 413 });
  const body = await request.json().catch(() => ({})) as { type?: string; data?: { id?: string | number } };
  const dataId = request.nextUrl.searchParams.get("data.id") || String(body.data?.id || "");
  if (!dataId || body.type && body.type !== "payment") return NextResponse.json({ received: true });
  if (!validSignature(request, dataId)) {
    log("warn", "wayne-webhook", "invalid_signature", { requestId: requestIdentifier, dataId });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) return NextResponse.json({ error: "Integração indisponível." }, { status: 503 });

  try {
    const response = await fetchSafeGet(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }, 3);
    if (!response.ok) throw new Error(`payment_lookup_${response.status}`);
    const payment = await response.json() as Payment;
    const orderId = payment.external_reference || "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ received: true });
    const providerPaymentId = String(payment.id || dataId);
    const paidCents = Math.round(Number(payment.transaction_amount || 0) * 100);
    const currencyMatches = payment.currency_id === "BRL";

    const wayneOrder = await getWayneOrderById(orderId);
    if (wayneOrder) {
      const amountMatches = paidCents === wayneOrder.amount_cents;
      if (!amountMatches || !currencyMatches) {
        await updateWayneOrder(wayneOrder.id, { payment_status: "amount_mismatch", provider_payment_id: providerPaymentId });
        log("error", "wayne-webhook", "payment_mismatch", { requestId: requestIdentifier, orderId: wayneOrder.id, paymentId: payment.id, amountMatches, currencyMatches });
        return NextResponse.json({ received: true });
      }
      if (payment.status === "approved") {
        await updateWayneOrder(wayneOrder.id, { status: "published", payment_status: "approved", provider_payment_id: providerPaymentId, published_at: wayneOrder.published_at || new Date().toISOString() });
      } else if (payment.status === "refunded" || payment.status === "charged_back") {
        await updateWayneOrder(wayneOrder.id, { status: "refunded", payment_status: payment.status, provider_payment_id: providerPaymentId });
      } else if (payment.status === "cancelled" || payment.status === "rejected") {
        await updateWayneOrder(wayneOrder.id, { status: "cancelled", payment_status: payment.status, provider_payment_id: providerPaymentId });
      } else await updateWayneOrder(wayneOrder.id, { payment_status: payment.status || "pending", provider_payment_id: providerPaymentId });
      return NextResponse.json({ received: true });
    }

    const crmProposal = await getCrmProposalById(orderId);
    if (crmProposal) {
      const amountMatches = paidCents === crmProposal.total_cents;
      if (!amountMatches || !currencyMatches) {
        log("error", "crm-proposal-webhook", "payment_mismatch", { requestId: requestIdentifier, proposalId: crmProposal.id, paymentId: payment.id, amountMatches, currencyMatches });
        return NextResponse.json({ received: true });
      }
      await recordCrmProposalPayment(crmProposal.id, providerPaymentId, payment.status || "pending", paidCents, payment.currency_id || "");
      return NextResponse.json({ received: true });
    }

    const marketOrder = await getMarketplaceOrderById(orderId);
    if (!marketOrder) return NextResponse.json({ received: true });
    const amountMatches = paidCents === marketOrder.total_cents;
    if (!amountMatches || !currencyMatches) {
      log("error", "marketplace-webhook", "payment_mismatch", { requestId: requestIdentifier, orderId: marketOrder.id, paymentId: payment.id, amountMatches, currencyMatches });
      return NextResponse.json({ received: true });
    }
    const status = payment.status === "approved" ? "paid"
      : payment.status === "refunded" || payment.status === "charged_back" ? "refunded"
        : payment.status === "cancelled" || payment.status === "rejected" ? "cancelled"
          : marketOrder.status;
    await transitionMarketplaceOrder(marketOrder.id, status, providerPaymentId);
    await recordMarketplacePayment({ user_id: marketOrder.buyer_id, order_id: marketOrder.id, provider_reference: providerPaymentId, amount_cents: paidCents, status: payment.status || "pending", metadata: { currency: payment.currency_id } });
    return NextResponse.json({ received: true });
  } catch (error) {
    log("error", "wayne-webhook", "processing_failed", { requestId: requestIdentifier, dataId, error });
    return NextResponse.json({ error: "Falha temporária." }, { status: 500 });
  }
}
