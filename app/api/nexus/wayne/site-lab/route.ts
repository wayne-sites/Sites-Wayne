import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isWayneOwner } from "@/lib/server/wayne-owner";
import { listSiteReviews, getSiteReview } from "@/lib/server/site-lab-store";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Entre no Nexus." }, { status: 401, headers });
  try {
    if (!(await isWayneOwner(user.id))) return NextResponse.json({ error: "Acesso restrito." }, { status: 403, headers });
    const id = request.nextUrl.searchParams.get("id");
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Identificador inválido." }, { status: 400, headers });
    if (id) {
      const review = await getSiteReview(user.id, id);
      return NextResponse.json(review ? { review } : { error: "Revisão não encontrada." }, { status: review ? 200 : 404, headers });
    }
    return NextResponse.json({ reviews: await listSiteReviews(user.id) }, { headers });
  } catch { return NextResponse.json({ error: "O laboratório está indisponível. Tente novamente." }, { status: 503, headers }); }
}
