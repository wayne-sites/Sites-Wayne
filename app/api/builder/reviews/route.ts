import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { listOwnReviewConsents, revokeSiteReview } from "@/lib/server/site-lab-store";
import { readWayneJson, wayneOriginAllowed } from "@/lib/wayne/http";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Entre no Nexus para consultar suas autorizações." }, { status: 401, headers });
  try { return NextResponse.json({ reviews: await listOwnReviewConsents(user.id) }, { headers }); }
  catch { return NextResponse.json({ error: "Não foi possível consultar as autorizações." }, { status: 503, headers }); }
}
export async function DELETE(request: NextRequest) {
  if (!wayneOriginAllowed(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Entre no Nexus." }, { status: 401, headers });
  let input;
  try { input = await readWayneJson(request, 1024) as { id?: unknown }; }
  catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400, headers }); }
  if (!input || typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) return NextResponse.json({ error: "Identificador inválido." }, { status: 400, headers });
  try { await revokeSiteReview(user.id, input.id); return NextResponse.json({ removed: true }, { headers }); }
  catch { return NextResponse.json({ error: "Não foi possível remover a cópia." }, { status: 503, headers }); }
}
