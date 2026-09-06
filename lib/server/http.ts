import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { matchesRequestOrigin } from "@/lib/origin-security";

export class HttpTimeoutError extends Error {
  constructor() { super("upstream_timeout"); }
}

export function requestId(request: NextRequest) {
  return request.headers.get("x-request-id") || crypto.randomUUID();
}

export function clientIp(request: NextRequest) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

export function isSameOrigin(request: NextRequest) {
  return matchesRequestOrigin(request.headers.get("origin"), request.nextUrl.host, request.headers.get("host"));
}

export function bodyWithinLimit(request: NextRequest, bytes: number) {
  const length = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(length) && length <= bytes;
}

export function secureCompare(left: string | null, right: string) {
  if (!left) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function apiError(message: string, status: number, id: string, code: string) {
  return NextResponse.json({ error: message, code, requestId: id }, { status, headers: { "x-request-id": id, "cache-control": "no-store" } });
}

export async function fetchWithTimeout(input: string | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new HttpTimeoutError();
    throw error;
  } finally { clearTimeout(timer); }
}

export async function fetchSafeGet(input: string | URL, init: RequestInit = {}, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, { ...init, method: "GET" });
      if (response.status < 500 || attempt === attempts - 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("upstream_unavailable");
}
