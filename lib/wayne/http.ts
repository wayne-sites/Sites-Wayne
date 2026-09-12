/** Strict browser origin and byte limits independent of Content-Length. */
export function wayneOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const target = new URL(request.url);
    // Next may expose an internal hostname behind a reverse proxy. The browser
    // cannot override Host; compare its Origin with the actual request host.
    const host = request.headers.get("host");
    if (host) target.host = host;
    return new URL(origin).origin === target.origin;
  } catch {
    return false;
  }
}
export async function readWayneJson(
  request: Request,
  maxBytes = 100000,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Corpo obrigatório");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw Error("Entrada grande demais");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(combined));
}
