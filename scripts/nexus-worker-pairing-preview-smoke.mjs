import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^nxw1_[A-Za-z0-9_-]{43}$/;
const PAIRING_PATTERN = /^nxp1_[A-Za-z0-9_-]{16}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function secretHeaders(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

async function requireOk(response, label) {
  if (!response.ok) throw new Error(`${label}_${response.status}`);
  return response;
}

async function cleanup(url, key, pairingId, workerName, ownerUserId) {
  const headers = { ...secretHeaders(key), prefer: "return=minimal" };
  let workerClean = true;
  let pairingClean = true;

  if (workerName && ownerUserId) {
    const workerUrl = new URL(`${url}/rest/v1/nexus_workers`);
    workerUrl.searchParams.set("name", `eq.${workerName}`);
    workerUrl.searchParams.set("created_by", `eq.${ownerUserId}`);
    const response = await fetch(workerUrl, { method: "DELETE", headers });
    workerClean = response.ok;
  }

  if (pairingId) {
    const pairingUrl = new URL(`${url}/rest/v1/nexus_worker_pairings`);
    pairingUrl.searchParams.set("id", `eq.${pairingId}`);
    const response = await fetch(pairingUrl, { method: "DELETE", headers });
    pairingClean = response.ok;
  }

  if (!workerClean || !pairingClean) throw new Error("pairing_preview_smoke_cleanup_failed");
}

async function run() {
  if (process.env.VERCEL_ENV !== "preview") {
    console.log("NEXUS_PAIRING_PREVIEW_SMOKE_SKIPPED");
    return;
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("pairing_preview_smoke_supabase_not_configured");

  const gateway = `${url}/functions/v1/nexus-worker-gateway`;
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA || "preview").slice(0, 8);
  const workerName = `Nexus Preview Smoke ${commit}-${randomBytes(3).toString("hex")}`;
  const pairingCode = `nxp1_${randomBytes(12).toString("base64url")}`;
  if (!PAIRING_PATTERN.test(pairingCode)) throw new Error("pairing_preview_smoke_code_invalid");

  let ownerUserId = "";
  let pairingId = "";
  let token = "";
  let failure = null;

  try {
    const workspaceResponse = await requireOk(await fetch(`${url}/rest/v1/nexus_workspaces?select=owner_user_id&order=created_at.asc&limit=1`, {
      headers: secretHeaders(key),
      cache: "no-store",
    }), "pairing_preview_smoke_owner");
    const workspaces = await workspaceResponse.json();
    ownerUserId = Array.isArray(workspaces) && typeof workspaces[0]?.owner_user_id === "string" ? workspaces[0].owner_user_id : "";
    if (!ownerUserId) throw new Error("pairing_preview_smoke_owner_missing");

    const createResponse = await requireOk(await fetch(`${url}/rest/v1/rpc/nexus_create_worker_pairing`, {
      method: "POST",
      headers: secretHeaders(key),
      body: JSON.stringify({
        p_owner_user_id: ownerUserId,
        p_name: workerName,
        p_platform: "other",
        p_code_hash: sha256(pairingCode),
        p_ttl_seconds: 120,
      }),
    }), "pairing_preview_smoke_create");
    const created = await createResponse.json();
    pairingId = typeof created?.pairing_id === "string" ? created.pairing_id : "";
    if (!pairingId) throw new Error("pairing_preview_smoke_pairing_id_missing");

    const pairResponse = await requireOk(await fetch(gateway, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ action: "pair", payload: { code: pairingCode } }),
    }), "pairing_preview_smoke_pair");
    if (pairResponse.status !== 201) throw new Error(`pairing_preview_smoke_pair_status_${pairResponse.status}`);
    const paired = await pairResponse.json();
    token = typeof paired?.credential?.token === "string" ? paired.credential.token : "";
    if (!TOKEN_PATTERN.test(token)) throw new Error("pairing_preview_smoke_token_invalid");

    const heartbeatResponse = await requireOk(await fetch(gateway, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        action: "heartbeat",
        payload: {
          protocolVersion: "1",
          name: workerName,
          platform: "other",
          tools: ["nexus-json", "nexus-markdown"],
          capabilities: ["data.json.validate", "document.markdown.inspect"],
          resources: { cpuCores: 1, ramMb: 128, gpu: false, gpuName: null },
        },
      }),
    }), "pairing_preview_smoke_heartbeat");
    if (heartbeatResponse.status !== 200) throw new Error(`pairing_preview_smoke_heartbeat_status_${heartbeatResponse.status}`);

    const reuseResponse = await fetch(gateway, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ action: "pair", payload: { code: pairingCode } }),
    });
    const reuseBody = await reuseResponse.json().catch(() => ({}));
    if (reuseResponse.status !== 401 || reuseBody?.error !== "pairing_invalid") {
      throw new Error(`pairing_preview_smoke_reuse_not_blocked_${reuseResponse.status}`);
    }

    console.log("NEXUS_PAIRING_PREVIEW_SMOKE_OK pair=201 heartbeat=200 reuse=401");
  } catch (error) {
    failure = error instanceof Error ? error : new Error("pairing_preview_smoke_failed");
  } finally {
    token = "";
    await cleanup(url, key, pairingId, workerName, ownerUserId);
  }

  if (failure) throw failure;
}

await run();
