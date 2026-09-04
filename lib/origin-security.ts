export function matchesRequestOrigin(origin: string | null, nextUrlHost: string, hostHeader: string | null) {
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const effectiveHost = hostHeader?.trim().toLowerCase();
    return originHost === nextUrlHost.toLowerCase() || Boolean(effectiveHost && originHost === effectiveHost);
  } catch {
    return false;
  }
}
