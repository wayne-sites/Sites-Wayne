import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase-admin";
import { publicFeatureSummary } from "@/lib/server/features";
import { getSupabasePublishableKey, getSupabaseSecretKey, getSupabaseUrl } from "@/lib/server/supabase-env";

export const dynamic = "force-dynamic";

export function GET() {
  const supabase = {
    url: Boolean(getSupabaseUrl()),
    publishableKey: Boolean(getSupabasePublishableKey()),
    secretKey: Boolean(getSupabaseSecretKey()),
  };
  const supabaseSynced = supabase.url && supabase.publishableKey && supabase.secretKey;
  const payments = {
    accessToken: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()),
    webhookSecret: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()),
    testMode: process.env.MERCADO_PAGO_TEST_MODE?.trim().toLowerCase() === "true",
  };
  const checks = {
    application: "operational",
    database: isSupabaseConfigured() ? "configured" : "inactive",
    payments: payments.accessToken && payments.webhookSecret ? "configured" : "inactive",
    artificialIntelligence: process.env.AI_API_URL && process.env.AI_API_KEY ? "configured" : "inactive",
  } as const;
  const features = publicFeatureSummary();
  const limited = checks.database === "inactive" || checks.payments === "inactive";
  const build = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null,
    environment: process.env.VERCEL_ENV || null,
    nexusWorkerRuntime: "safe-v1",
  };
  return NextResponse.json({
    status: limited ? "limited" : "operational",
    timestamp: new Date().toISOString(),
    build,
    checks,
    integrations: { supabase: { ...supabase, synced: supabaseSynced }, payments },
    features,
  }, {
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
