import { NextRequest, NextResponse } from "next/server";
import { applicationOrigin } from "@/lib/app-origin";
import { getFeatureStatus } from "@/lib/server/features";
import { getOAuthProviders, supabaseAuthorizeUrl } from "@/lib/supabase/auth";

export async function GET(request: NextRequest) {
  if (!getFeatureStatus("auth").ready) return NextResponse.redirect(new URL("/entrar?erro=auth_disabled", request.url));
  const provider = request.nextUrl.searchParams.get("provider") || "";
  if (request.nextUrl.searchParams.get("accepted") !== "1") return NextResponse.redirect(new URL("/entrar?erro=terms_required", request.url));
  if (!getOAuthProviders().includes(provider)) return NextResponse.redirect(new URL("/entrar?erro=provider_disabled", request.url));
  return NextResponse.redirect(supabaseAuthorizeUrl(provider, `${applicationOrigin(request.nextUrl.origin)}/auth/callback`));
}
