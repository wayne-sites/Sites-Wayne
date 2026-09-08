import "server-only";
import type { NexusWorkerAnnouncement, NexusWorkerPlatform } from "@/lib/nexus-worker-protocol";
import type { NexusWorkerJobCompletion, NexusWorkerJobRequest } from "@/lib/nexus-worker-jobs";
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

export type NexusWorkerJobQueuedResult = {
  job_id: string;
  workspace_id: string;
  project_id: string;
  tool_id: string;
  capability: string;
  status: "queued";
  queued_at: string;
};

export type NexusWorkerJobClaimResult = {
  job_id: string;
  project_id: string | null;
  tool_id: string;
  capability: string;
  input: Record<string, unknown>;
  lease_id: string;
  lease_expires_at: string;
  attempt: number;
  max_attempts: number;
};

export type NexusWorkerJobFinishResult = {
  job_id: string;
  status: "succeeded" | "failed";
  finished_at: string;
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

export function enqueueNexusWorkerJobForUser(userId: string, job: NexusWorkerJobRequest) {
  return rpc<NexusWorkerJobQueuedResult>("nexus_enqueue_worker_job", {
    p_owner_user_id: userId,
    p_project_id: job.projectId,
    p_capability: job.capability,
    p_input: job.input,
    p_zero_cost_mode: true,
  });
}

export function claimNexusWorkerJob(tokenHash: string) {
  return rpc<NexusWorkerJobClaimResult | null>("nexus_worker_claim_job", {
    p_token_hash: tokenHash,
  });
}

export function finishNexusWorkerJob(tokenHash: string, completion: NexusWorkerJobCompletion) {
  return rpc<NexusWorkerJobFinishResult>("nexus_worker_finish_job", {
    p_token_hash: tokenHash,
    p_job_id: completion.jobId,
    p_lease_id: completion.leaseId,
    p_status: completion.status,
    p_output: completion.output,
    p_error: completion.error,
  });
}
