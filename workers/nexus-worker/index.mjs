import os from "node:os";
import { executeWorkerCapability, WORKER_CAPABILITIES, WORKER_TOOLS } from "./runtime.mjs";

const TOKEN_PATTERN = /^nxw1_[A-Za-z0-9_-]{43}$/;
const PROOF_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_FOR_CAPABILITY = new Map([
  ["data.json.validate", "nexus-json"],
  ["data.json.format", "nexus-json"],
  ["document.markdown.normalize", "nexus-markdown"],
  ["document.markdown.inspect", "nexus-markdown"],
]);

function integerEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) ? Math.max(min, Math.min(value, max)) : fallback;
}

function platformName() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "macos";
  return "other";
}

function normalizeHttpsUrl(raw, name, allowLocal = false) {
  if (!raw) return "";
  const url = new URL(raw.trim());
  const localHttp = allowLocal && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error(`${name}_must_use_https`);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function baseUrl() {
  const raw = process.env.NEXUS_BASE_URL?.trim();
  if (!raw) return "";
  const url = new URL(normalizeHttpsUrl(raw, "NEXUS_BASE_URL", true));
  url.pathname = "/";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function gatewayUrl() {
  const raw = process.env.NEXUS_WORKER_GATEWAY_URL?.trim();
  return raw ? normalizeHttpsUrl(raw, "NEXUS_WORKER_GATEWAY_URL") : "";
}

function workerName() {
  const base = (process.env.NEXUS_WORKER_NAME?.trim() || os.hostname() || "Nexus Worker").slice(0, 120);
  if (base.length < 2) throw new Error("NEXUS_WORKER_NAME_invalid");
  const proofId = process.env.NEXUS_WORKER_PROOF_ID?.trim() || "";
  if (!proofId) return base;
  if (!PROOF_ID_PATTERN.test(proofId)) throw new Error("NEXUS_WORKER_PROOF_ID_invalid");
  const suffix = ` [proof:${proofId.toLowerCase()}]`;
  const maxBaseLength = 120 - suffix.length;
  return `${base.slice(0, maxBaseLength).trimEnd()}${suffix}`;
}

const config = {
  baseUrl: baseUrl(),
  gatewayUrl: gatewayUrl(),
  token: process.env.NEXUS_WORKER_TOKEN?.trim() || "",
  name: workerName(),
  platform: platformName(),
  claimIntervalMs: integerEnv("NEXUS_CLAIM_INTERVAL_MS", 5000, 2000, 60000),
  heartbeatIntervalMs: integerEnv("NEXUS_HEARTBEAT_INTERVAL_MS", 30000, 10000, 90000),
  once: process.env.NEXUS_WORKER_ONCE === "1",
};

if (!TOKEN_PATTERN.test(config.token)) throw new Error("NEXUS_WORKER_TOKEN_invalid");
if (!config.gatewayUrl && !config.baseUrl) throw new Error("NEXUS_WORKER_GATEWAY_URL_or_NEXUS_BASE_URL_required");

let stopping = false;
let lastHeartbeatAt = 0;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gatewayAction(path) {
  if (path === "/api/nexus/workers/heartbeat") return "heartbeat";
  if (path === "/api/nexus/workers/jobs/claim") return "claim";
  if (path === "/api/nexus/workers/jobs/finish") return "finish";
  throw new Error("worker_gateway_path_unsupported");
}

async function api(path, init = {}) {
  let url;
  let body = init.body;

  if (config.gatewayUrl) {
    const action = gatewayAction(path);
    let payload = null;
    if (typeof init.body === "string" && init.body.length > 0) {
      try { payload = JSON.parse(init.body); }
      catch { throw new Error("worker_gateway_payload_invalid"); }
    }
    url = config.gatewayUrl;
    body = JSON.stringify({ action, payload });
  } else {
    url = `${config.baseUrl}${path}`;
  }

  const response = await fetch(url, {
    ...init,
    method: "POST",
    body,
    signal: AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { throw new Error(`nexus_invalid_json_${response.status}`); }
  }

  if (!response.ok) {
    const code = data && typeof data.error === "string"
      ? data.error
      : data && typeof data.code === "string"
        ? data.code
        : `http_${response.status}`;
    throw new Error(code);
  }
  return data;
}

function announcement() {
  return {
    protocolVersion: "1",
    name: config.name,
    platform: config.platform,
    tools: WORKER_TOOLS,
    capabilities: WORKER_CAPABILITIES,
    resources: {
      cpuCores: Math.max(1, os.cpus()?.length || 1),
      ramMb: Math.max(128, Math.round(os.totalmem() / 1024 / 1024)),
      gpu: false,
      gpuName: null,
    },
  };
}

async function heartbeat() {
  await api("/api/nexus/workers/heartbeat", {
    method: "POST",
    body: JSON.stringify(announcement()),
  });
  lastHeartbeatAt = Date.now();
}

function validateClaim(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("worker_job_invalid");
  if (typeof job.job_id !== "string" || typeof job.lease_id !== "string") throw new Error("worker_job_lease_invalid");
  if (typeof job.capability !== "string" || typeof job.tool_id !== "string") throw new Error("worker_job_route_invalid");
  const expectedTool = TOOL_FOR_CAPABILITY.get(job.capability);
  if (!expectedTool || expectedTool !== job.tool_id) throw new Error("worker_job_tool_mismatch");
  if (!job.input || typeof job.input !== "object" || Array.isArray(job.input)) throw new Error("worker_job_input_invalid");
  return job;
}

async function finish(job, status, output, error) {
  return api("/api/nexus/workers/jobs/finish", {
    method: "POST",
    body: JSON.stringify({
      jobId: job.job_id,
      leaseId: job.lease_id,
      status,
      output,
      error,
    }),
  });
}

async function processOneJob() {
  const response = await api("/api/nexus/workers/jobs/claim", { method: "POST" });
  if (!response?.job) return false;

  const job = validateClaim(response.job);
  console.log(`[NEXUS] job ${job.job_id} → ${job.capability}`);

  try {
    const output = executeWorkerCapability(job.capability, job.input);
    await finish(job, "succeeded", output, null);
    console.log(`[NEXUS] job ${job.job_id} concluído`);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 5000) : "worker_execution_failed";
    try {
      await finish(job, "failed", null, message);
    } catch (finishError) {
      const finishMessage = finishError instanceof Error ? finishError.message : "finish_failed";
      console.error(`[NEXUS] falha ao reportar job ${job.job_id}: ${finishMessage}`);
    }
    console.error(`[NEXUS] job ${job.job_id} falhou: ${message}`);
  }

  return true;
}

async function main() {
  console.log(`[NEXUS] worker ${config.name} iniciando em ${config.platform}`);
  console.log(`[NEXUS] transport: ${config.gatewayUrl ? "supabase-edge" : "vercel-api"}`);
  console.log(`[NEXUS] capabilities: ${WORKER_CAPABILITIES.join(", ")}`);
  await heartbeat();
  console.log("[NEXUS] heartbeat aceito; worker online");

  while (!stopping) {
    if (Date.now() - lastHeartbeatAt >= config.heartbeatIntervalMs) await heartbeat();
    const handled = await processOneJob();
    if (config.once) break;
    if (!handled) await sleep(config.claimIntervalMs);
  }

  console.log("[NEXUS] worker encerrado");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "worker_fatal_error";
  console.error(`[NEXUS] fatal: ${message}`);
  process.exitCode = 1;
});
