import "server-only";
import { fetchSafeGet, fetchWithTimeout } from "@/lib/server/http";
import type { CrmPriority, CrmStage, ParsedCrmLead } from "@/lib/crm";

export type CrmLead = ParsedCrmLead & {
  id: string;
  stage: CrmStage;
  priority: CrmPriority;
  estimated_value_cents: number | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  notes: string | null;
  consent_at: string;
  created_at: string;
  updated_at: string;
};

export type CrmFollowupTask = {
  id: string;
  lead_id: string;
  status: "pending" | "done" | "cancelled";
  kind: "contact";
  due_at: string;
  title: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  if (!response.ok) throw new Error(`crm_supabase_${response.status}_${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function insertCrmLead(lead: ParsedCrmLead) {
  const nextFollowupAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const rows = await request<CrmLead[]>("crm_leads", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...lead, next_followup_at: nextFollowupAt }),
  });
  return rows[0];
}

export async function isCrmAdmin(userId: string) {
  const rows = await request<Array<{ role: "owner" | "admin" }>>(`crm_admins?user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`);
  return rows[0] || null;
}

export async function listCrmLeads(limit = 100) {
  return request<CrmLead[]>(`crm_leads?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 200))}`);
}

export async function listDueCrmFollowups(referenceAt = new Date(), limit = 100) {
  const due = encodeURIComponent(referenceAt.toISOString());
  return request<CrmFollowupTask[]>(`crm_followup_tasks?status=eq.pending&due_at=lte.${due}&select=*&order=due_at.asc&limit=${Math.max(1, Math.min(limit, 200))}`);
}

export async function completeCrmFollowup(leadId: string, contactedAt = new Date()) {
  const rows = await request<CrmLead[]>("rpc/complete_crm_followup_task", {
    method: "POST",
    body: JSON.stringify({ p_lead_id: leadId, p_contacted_at: contactedAt.toISOString() }),
  });
  return rows[0] || null;
}

export async function updateCrmLead(
  id: string,
  patch: Partial<Pick<CrmLead, "stage" | "priority" | "estimated_value_cents" | "next_followup_at" | "last_contacted_at" | "notes">>,
) {
  const rows = await request<CrmLead[]>(`crm_leads?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return rows[0] || null;
}
