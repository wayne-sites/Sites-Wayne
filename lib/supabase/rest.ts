import "server-only";
import { fetchSafeGet, fetchWithTimeout } from "@/lib/server/http";

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("supabase_public_not_configured");
  return { url, key };
}

export async function supabaseUserRequest<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const { url, key } = publicConfig();
  const requestInit: RequestInit = {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  };
  const response = !requestInit.method || requestInit.method === "GET"
    ? await fetchSafeGet(`${url}/rest/v1/${path}`, requestInit)
    : await fetchWithTimeout(`${url}/rest/v1/${path}`, requestInit);
  if (!response.ok) throw new Error(`supabase_user_${response.status}_${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function supabasePublicRequest<T>(path: string) {
  const { url, key } = publicConfig();
  const response = await fetchSafeGet(`${url}/rest/v1/${path}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, next: { revalidate: 300 } } as RequestInit);
  if (!response.ok) throw new Error(`supabase_public_${response.status}`);
  return await response.json() as T;
}
