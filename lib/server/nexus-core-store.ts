import "server-only";
import { fetchSafeGet, fetchWithTimeout } from "@/lib/server/http";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/server/supabase-env";
import type { NexusProjectCreateInput, NexusProjectType } from "@/lib/nexus-core";

export type NexusWorkspace = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type NexusProject = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  project_type: NexusProjectType;
  status: "draft" | "active" | "archived";
  stack: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  artifacts?: Array<{ id: string; kind: string; name: string; path: string; version: number }>;
};

function config() {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) throw new Error("nexus_core_supabase_not_configured");
  return { url, key };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { url, key } = config();
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
    ? await fetchSafeGet(`${url}/rest/v1/${path}`, requestInit)
    : await fetchWithTimeout(`${url}/rest/v1/${path}`, requestInit);
  if (!response.ok) throw new Error(`nexus_core_${response.status}_${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function listNexusProjectsForUser(userId: string, limit = 100) {
  const workspaces = await request<NexusWorkspace[]>(
    `nexus_workspaces?owner_user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc`,
  );
  if (!workspaces.length) return [];
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const filter = workspaceIds.length === 1
    ? `eq.${encodeURIComponent(workspaceIds[0])}`
    : `in.(${workspaceIds.map((id) => encodeURIComponent(id)).join(",")})`;
  return request<NexusProject[]>(
    `nexus_projects?workspace_id=${filter}&select=*,artifacts:nexus_artifacts(id,kind,name,path,version)&order=updated_at.desc&limit=${Math.max(1, Math.min(limit, 200))}`,
  );
}

export async function createNexusProjectForUser(userId: string, input: NexusProjectCreateInput) {
  const rows = await request<NexusProject[]>("rpc/nexus_create_project", {
    method: "POST",
    body: JSON.stringify({
      p_owner_user_id: userId,
      p_name: input.name,
      p_description: input.description || "",
      p_project_type: input.project_type,
      p_stack: input.stack,
      p_metadata: input.metadata,
      p_artifacts: input.artifacts,
    }),
  });
  return rows[0] || null;
}
