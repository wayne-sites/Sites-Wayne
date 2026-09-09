import os from "node:os";
import { WORKER_CAPABILITIES, WORKER_TOOLS, executeWorkerCapability } from "./runtime.mjs";

const TOKEN_PATTERN = /^nxw1_[A-Za-z0-9_-]{43}$/;
const MIN_NODE = [22, 13, 0];

function fail(code, detail = "") {
  const error = new Error(code);
  error.detail = detail;
  throw error;
}

function parseNodeVersion(raw = process.versions.node) {
  const parts = String(raw).split(".").map((value) => Number.parseInt(value, 10));
  if (parts.length < 3 || parts.some((value) => !Number.isInteger(value))) fail("node_version_invalid");
  return parts.slice(0, 3);
}

function nodeSupported(version) {
  for (let i = 0; i < MIN_NODE.length; i += 1) {
    if (version[i] > MIN_NODE[i]) return true;
    if (version[i] < MIN_NODE[i]) return false;
  }
  return true;
}

function normalizeTransport(raw, name, allowLocalHttp) {
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    fail(`${name}_invalid`);
  }
  const localHttp = allowLocalHttp
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) fail(`${name}_must_use_https`);
  if (url.username || url.password) fail(`${name}_credentials_not_allowed`);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function inspectWorkerEnvironment(env = process.env) {
  const node = parseNodeVersion();
  if (!nodeSupported(node)) fail("node_22_13_or_newer_required", process.versions.node);

  const token = env.NEXUS_WORKER_TOKEN?.trim() || "";
  if (!TOKEN_PATTERN.test(token)) fail("NEXUS_WORKER_TOKEN_invalid");

  const gatewayUrl = normalizeTransport(env.NEXUS_WORKER_GATEWAY_URL || "", "NEXUS_WORKER_GATEWAY_URL", false);
  const baseUrl = normalizeTransport(env.NEXUS_BASE_URL || "", "NEXUS_BASE_URL", true);
  if (!gatewayUrl && !baseUrl) fail("NEXUS_WORKER_GATEWAY_URL_or_NEXUS_BASE_URL_required");

  return {
    node: process.versions.node,
    platform: process.platform,
    hostname: os.hostname(),
    transport: gatewayUrl ? "supabase-edge" : "vercel-api",
    tools: [...WORKER_TOOLS],
    capabilities: [...WORKER_CAPABILITIES],
  };
}

export function runtimeSelfTest() {
  const validated = executeWorkerCapability("data.json.validate", { text: "{\"nexus\":true}" });
  if (!validated.valid || validated.rootType !== "object") fail("worker_self_test_json_failed");

  const markdown = executeWorkerCapability("document.markdown.inspect", { text: "# Nexus\n\nWorker" });
  if (markdown.headingCount !== 1) fail("worker_self_test_markdown_failed");

  let blocked = false;
  try {
    executeWorkerCapability("shell.exec", { command: "blocked" });
  } catch (error) {
    blocked = error instanceof Error && error.message === "worker_capability_unsupported";
  }
  if (!blocked) fail("worker_self_test_allowlist_failed");

  return { json: true, markdown: true, shellBlocked: true };
}

function main() {
  const environment = inspectWorkerEnvironment();
  const selfTest = runtimeSelfTest();
  console.log("[NEXUS DOCTOR] OK");
  console.log(`[NEXUS DOCTOR] Node ${environment.node} • ${environment.platform} • ${environment.transport}`);
  console.log(`[NEXUS DOCTOR] tools: ${environment.tools.join(", ")}`);
  console.log(`[NEXUS DOCTOR] capabilities: ${environment.capabilities.join(", ")}`);
  console.log(`[NEXUS DOCTOR] sandbox: shell=${selfTest.shellBlocked ? "blocked" : "unexpected"}`);
  console.log("[NEXUS DOCTOR] credencial presente e formato válido; valor não exibido.");
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  try {
    main();
  } catch (error) {
    const code = error instanceof Error ? error.message : "worker_doctor_failed";
    console.error(`[NEXUS DOCTOR] FALHA: ${code}`);
    process.exitCode = 1;
  }
}
