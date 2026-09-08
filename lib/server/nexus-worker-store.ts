import "server-only";
import type { NexusWorkerAnnouncement, NexusWorkerPlatform } from "@/lib/nexus-worker-protocol";
import { fetchWithTimeout } from "@/lib/server/http";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/server/supabase-env";

export type NexusWorkerEnrollmentResult = {
  worker_id: string;
  workspace_id: string;
  status: "offline";
};

export type NexusWorkerHeartbeatResult = {
  worker_id: string;
  status: "online";
  last_seen_at: string;
};

function config() {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) throw new Error("nexus_worker_supabase_not_configured");
  return { url, key };
}

async function rpc<T>(name: string, body: Record<string, unknown>) {
  const { url, key } = config();
  const response = await fetchWithTimeout(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`nexus_worker_${response.status}_${await response.text()}`);
  return await response.json() as T;
}

export function enrollNexusWorkerForUser(input: {
  userId: string;
  name: string;
  platform: NexusWorkerPlatform;
  tokenHash: string;
}) {
  return rpc<NexusWorkerEnrollmentResult>("nexus_enroll_worker", {
    p_owner_user_id: input.userId,
    p_name: input.name,
    p_platform: input.platform,
    p_token_hash: input.tokenHash,
  });
}

export function heartbeatNexusWorker(tokenHash: string, announcement: NexusWorkerAnnouncement) {
  return rpc<NexusWorkerHeartbeatResult>("nexus_worker_heartbeat", {
    p_token_hash: tokenHash,
    p_announcement: announcement,
  });
}
