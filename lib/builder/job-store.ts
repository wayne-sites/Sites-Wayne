import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { fetchWithTimeout } from "@/lib/server/http";
import type { BuilderProject } from "@/lib/builder/manifest";
import type { BuilderAgentJobStatus } from "@/lib/builder/publication";

export type BuilderAgentJobStatusView = {
  id: string;
  status: BuilderAgentJobStatus;
  project_name: string;
  publish_slug: string;
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
  completed_at: string | null;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("builder_job_store_not_configured");
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
  }, 10_000);
  if (!response.ok) throw new Error(`builder_job_store_${response.status}_${(await response.text()).slice(0, 300)}`);
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
  const rows = await rpc<Array<{ id: string; status: BuilderAgentJobStatus; publish_slug: string }>>(
    "enqueue_builder_agent_job",
    {
      p_user_id: row.user_id || null,
      p_project_name: row.project_name,
      p_publish_slug: row.publish_slug,
      p_project: row.project,
      p_plan: row.plan || null,
      p_audit: row.audit || null,
      p_provider: row.provider || null,
      p_model: row.model || null,
      p_generation_path: row.generation_path || null,
      p_status_token_hash: row.status_token_hash,
    },
  );
  const result = rows[0];
  if (!result) throw new Error("builder_job_store_enqueue_empty");
  return result;
}

export async function getBuilderAgentJobStatus(id: string, statusTokenHash: string) {
  const rows = await rpc<BuilderAgentJobStatusView[]>("get_builder_agent_job_status", {
    p_id: id,
    p_status_token_hash: statusTokenHash,
  });
  return rows[0] || null;
}
