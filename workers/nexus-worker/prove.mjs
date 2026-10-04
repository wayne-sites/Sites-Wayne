import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { inspectWorkerEnvironment, runtimeSelfTest } from "./doctor.mjs";
import { WORKER_CAPABILITIES, WORKER_TOOLS } from "./runtime.mjs";

const PROOF_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function platformName() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "macos";
  return "other";
}

function cleanWorkerName(value) {
  const name = String(value || "Nexus Physical Worker").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) throw new Error("NEXUS_WORKER_NAME_invalid");
  return name;
}

function resolveProofId() {
  const configured = process.env.NEXUS_WORKER_PROOF_ID?.trim() || "";
  const proofId = configured || randomUUID();
  if (!PROOF_ID_PATTERN.test(proofId)) throw new Error("NEXUS_WORKER_PROOF_ID_invalid");
  return proofId.toLowerCase();
}

function reportedName(proofId) {
  const base = cleanWorkerName(process.env.NEXUS_WORKER_NAME);
  const suffix = ` [proof:${proofId}]`;
  const maxBaseLength = 120 - suffix.length;
  return `${base.slice(0, maxBaseLength).trimEnd()}${suffix}`;
}

function announcement(proofId) {
  return {
    protocolVersion: "1",
    name: reportedName(proofId),
    platform: platformName(),
    tools: WORKER_TOOLS,
    capabilities: WORKER_CAPABILITIES,
    resources: {
      cpuCores: 1,
      ramMb: 128,
      gpu: false,
      gpuName: null,
    },
  };
}

async function postHeartbeat(environment, proofId, fetchImpl = fetch) {
  const token = process.env.NEXUS_WORKER_TOKEN?.trim() || "";
  const gateway = process.env.NEXUS_WORKER_GATEWAY_URL?.trim() || "";
  const base = process.env.NEXUS_BASE_URL?.trim().replace(/\/$/, "") || "";
  const url = gateway || `${base}/api/nexus/workers/heartbeat`;
  const body = gateway
    ? JSON.stringify({ action: "heartbeat", payload: announcement(proofId) })
    : JSON.stringify(announcement(proofId));

  const response = await fetchImpl(url, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body,
  });

  if (!response.ok) throw new Error(`heartbeat_${response.status}`);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new Error("heartbeat_invalid_json");
  return { status: response.status, environment };
}

export async function runPhysicalProof(fetchImpl = fetch) {
  const environment = inspectWorkerEnvironment();
  const selfTest = runtimeSelfTest();
  const proofId = resolveProofId();
  const heartbeat = await postHeartbeat(environment, proofId, fetchImpl);

  return {
    proofId,
    protocolVersion: "1",
    node: environment.node,
    platform: environment.platform,
    transport: environment.transport,
    runtime: {
      json: selfTest.json,
      markdown: selfTest.markdown,
      shellBlocked: selfTest.shellBlocked,
    },
    heartbeat: heartbeat.status,
    backendMarker: `proof:${proofId}`,
  };
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runPhysicalProof().then((proof) => {
    console.log(`[NEXUS PROOF] OK proof=${proof.proofId}`);
    console.log(`[NEXUS PROOF] protocol=${proof.protocolVersion} node=${proof.node} platform=${proof.platform} transport=${proof.transport}`);
    console.log(`[NEXUS PROOF] runtime=json:ok markdown:ok shell:${proof.runtime.shellBlocked ? "blocked" : "unexpected"}`);
    console.log(`[NEXUS PROOF] heartbeat=${proof.heartbeat} backend=verifiable credential=redacted`);
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "physical_proof_failed";
    console.error(`[NEXUS PROOF] FALHA: ${message}`);
    process.exitCode = 1;
  });
}
