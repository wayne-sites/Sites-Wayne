import type { WayneSiteOrder } from "@/lib/wayne-autopilot";
import { fetchSafeGet, fetchWithTimeout } from "@/lib/server/http";
import { getSupabaseSecretKey, getSupabaseUrl, isSupabaseServerConfigured } from "@/lib/server/supabase-env";

function getConfig() {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) throw new Error("supabase_not_configured");
  return { url, key };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { url, key } = getConfig();
  const initWithHeaders: RequestInit = {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  };
  const target = `${url}/rest/v1/${path}`;
  const response = !init.method || init.method === "GET" ? await fetchSafeGet(target, initWithHeaders) : await fetchWithTimeout(target, initWithHeaders);
  if (!response.ok) throw new Error(`supabase_${response.status}_${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export type MarketplaceOrder = {
  id: string;
  buyer_id: string;
  status: "pending" | "paid" | "processing" | "completed" | "cancelled" | "refunded";
  subtotal_cents: number;
  fee_cents: number;
  total_cents: number;
  provider_reference?: string | null;
  created_at?: string;
  order_items?: Array<{ product_id: string | null; title_snapshot: string; unit_price_cents: number; quantity: number }>;
};

export type CreatedMarketplaceOrder = Pick<MarketplaceOrder, "id" | "subtotal_cents" | "fee_cents" | "total_cents"> & {
  items: Array<{ product_id: string; title: string; unit_price_cents: number; quantity: number }>;
};

export async function createMarketplaceOrder(buyerId: string, items: Array<{ product_id: string; quantity: number }>, commissionPercent: number) {
  return request<CreatedMarketplaceOrder>("rpc/create_marketplace_order", { method: "POST", body: JSON.stringify({ p_buyer_id: buyerId, p_items: items, p_commission_percent: commissionPercent }) });
}

export async function getMarketplaceOrderById(id: string) {
  const rows = await request<MarketplaceOrder[]>(`orders?id=eq.${encodeURIComponent(id)}&select=*,order_items(product_id,title_snapshot,unit_price_cents,quantity)`);
  return rows[0] || null;
}

export async function updateMarketplaceOrder(id: string, patch: Record<string, unknown>) {
  const rows = await request<MarketplaceOrder[]>(`orders?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  return rows[0] || null;
}

export async function transitionMarketplaceOrder(id: string, status: MarketplaceOrder["status"], providerReference?: string) {
  return request<MarketplaceOrder>("rpc/transition_marketplace_order", { method: "POST", body: JSON.stringify({ p_order_id: id, p_status: status, p_provider_reference: providerReference || null }) });
}

export async function expireMarketplaceOrders(limit = 100) {
  return request<number>("rpc/expire_marketplace_orders", { method: "POST", body: JSON.stringify({ p_limit: Math.max(1, Math.min(limit, 500)) }) });
}

export async function recordMarketplacePayment(payment: { user_id: string; order_id: string; provider_reference: string; amount_cents: number; status: string; metadata?: Record<string, unknown> }) {
  await request("payments?on_conflict=provider_reference", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ ...payment, provider: "mercado_pago", metadata: payment.metadata || {} }) });
}

export type StarkiaDevice = { id: string; user_id: string; name: string; token_prefix: string; status: "offline" | "online" | "revoked"; capabilities: string[]; last_seen_at: string | null; created_at: string };
export type StarkiaTask = { id: string; device_id: string; persona: "jarvis" | "ultron"; command: "health" | "assistant_message" | "list_jobs"; payload: Record<string, unknown>; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; result?: Record<string, unknown> | null; error_code?: string | null; created_at: string };

export async function listStarkiaDevices(userId: string) {
  return request<StarkiaDevice[]>(`starkia_devices?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,name,token_prefix,status,capabilities,last_seen_at,created_at&order=created_at.desc`);
}

export async function insertStarkiaDevice(row: { user_id: string; name: string; token_hash: string; token_prefix: string }) {
  const rows = await request<StarkiaDevice[]>("starkia_devices", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  return rows[0];
}

export async function revokeStarkiaDevice(id: string, userId: string) {
  const rows = await request<StarkiaDevice[]>(`starkia_devices?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "revoked", revoked_at: new Date().toISOString() }) });
  return rows[0] || null;
}

export async function listStarkiaTasks(userId: string, limit = 50) {
  return request<StarkiaTask[]>(`starkia_tasks?user_id=eq.${encodeURIComponent(userId)}&select=id,device_id,persona,command,payload,status,result,error_code,created_at&order=created_at.desc&limit=${Math.min(limit,100)}`);
}

export async function insertStarkiaTask(row: { user_id: string; device_id: string; persona: "jarvis" | "ultron"; command: "health" | "assistant_message" | "list_jobs"; payload: Record<string, unknown> }) {
  const rows = await request<StarkiaTask[]>("starkia_tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  return rows[0];
}

export async function claimStarkiaTask(tokenHash: string) {
  return request<{ device_id: string; task: StarkiaTask | null }>("rpc/claim_starkia_task", { method: "POST", body: JSON.stringify({ p_token_hash: tokenHash }) });
}

export async function completeStarkiaTask(tokenHash: string, taskId: string, success: boolean, result: Record<string, unknown> | null, errorCode: string | null) {
  return request<boolean>("rpc/complete_starkia_task", { method: "POST", body: JSON.stringify({ p_token_hash: tokenHash, p_task_id: taskId, p_success: success, p_result: result, p_error_code: errorCode }) });
}

export async function insertWayneOrder(order: Record<string, unknown>) {
  const rows = await request<WayneSiteOrder[]>("wayne_site_orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(order),
  });
  return rows[0];
}

export async function updateWayneOrder(id: string, patch: Record<string, unknown>) {
  const rows = await request<WayneSiteOrder[]>(`wayne_site_orders?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return rows[0] || null;
}

export async function getWayneOrderById(id: string) {
  const rows = await request<WayneSiteOrder[]>(`wayne_site_orders?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] || null;
}

export async function getPublishedWayneSite(slug: string) {
  const rows = await request<WayneSiteOrder[]>(`wayne_site_orders?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*`);
  return rows[0] || null;
}

export async function listPublishedWayneSites(limit = 100) {
  return request<WayneSiteOrder[]>(`wayne_site_orders?status=eq.published&select=id,slug,site_data,updated_at,last_health_status,last_health_check_at&limit=${limit}`);
}

export function isSupabaseConfigured() {
  return isSupabaseServerConfigured();
}
