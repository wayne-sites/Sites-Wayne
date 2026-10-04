import "server-only";
import { createHash } from "node:crypto";
import { reviewSite, sitePreview, SITE_LAB_VERSION, SITE_LAB_CONSENT, type SiteReview } from "@/lib/site-lab";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getSupabaseUrl, getSupabaseSecretKey } from "./supabase-env";
import { fetchSafeGet, fetchWithTimeout } from "./http";
import { isWayneOwner } from "./wayne-owner";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = getSupabaseUrl(), key = getSupabaseSecretKey();
  if (!url || !key) throw Error("site_lab_unavailable");
  const options = { ...init, cache: "no-store" as const, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" } };
  const fetcher = !init.method || init.method === "GET" ? fetchSafeGet : fetchWithTimeout;
  const response = await fetcher(`${url}/rest/v1/${path}`, options);
  if (!response.ok) throw Error("site_lab_unavailable");
  return response.status === 204 ? undefined as T : response.json();
}
export type LabSummary = { id: string; name: string; created_at: string; source_hash: string; engine_version: string };
type LabRow = LabSummary & { review: SiteReview };

export async function captureBuilderReview(project: unknown, consent: boolean) {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: consent ? "signin_required" : "skipped" };
    const owner = await isWayneOwner(user.id);
    if (!consent && !owner) return { status: "skipped" };
    const review = reviewSite(project);
    const hash = createHash("sha256").update(JSON.stringify(review.original)).digest("hex");
    const id = await request<string>("rpc/nexus_capture_site_review", { method: "POST", body: JSON.stringify({
      p_creator: user.id, p_consent: consent, p_consent_version: SITE_LAB_CONSENT,
      p_hash: hash, p_engine: SITE_LAB_VERSION, p_name: review.original.name, p_review: review,
    }) });
    return { status: "saved", id };
  } catch {
    // A review failure must not lose the customer's generated original or report a saved copy.
    return { status: "failed" };
  }
}

export async function listSiteReviews(userId: string) {
  if (!(await isWayneOwner(userId))) throw Error("site_lab_forbidden");
  return request<LabSummary[]>("nexus_site_reviews?select=id,name,created_at,source_hash,engine_version&order=created_at.desc&limit=100");
}
export async function getSiteReview(userId: string, id: string) {
  if (!(await isWayneOwner(userId))) throw Error("site_lab_forbidden");
  const rows = await request<LabRow[]>(`nexus_site_reviews?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const row = rows[0];
  if (!row) return null;
  return { ...row, previews: { original: sitePreview(row.review.original), revised: sitePreview(row.review.revised) } };
}
export async function listOwnReviewConsents(userId: string) {
  return request<LabSummary[]>(`nexus_site_reviews?creator_user_id=eq.${encodeURIComponent(userId)}&select=id,name,created_at,source_hash,engine_version&order=created_at.desc&limit=100`);
}
export async function revokeSiteReview(userId: string, id: string) {
  await request(`nexus_site_reviews?id=eq.${encodeURIComponent(id)}&creator_user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
}
