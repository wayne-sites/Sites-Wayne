declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const TOKEN_PATTERN = /^nxw1_[A-Za-z0-9_-]{43}$/;
const PAIRING_PATTERN = /^nxp1_[A-Za-z0-9_-]{16}$/;
const MAX_BODY_BYTES = 600_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createWorkerToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `nxw1_${base64Url(bytes)}`;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function rpc(name: string, args: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("gateway_not_configured");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) throw new Error(`rpc_${response.status}_${name}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function rpcErrorCode(message: string) {
  if (message.includes("nexus_redeem_worker_pairing")) return ["pairing_invalid", 401] as const;
  if (message.includes("worker_credential_invalid")) return ["worker_credential_invalid", 401] as const;
  if (message.includes("worker_disabled")) return ["worker_disabled", 409] as const;
  if (message.includes("worker_platform_mismatch")) return ["worker_platform_mismatch", 409] as const;
  if (message.includes("worker_not_online") || message.includes("worker_not_fresh")) return ["worker_unavailable", 409] as const;
  if (message.includes("job_lease_invalid") || message.includes("job_lease_expired")) return ["job_lease_invalid", 409] as const;
  return ["worker_gateway_rpc_failed", 503] as const;
}

Deno.serve(async (request: Request) => {
  const requestId = crypto.randomUUID();
  if (request.method !== "POST") return json({ error: "method_not_allowed", requestId }, 405);

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "body_too_large", requestId }, 413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: "body_too_large", requestId }, 413);
  }

  let envelope: unknown;
  try { envelope = raw ? JSON.parse(raw) : {}; }
  catch { return json({ error: "invalid_json", requestId }, 400); }

  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return json({ error: "invalid_gateway_envelope", requestId }, 400);
  }

  const body = envelope as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const payload = body.payload;

  try {
    if (action === "pair") {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return json({ error: "pairing_invalid", requestId }, 400);
      }
      const code = (payload as Record<string, unknown>).code;
      if (typeof code !== "string" || !PAIRING_PATTERN.test(code)) {
        return json({ error: "pairing_invalid", requestId }, 401);
      }

      const token = createWorkerToken();
      const worker = await rpc("nexus_redeem_worker_pairing", {
        p_code_hash: await sha256Hex(code),
        p_token_hash: await sha256Hex(token),
      });
      return json({ worker, credential: { token, displayOnce: true }, requestId }, 201);
    }

    const token = bearerToken(request);
    if (!token) return json({ error: "worker_auth_required", requestId }, 401);
    const tokenHash = await sha256Hex(token);

    if (action === "heartbeat") {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return json({ error: "invalid_worker_announcement", requestId }, 400);
      }
      const heartbeat = await rpc("nexus_worker_heartbeat", {
        p_token_hash: tokenHash,
        p_announcement: payload,
      });
      const protocolVersion = (payload as Record<string, unknown>).protocolVersion;
      return json({ heartbeat, protocolVersion, requestId });
    }

    if (action === "claim") {
      const job = await rpc("nexus_worker_claim_job", { p_token_hash: tokenHash });
      return json({ job, requestId });
    }

    if (action === "finish") {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return json({ error: "invalid_job_completion", requestId }, 400);
      }
      const completion = payload as Record<string, unknown>;
      const jobId = typeof completion.jobId === "string" ? completion.jobId : null;
      const leaseId = typeof completion.leaseId === "string" ? completion.leaseId : null;
      const status = completion.status === "succeeded" || completion.status === "failed" ? completion.status : null;
      if (!jobId || !leaseId || !status) return json({ error: "invalid_job_completion", requestId }, 400);
      if (completion.output !== null && completion.output !== undefined && (typeof completion.output !== "object" || Array.isArray(completion.output))) {
        return json({ error: "invalid_job_output", requestId }, 400);
      }
      if (completion.error !== null && completion.error !== undefined && typeof completion.error !== "string") {
        return json({ error: "invalid_job_error", requestId }, 400);
      }
      const job = await rpc("nexus_worker_finish_job", {
        p_token_hash: tokenHash,
        p_job_id: jobId,
        p_lease_id: leaseId,
        p_status: status,
        p_output: completion.output ?? null,
        p_error: completion.error ?? null,
      });
      return json({ job, requestId });
    }

    return json({ error: "unknown_action", requestId }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_gateway_failed";
    const [code, status] = rpcErrorCode(message);
    return json({ error: code, requestId }, status);
  }
});
