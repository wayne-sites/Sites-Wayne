import "server-only";

export type FeatureName = "watch" | "auth" | "marketplace" | "starkia";

export type FeatureStatus = {
  enabled: boolean;
  ready: boolean;
  missing: string[];
};

export type AuthCaptchaConfig = {
  required: boolean;
  siteKey: string;
};

function enabled(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
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

function starkiaStatus(): FeatureStatus {
  const base = status("STARKIA_ENABLED", ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STARKIA_RELAY_SECRET"]);
  const strongSecret = (process.env.STARKIA_RELAY_SECRET?.length || 0) >= 32;
  const missing = [...base.missing];
  if (present("STARKIA_RELAY_SECRET") && !strongSecret) missing.push("STARKIA_RELAY_SECRET>=32");
  return { enabled: base.enabled, ready: base.enabled && strongSecret && base.missing.length === 0, missing };
}

function authStatus(): FeatureStatus {
  const isEnabled = enabled("AUTH_ENABLED");
  const captcha = getAuthCaptchaConfig();
  const missing: string[] = [];
  if (!present("NEXT_PUBLIC_SUPABASE_URL")) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!present("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && !present("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!captcha.required) missing.push("AUTH_CAPTCHA_REQUIRED=true");
  if (!captcha.siteKey) missing.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  return { enabled: isEnabled, ready: isEnabled && missing.length === 0, missing };
}

export function getAuthCaptchaConfig(): AuthCaptchaConfig {
  return {
    required: enabled("AUTH_CAPTCHA_REQUIRED"),
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "",
  };
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
      return status("MARKETPLACE_ENABLED", [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "MERCADO_PAGO_ACCESS_TOKEN",
        "MERCADO_PAGO_WEBHOOK_SECRET",
      ]);
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
