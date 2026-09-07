import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { fetchSafeGet, fetchWithTimeout } from "@/lib/server/http";
import type { BuilderProject } from "@/lib/builder/manifest";
import type { BuilderAgentJobStatus } from "@/lib/builder/publication";

export type BuilderAgentJob = {
  id: string;
  user_id: string | null;
  status: BuilderAgentJobStatus;
  project_name: string;
  publish_slug: string;
  project: BuilderProject;
  plan: Record<string, unknown> | null;
  audit: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  generation_path: string | null;
  status_token_hash: string;
  worker_id: string | null;
  attempts: number;
  branch_name: string | null;
  commit_sha: string | null;
  pr_number: number | null;
  pr_url: string | null;
  preview_url: string | null;
  ci_url: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  completed_at: string | null;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("builder_job_store_not_configured");
  return { url, key };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const target = `${url}/rest/v1/${path}`;
  const requestInit: RequestInit = {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  };
  const response = !requestInit.method || requestInit.method === "GET"
    ? await fetchSafeGet(target, requestInit)
    : await fetchWithTimeout(target, requestInit, 10_000);
  if (!response.ok) throw new Error(`builder_job_store_${response.status}_${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function createBuilderJobToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashBuilderJobToken(token) };
}

export function hashBuilderJobToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function insertBuilderAgentJob(row: {
  user_id?: string | null;
  project_name: string;
  publish_slug: string;
  project: BuilderProject;
  plan?: Record<string, unknown> | null;
  audit?: Record<string, unknown> | null;
  provider?: string | null;
  model?: string | null;
  generation_path?: string | null;
  status_token_hash: string;
}) {
  const rows = await request<BuilderAgentJob[]>("builder_agent_jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...row, status: "queued" }),
  });
  return rows[0];
}

export async function getBuilderAgentJob(id: string) {
  const rows = await request<BuilderAgentJob[]>(
    `builder_agent_jobs?id=eq.${encodeURIComponent(id)}&select=*`,
  );
  return rows[0] || null;
}

export async function claimBuilderAgentJob(workerId: string) {
  const rows = await request<BuilderAgentJob[]>("rpc/claim_builder_agent_job", {
    method: "POST",
    body: JSON.stringify({ p_worker_id: workerId }),
  });
  return rows[0] || null;
}

export async function updateBuilderAgentJob(
  id: string,
  patch: Partial<Pick<BuilderAgentJob,
    | "status"
    | "branch_name"
    | "commit_sha"
    | "pr_number"
    | "pr_url"
    | "preview_url"
    | "ci_url"
    | "error_code"
    | "error_message"
    | "completed_at"
  >>,
  workerId?: string,
) {
  const workerFilter = workerId ? `&worker_id=eq.${encodeURIComponent(workerId)}` : "";
  const rows = await request<BuilderAgentJob[]>(
    `builder_agent_jobs?id=eq.${encodeURIComponent(id)}${workerFilter}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    },
  );
  return rows[0] || null;
}
