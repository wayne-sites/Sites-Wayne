export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export const BLOCKED_PATTERNS = [
  /\\brm\\s+-rf\\b/i, /\\bformat\\b/i, /\\bshutdown\\b/i, /\\breg\\s+delete\\b/i,
  /\\bdel\\s+/[sq]\\b/i, /\\bpowershell\\b/i, /\\bcmd(?:\\.exe)?\\b/i,
];

export function containsBlockedContent(text: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(text));
}

export type MarketplaceCartItem = { product_id: string; quantity: number };

export function parseMarketplaceCart(value: unknown): { ok: true; items: MarketplaceCartItem[] } | { ok: false } {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return { ok: false };
  const seen = new Set<string>();
  const items: MarketplaceCartItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return { ok: false };
    const item = entry as { productId?: unknown; quantity?: unknown };
    if (!isUuid(item.productId) || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 10 || seen.has(item.productId)) return { ok: false };
    seen.add(item.productId);
    items.push({ product_id: item.productId, quantity: Number(item.quantity) });
  }
  return { ok: true, items };
}

