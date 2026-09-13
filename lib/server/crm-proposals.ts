import "server-only";
import { fetchSafeGet, fetchWithTimeout } from "@/lib/server/http";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/server/supabase-env";
import type { CrmProposalStatus, ParsedProposalCreate, ParsedProposalItem } from "@/lib/crm-proposals";

export type CrmProposalItem = ParsedProposalItem & { id: string; proposal_id: string; position: number };
export type CrmProposal = {
  id: string;
  public_id: string;
  lead_id: string;
  status: CrmProposalStatus;
  currency: "BRL";
  subtotal_cents: number;
  total_cents: number;
  valid_until: string;
  notes: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  payment_provider: "mercado_pago" | null;
  payment_status: string;
  provider_preference_id: string | null;
  provider_payment_id: string | null;
  checkout_url: string | null;
  created_at: string;
  updated_at: string;
  items?: CrmProposalItem[];
  lead?: { id: string; name: string; business: string; contact: string; contact_kind: string };
};

function config() {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) throw new Error("crm_supabase_not_configured");
  return { url, key };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const requestInit: RequestInit = {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  };
  const response = !requestInit.method || requestInit.method === "GET"
    ? await fetchSafeGet(`${url}/rest/v1/${path}`, requestInit)
    : await fetchWithTimeout(`${url}/rest/v1/${path}`, requestInit);
  if (!response.ok) throw new Error(`crm_proposal_${response.status}_${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function createCrmProposal(input: ParsedProposalCreate, userId: string) {
  const rows = await request<CrmProposal[]>("rpc/crm_create_proposal", {
    method: "POST",
    body: JSON.stringify({
      p_lead_id: input.lead_id,
      p_valid_until: input.valid_until,
      p_notes: input.notes || "",
      p_created_by: userId,
      p_items: input.items,
    }),
  });
  return rows[0] || null;
}

export async function listCrmProposals(limit = 200) {
  return request<CrmProposal[]>(`crm_proposals?select=*,items:crm_proposal_items(*)&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 300))}`);
}

export async function getCrmProposalById(id: string) {
  const rows = await request<CrmProposal[]>(`crm_proposals?id=eq.${encodeURIComponent(id)}&select=*,items:crm_proposal_items(*),lead:crm_leads(id,name,business,contact,contact_kind)&limit=1`);
  return rows[0] || null;
}

export async function getCrmProposalByPublicId(publicId: string) {
  const rows = await request<CrmProposal[]>(`crm_proposals?public_id=eq.${encodeURIComponent(publicId)}&select=*,items:crm_proposal_items(*),lead:crm_leads(id,name,business,contact,contact_kind)&limit=1`);
  const proposal = rows[0] || null;
  if (!proposal || proposal.status !== "ready" || new Date(proposal.valid_until).getTime() >= Date.now()) return proposal;
  const updated = await updateCrmProposal(proposal.id, { status: "expired" });
  return updated ? { ...proposal, ...updated, items: proposal.items, lead: proposal.lead } : proposal;
}

export async function approveCrmProposal(publicId: string, approverName: string) {
  const rows = await request<CrmProposal[]>("rpc/crm_approve_proposal", {
    method: "POST",
    body: JSON.stringify({ p_public_id: publicId, p_approved_by_name: approverName }),
  });
  return rows[0] || null;
}

export async function updateCrmProposal(id: string, patch: Partial<Pick<CrmProposal, "status" | "payment_provider" | "payment_status" | "provider_preference_id" | "provider_payment_id" | "checkout_url">>) {
  const rows = await request<CrmProposal[]>(`crm_proposals?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return rows[0] || null;
}

export async function rejectCrmProposal(publicId: string) {
  const now = new Date().toISOString();
  const rows = await request<CrmProposal[]>(`crm_proposals?public_id=eq.${encodeURIComponent(publicId)}&status=eq.ready`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "rejected", rejected_at: now, updated_at: now }),
  });
  return rows[0] || null;
}

export async function recordCrmProposalPayment(proposalId: string, paymentId: string, paymentStatus: string, paidCents: number, currency: string) {
  const rows = await request<CrmProposal[]>("rpc/crm_record_proposal_payment", {
    method: "POST",
    body: JSON.stringify({
      p_proposal_id: proposalId,
      p_payment_id: paymentId,
      p_payment_status: paymentStatus,
      p_paid_cents: paidCents,
      p_currency: currency,
    }),
  });
  return rows[0] || null;
}

export async function expireCrmProposals(referenceAt = new Date()) {
  return request<CrmProposal[]>(`crm_proposals?status=eq.ready&valid_until=lt.${encodeURIComponent(referenceAt.toISOString())}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "expired", updated_at: referenceAt.toISOString() }),
  });
}
