const DEFAULT_AUTH_DESTINATION = "/conta";
const ALLOWED_AUTH_DESTINATIONS = new Set([DEFAULT_AUTH_DESTINATION]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export const NEW_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const CAPTCHA_TOKEN_MAX_LENGTH = 4_096;

function fullyDecode(value: string) {
  let current = value;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const decoded = decodeURIComponent(current);
    if (decoded === current) return current;
    current = decoded;
  }

  // Valores que continuam mudando após várias decodificações são ambíguos.
  throw new URIError("redirect_too_many_encodings");
}

export function safeNextPath(value: string | null | undefined, fallback = DEFAULT_AUTH_DESTINATION) {
  if (!value || value.length > 2_048) return fallback;

  try {
    const candidate = fullyDecode(value.trim()).normalize("NFKC");
    if (!candidate || candidate.includes("\\") || CONTROL_CHARACTERS.test(candidate)) return fallback;
    if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

    const base = new URL("https://nexus.internal");
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin || !ALLOWED_AUTH_DESTINATIONS.has(parsed.pathname) || parsed.hash) return fallback;

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function isAcceptableNewPassword(value: string) {
  return value.length >= NEW_PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}

export function normalizeCaptchaToken(value: unknown) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token.length > 0 && token.length <= CAPTCHA_TOKEN_MAX_LENGTH ? token : "";
}
