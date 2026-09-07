import { NextRequest, NextResponse } from "next/server";
import { expireMarketplaceOrders, listPublishedWayneSites, updateWayneOrder } from "@/lib/supabase-admin";
import { listDueCrmFollowups } from "@/lib/server/crm-store";
import { expireCrmProposals } from "@/lib/server/crm-proposals";
import { fetchWithTimeout, requestId, secureCompare } from "@/lib/server/http";
import { log } from "@/lib/server/logger";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const secret = process.env.CRON_SECRET;
  if (!secret || !secureCompare(request.headers.get("authorization"), `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado.", requestId: id }, { status: 401 });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : request.nextUrl.origin);
  try {
    const expiredMarketplaceOrders = await expireMarketplaceOrders(100).catch(() => null);
    const sites = await listPublishedWayneSites(100);
    const checkedAt = new Date().toISOString();
    const referenceAt = new Date(checkedAt);
    const [dueCrmFollowups, expiredCrmProposals] = await Promise.all([
      listDueCrmFollowups(referenceAt, 100).catch(() => null),
      expireCrmProposals(referenceAt).catch(() => null),
    ]);
    if (dueCrmFollowups?.length) {
      log("warn", "crm-followup", "followups_due", {
        requestId: id,
        count: dueCrmFollowups.length,
        oldestDueAt: dueCrmFollowups[0]?.due_at || null,
      });
    }
    if (expiredCrmProposals?.length) log("info", "crm-proposals", "proposals_expired", { requestId: id, count: expiredCrmProposals.length });

    const results = await Promise.all(sites.map(async (site) => {
      let status = "offline";
      try {
        const response = await fetchWithTimeout(`${baseUrl}/clientes/${site.slug}`, { redirect: "manual", cache: "no-store" }, 5000);
        status = response.ok ? "online" : `http_${response.status}`;
      } catch { status = "offline"; }
      await updateWayneOrder(site.id, { last_health_status: status, last_health_check_at: checkedAt });
      return { slug: site.slug, status };
    }));
    return NextResponse.json({
      checkedAt,
      sites: results.length,
      results,
      expiredMarketplaceOrders,
      crmFollowups: dueCrmFollowups === null ? null : {
        due: dueCrmFollowups.length,
        oldestDueAt: dueCrmFollowups[0]?.due_at || null,
      },
      crmProposals: expiredCrmProposals === null ? null : { expired: expiredCrmProposals.length },
      requestId: id,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    log("error", "wayne-maintenance", "health_sweep_failed", { requestId: id, error });
    return NextResponse.json({ error: "Falha na manutenção automática.", requestId: id }, { status: 500 });
  }
}
