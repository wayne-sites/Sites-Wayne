import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, sessionCookieOptions } from "@/lib/auth-session";
import { fetchSafeGet, fetchWithTimeout, HttpTimeoutError } from "@/lib/server/http";

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

export class SupabaseAuthResponseError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function isSupabaseAuthUnavailable(error: unknown) {
  if (error instanceof HttpTimeoutError) return true;
  if (error instanceof SupabaseAuthResponseError) return error.status === 408 || error.status >= 500;
  return true;
}

export function isSupabaseRateLimited(error: unknown) {
  return error instanceof SupabaseAuthResponseError && error.status === 429;
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
  if (!response.ok) throw new SupabaseAuthResponseError(response.status, body.error_description || body.msg || body.message || body.error || `supabase_auth_${response.status}`);
  return body;
}

function captchaMetadata(captchaToken: string) {
  return { gotrue_meta_security: { captcha_token: captchaToken } };
}

export async function signInWithPassword(email: string, password: string, captchaToken: string) {
  return authRequest<SupabaseSession>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password, ...captchaMetadata(captchaToken) }),
  });
}

export async function signUpWithPassword(email: string, password: string, displayName: string, redirectTo: string, captchaToken: string) {
  return authRequest<Partial<SupabaseSession> & { user: SupabaseUser }>(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      data: { display_name: displayName, terms_version: "2026-08-17", terms_accepted_at: new Date().toISOString() },
      ...captchaMetadata(captchaToken),
    }),
  });
}

export async function sendRecoveryEmail(email: string, redirectTo: string, captchaToken: string) {
  return authRequest<Record<string, never>>(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email, ...captchaMetadata(captchaToken) }),
  });
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
  try {
    await authRequest<Record<string, never>>("/logout", { method: "POST", body: "{}" }, accessToken);
    return true;
  } catch {
    return false;
  }
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
  const accessMaxAge = Math.min(3_600, Math.max(60, session.expires_in || 3_600));
  response.cookies.set(ACCESS_COOKIE, session.access_token, sessionCookieOptions(accessMaxAge));
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, sessionCookieOptions(60 * 60 * 24 * 30));
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", sessionCookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", sessionCookieOptions(0));
}

export function getOAuthProviders() {
  const allowed = new Set(["google", "github", "azure"]);
  return (process.env.SUPABASE_OAUTH_PROVIDERS || "").split(",").map((value) => value.trim().toLowerCase()).filter((value) => allowed.has(value));
}

export function supabaseAuthorizeUrl(provider: string, redirectTo: string) {
  const { url } = config();
  return `${url}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`;
}
