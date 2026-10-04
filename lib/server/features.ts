import "server-only";
import { getSupabasePublishableKey, getSupabaseSecretKey, getSupabaseUrl } from "@/lib/server/supabase-env";

export type FeatureName = "watch" | "auth" | "marketplace" | "starkia";

export type FeatureStatus = {
  enabled: boolean;
  ready: boolean;
  missing: string[];
};

function enabled(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function enabledUnlessExplicitlyDisabled(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === undefined || value === "" ? true : value === "true";
}

function watchStatus(): FeatureStatus {
  const base = status("NEXUS_WATCH_ENABLED", ["TMDB_ACCESS_TOKEN", "NEXT_PUBLIC_TMDB_LOGO_URL"]);
  const licensed = enabled("TMDB_COMMERCIAL_APPROVED");
  let validLogo = false;
  try { validLogo = new URL(process.env.NEXT_PUBLIC_TMDB_LOGO_URL || "").protocol === "https:"; } catch { validLogo = false; }
  const missing = [...base.missing];
  if (!licensed) missing.push("TMDB_COMMERCIAL_APPROVED=true");
  if (present("NEXT_PUBLIC_TMDB_LOGO_URL") && !validLogo) missing.push("NEXT_PUBLIC_TMDB_LOGO_URL=https://...");
  return { enabled: base.enabled, ready: base.enabled && licensed && validLogo && base.missing.length === 0, missing };
}

function authStatus(): FeatureStatus {
  const missing: string[] = [];
  if (!getSupabaseUrl()) missing.push("SUPABASE_URL");
  if (!getSupabasePublishableKey()) missing.push("SUPABASE_PUBLISHABLE_KEY");
  const isEnabled = enabledUnlessExplicitlyDisabled("AUTH_ENABLED");
  return { enabled: isEnabled, ready: isEnabled && missing.length === 0, missing };
}

function marketplaceStatus(): FeatureStatus {
  const missing: string[] = [];
  if (!getSupabaseUrl()) missing.push("SUPABASE_URL");
  if (!getSupabasePublishableKey()) missing.push("SUPABASE_PUBLISHABLE_KEY");
  if (!getSupabaseSecretKey()) missing.push("SUPABASE_SECRET_KEY");
  for (const name of ["MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_WEBHOOK_SECRET"]) if (!present(name)) missing.push(name);
  const isEnabled = enabled("MARKETPLACE_ENABLED");
  return { enabled: isEnabled, ready: isEnabled && missing.length === 0, missing };
}

function starkiaStatus(): FeatureStatus {
  const missing: string[] = [];
  if (!getSupabaseUrl()) missing.push("SUPABASE_URL");
  if (!getSupabaseSecretKey()) missing.push("SUPABASE_SECRET_KEY");
  if (!present("STARKIA_RELAY_SECRET")) missing.push("STARKIA_RELAY_SECRET");
  const strongSecret = (process.env.STARKIA_RELAY_SECRET?.length || 0) >= 32;
  if (present("STARKIA_RELAY_SECRET") && !strongSecret) missing.push("STARKIA_RELAY_SECRET>=32");
  const isEnabled = enabled("STARKIA_ENABLED");
  return { enabled: isEnabled, ready: isEnabled && strongSecret && missing.length === 0, missing };
}

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

function status(flag: string, requirements: string[]): FeatureStatus {
  const missing = requirements.filter((name) => !present(name));
  const isEnabled = enabled(flag);
  return { enabled: isEnabled, ready: isEnabled && missing.length === 0, missing };
}

export function getFeatureStatus(name: FeatureName): FeatureStatus {
  switch (name) {
    case "watch":
      return watchStatus();
    case "auth":
      return authStatus();
    case "marketplace":
      return marketplaceStatus();
    case "starkia":
      return starkiaStatus();
  }
}

export function publicFeatureSummary() {
  return {
    watch: getFeatureStatus("watch").ready,
    auth: getFeatureStatus("auth").ready,
    marketplace: getFeatureStatus("marketplace").ready,
    starkia: getFeatureStatus("starkia").ready,
  };
}
