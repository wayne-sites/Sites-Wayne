import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-security";
import { ACCESS_COOKIE, REFRESH_COOKIE, sessionCookieOptions } from "@/lib/auth-session";

type RefreshPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type SessionState =
  | { status: "authenticated"; refreshed?: Required<RefreshPayload> }
  | { status: "anonymous"; clearCookies?: boolean }
  | { status: "unavailable" };

function authConfig() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.AUTH_ENABLED?.trim().toLowerCase() !== "true" || !rawUrl || !key) return null;

  try {
    const url = new URL(rawUrl);
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const allowInsecureLocal = process.env.AUTH_ALLOW_INSECURE_LOCAL === "true" && local;
    if (url.protocol !== "https:" && !allowInsecureLocal) return null;
    return { url: url.toString().replace(/\/$/, ""), key };
  } catch {
    return null;
  }
}

async function authFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function inspectSession(request: NextRequest): Promise<SessionState> {
  const config = authConfig();
  if (!config) return { status: "anonymous" };

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return { status: "anonymous" };

  try {
    if (accessToken) {
      const userResponse = await authFetch(`${config.url}/auth/v1/user`, {
        headers: { apikey: config.key, authorization: `Bearer ${accessToken}` },
      });
      if (userResponse.ok) return { status: "authenticated" };
      if (userResponse.status >= 500) return { status: "unavailable" };
    }

    if (!refreshToken) return { status: "anonymous", clearCookies: true };
    const refreshResponse = await authFetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.key, "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (refreshResponse.status >= 500) return { status: "unavailable" };
    if (!refreshResponse.ok) return { status: "anonymous", clearCookies: true };

    const body = await refreshResponse.json().catch(() => ({})) as RefreshPayload;
    if (!body.access_token || !body.refresh_token || !Number.isFinite(body.expires_in)) return { status: "anonymous", clearCookies: true };
    return {
      status: "authenticated",
      refreshed: {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_in: Number(body.expires_in),
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

function applyPrivateHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function applySessionState(response: NextResponse, state: SessionState) {
  if (state.status === "anonymous" && state.clearCookies) {
    response.cookies.set(ACCESS_COOKIE, "", sessionCookieOptions(0));
    response.cookies.set(REFRESH_COOKIE, "", sessionCookieOptions(0));
  }
  if (state.status === "authenticated" && state.refreshed) {
    response.cookies.set(ACCESS_COOKIE, state.refreshed.access_token, sessionCookieOptions(Math.min(3_600, Math.max(60, state.refreshed.expires_in))));
    response.cookies.set(REFRESH_COOKIE, state.refreshed.refresh_token, sessionCookieOptions(60 * 60 * 24 * 30));
  }
  return applyPrivateHeaders(response);
}

export async function proxy(request: NextRequest) {
  const state = await inspectSession(request);
  const pathname = request.nextUrl.pathname;

  if (pathname === "/conta" && state.status === "anonymous") {
    const login = new URL("/entrar", request.url);
    login.searchParams.set("next", "/conta");
    return applySessionState(NextResponse.redirect(login), state);
  }

  if (pathname === "/entrar" && state.status === "authenticated") {
    const destination = safeNextPath(request.nextUrl.searchParams.get("next"));
    return applySessionState(NextResponse.redirect(new URL(destination, request.url)), state);
  }

  if (pathname === "/entrar" && state.status === "anonymous" && !state.clearCookies) {
    return NextResponse.next();
  }

  return applySessionState(NextResponse.next(), state);
}

export const config = {
  matcher: ["/conta", "/entrar"],
};
