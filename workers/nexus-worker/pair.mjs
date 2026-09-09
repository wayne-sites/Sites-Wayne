import { pathToFileURL } from "node:url";

const TOKEN_PATTERN = /^nxw1_[A-Za-z0-9_-]{43}$/;
const PAIRING_PATTERN = /^nxp1_[A-Za-z0-9_-]{16}$/;

function normalizeGateway(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("NEXUS_WORKER_GATEWAY_URL_required_for_pairing");
  const url = new URL(raw.trim());
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("NEXUS_WORKER_GATEWAY_URL_must_use_https");
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function redeemPairingCode(gatewayUrl, code, fetchImpl = fetch) {
  const gateway = normalizeGateway(gatewayUrl);
  if (typeof code !== "string" || !PAIRING_PATTERN.test(code.trim())) throw new Error("NEXUS_WORKER_PAIRING_CODE_invalid");

  const response = await fetchImpl(gateway, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "pair", payload: { code: code.trim() } }),
    signal: AbortSignal.timeout(15000),
  });

  let data = null;
  try { data = await response.json(); }
  catch { throw new Error(`NEXUS_WORKER_PAIRING_invalid_json_${response.status}`); }
  if (!response.ok) {
    const error = data && typeof data.error === "string" ? data.error : `http_${response.status}`;
    throw new Error(`NEXUS_WORKER_PAIRING_${error}`);
  }
  const token = data?.credential?.token;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) throw new Error("NEXUS_WORKER_PAIRING_token_invalid");
  return token;
}

async function main() {
  const token = await redeemPairingCode(
    process.env.NEXUS_WORKER_GATEWAY_URL || "",
    process.env.NEXUS_WORKER_PAIRING_CODE || "",
  );
  process.stdout.write(token);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "NEXUS_WORKER_PAIRING_failed";
    console.error(`[NEXUS PAIR] ${message}`);
    process.exitCode = 1;
  });
}
