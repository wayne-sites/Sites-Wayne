function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function applicationOrigin(requestOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      const allowInsecureLocal = process.env.AUTH_ALLOW_INSECURE_LOCAL === "true" && isLocalHost(url.hostname);
      if (url.protocol === "https:" || allowInsecureLocal) return url.origin;
    } catch {
      // Usa a origem já normalizada pelo framework abaixo.
    }
  }

  return new URL(requestOrigin).origin;
}
