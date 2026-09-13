import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchSafeGet, fetchWithTimeout } from "@/lib/server/http";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/server/supabase-env";

const ACCESS_COOKIE = "nexus_access_token";
const REFRESH_COOKIE = "nexus_refresh_token";

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: { display_name?: string; full_name?: string; avatar_url?: string; terms_version?: string; terms_accepted_at?: string };
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  user: SupabaseUser;
};

type AuthError = { error?: string; error_description?: string; msg?: string; message?: string; error_code?: string };

function config() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) throw new Error("supabase_auth_not_configured");
  return { url, key };
}

async function authRequest<T>(path: string, init: RequestInit = {}, bearer?: string) {
  const { url, key } = config();
  const requestInit: RequestInit = {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(init.headers || {}),
    },
  };
  const response = !requestInit.method || requestInit.method === "GET"
    ? await fetchSafeGet(`${url}/auth/v1${path}`, requestInit)
    : await fetchWithTimeout(`${url}/auth/v1${path}`, requestInit);
  const body = await response.json().catch(() => ({})) as T & AuthError;
  if (!response.ok) throw new Error(body.error_description || body.msg || body.message || body.error || `supabase_auth_${response.status}`);
  return body;
}

export async function signInWithPassword(email: string, password: string) {
  return authRequest<SupabaseSession>("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function signUpWithPassword(email: string, password: string, displayName: string, redirectTo: string) {
  return authRequest<Partial<SupabaseSession> & { user: SupabaseUser }>(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email, password, data: { display_name: displayName, terms_version: "2026-08-17", terms_accepted_at: new Date().toISOString() } }),
  });
}

export async function sendRecoveryEmail(email: string, redirectTo: string) {
  return authRequest<Record<string, never>>(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", body: JSON.stringify({ email }) });
}

export async function updatePassword(accessToken: string, password: string) {
  return authRequest<{ user?: SupabaseUser }>("/user", { method: "PUT", body: JSON.stringify({ password }) }, accessToken);
}

export async function acceptCurrentTerms(accessToken: string) {
  return authRequest<{ user?: SupabaseUser }>("/user", { method: "PUT", body: JSON.stringify({ data: { terms_version: "2026-08-17", terms_accepted_at: new Date().toISOString() } }) }, accessToken);
}

export async function getUserFromAccessToken(accessToken: string) {
  return authRequest<SupabaseUser>("/user", { method: "GET" }, accessToken);
}

export async function refreshSupabaseSession(refreshToken: string) {
  return authRequest<SupabaseSession>("/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) });
}

export async function revokeSupabaseSession(accessToken: string) {
  return authRequest<Record<string, never>>("/logout", { method: "POST", body: "{}" }, accessToken).catch(() => undefined);
}

export async function readSessionTokens() {
  const store = await cookies();
  return { accessToken: store.get(ACCESS_COOKIE)?.value || "", refreshToken: store.get(REFRESH_COOKIE)?.value || "" };
}

export async function getCurrentUser() {
  const { accessToken } = await readSessionTokens();
  if (!accessToken) return null;
  try { return await getUserFromAccessToken(accessToken); }
  catch { return null; }
}

export function setSessionCookies(response: NextResponse, session: Pick<SupabaseSession, "access_token" | "refresh_token" | "expires_in">) {
  const base = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  response.cookies.set(ACCESS_COOKIE, session.access_token, { ...base, maxAge: Math.max(60, session.expires_in || 3_600) });
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSessionCookies(response: NextResponse) {
  const base = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 };
  response.cookies.set(ACCESS_COOKIE, "", base);
  response.cookies.set(REFRESH_COOKIE, "", base);
}

export function getOAuthProviders() {
  const allowed = new Set(["google", "github", "azure"]);
  return (process.env.SUPABASE_OAUTH_PROVIDERS || "").split(",").map((value) => value.trim().toLowerCase()).filter((value) => allowed.has(value));
}

export function supabaseAuthorizeUrl(provider: string, redirectTo: string) {
  const { url } = config();
  return `${url}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`;
}
