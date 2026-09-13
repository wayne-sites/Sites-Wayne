import "server-only";

function firstPresent(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function getSupabaseUrl() {
  const value = firstPresent("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  return value ? value.replace(/\/$/, "") : "";
}

export function getSupabaseSecretKey() {
  return firstPresent("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabasePublishableKey() {
  return firstPresent(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

export function isSupabaseServerConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}

export function isSupabaseAuthConfigured() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}
