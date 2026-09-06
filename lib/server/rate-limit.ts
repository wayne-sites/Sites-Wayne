type Window = { resetAt: number; count: number };
const windows = new Map<string, Window>();
const MAX_WINDOWS = 5_000;

function pruneExpired(now: number) {
  for (const [entry, value] of windows) if (value.resetAt <= now) windows.delete(entry);
}

function makeRoom(now: number) {
  if (windows.size < MAX_WINDOWS) return;
  pruneExpired(now);
  if (windows.size < MAX_WINDOWS) return;

  let oldestKey: string | undefined;
  let oldestReset = Number.POSITIVE_INFINITY;
  for (const [entry, value] of windows) {
    if (value.resetAt < oldestReset) {
      oldestKey = entry;
      oldestReset = value.resetAt;
    }
  }
  if (oldestKey) windows.delete(oldestKey);
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const boundedKey = key.slice(0, 256);
  const current = windows.get(boundedKey);
  if (!current || current.resetAt <= now) makeRoom(now);
  const next = !current || current.resetAt <= now ? { count: 1, resetAt: now + windowMs } : { count: current.count + 1, resetAt: current.resetAt };
  windows.set(boundedKey, next);
  return { allowed: next.count <= limit, remaining: Math.max(0, limit - next.count), retryAfterSeconds: Math.max(1, Math.ceil((next.resetAt - now) / 1000)) };
}
