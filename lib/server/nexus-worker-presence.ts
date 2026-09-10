import "server-only";
import type { NexusWorkerPlatform } from "@/lib/nexus-worker-protocol";
import { fetchSafeGet } from "@/lib/server/http";
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/server/supabase-env";

export type NexusWorkerEffectiveStatus = "offline" | "online" | "disabled" | "error";
export type NexusWorkerPhysicalProofState = "active" | "historical";

export type NexusWorkerPresenceSummary = {
  id: string;
  name: string;
  platform: NexusWorkerPlatform;
  status: NexusWorkerEffectiveStatus;
  lastSeenAt: string | null;
  secondsSinceSeen: number | null;
  tools: string[];
  capabilities: string[];
  physicalProof: {
    id: string;
    state: NexusWorkerPhysicalProofState;
  } | null;
  createdAt: string;
};

type StoredWorkerRow = {
  id: string;
  name: string;
  platform: NexusWorkerPlatform;
  status: NexusWorkerEffectiveStatus;
  last_seen_at: string | null;
  capabilities: Record<string, unknown> | null;
  created_at: string;
};

type WorkspaceRow = { id: string };

const PHYSICAL_PROOF_MARKER = /\s*\[proof:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\s*$/i;

function config() {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) throw new Error("nexus_worker_supabase_not_configured");
  return { url, key };
}

function headers(key: string) {
  return { apikey: key, authorization: `Bearer ${key}` };
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 100);
}

function parsePhysicalProof(name: string) {
  const match = name.match(PHYSICAL_PROOF_MARKER);
  if (!match) return { displayName: name, proofId: null };
  const displayName = name.replace(PHYSICAL_PROOF_MARKER, "").trim();
  return {
    displayName: displayName || "Nexus Worker",
    proofId: match[1].toLowerCase(),
  };
}

function summarizeWorker(row: StoredWorkerRow, referenceMs: number, staleAfterMs: number): NexusWorkerPresenceSummary {
  const lastSeenMs = row.last_seen_at ? Date.parse(row.last_seen_at) : Number.NaN;
  const ageMs = Number.isFinite(lastSeenMs) ? Math.max(0, referenceMs - lastSeenMs) : null;
  const fresh = row.status === "online" && ageMs !== null && ageMs <= staleAfterMs;
  const status: NexusWorkerEffectiveStatus = row.status === "disabled" || row.status === "error"
    ? row.status
    : fresh ? "online" : "offline";
  const advertised = row.capabilities && typeof row.capabilities === "object" ? row.capabilities : {};
  const { displayName, proofId } = parsePhysicalProof(row.name);

  return {
    id: row.id,
    name: displayName,
    platform: row.platform,
    status,
    lastSeenAt: row.last_seen_at,
    secondsSinceSeen: ageMs === null ? null : Math.floor(ageMs / 1000),
    tools: stringArray(advertised.tools),
    capabilities: stringArray(advertised.capabilities),
    physicalProof: proofId ? {
      id: proofId,
      state: status === "online" ? "active" : "historical",
    } : null,
    createdAt: row.created_at,
  };
}

export async function listNexusWorkersForUser(
  userId: string,
  limit = 25,
  referenceAt = new Date(),
  staleAfterMs = 120_000,
) {
  if (!Number.isFinite(referenceAt.getTime())) throw new Error("nexus_worker_presence_reference_invalid");
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const safeStaleAfterMs = Math.max(60_000, Math.min(Math.trunc(staleAfterMs), 15 * 60_000));
  const { url, key } = config();

  const workspaceResponse = await fetchSafeGet(
    `${url}/rest/v1/nexus_workspaces?owner_user_id=eq.${encodeURIComponent(userId)}&select=id&limit=100`,
    { cache: "no-store", headers: headers(key) },
  );
  if (!workspaceResponse.ok) throw new Error(`nexus_worker_presence_workspaces_${workspaceResponse.status}`);
  const workspaces = await workspaceResponse.json() as WorkspaceRow[];
  const workspaceIds = workspaces.map((workspace) => workspace.id).filter(Boolean);
  if (!workspaceIds.length) return [];

  const select = "id,name,platform,status,last_seen_at,capabilities,created_at";
  const workersResponse = await fetchSafeGet(
    `${url}/rest/v1/nexus_workers?workspace_id=in.(${workspaceIds.join(",")})&select=${select}&order=created_at.desc&limit=${safeLimit}`,
    { cache: "no-store", headers: headers(key) },
  );
  if (!workersResponse.ok) throw new Error(`nexus_worker_presence_workers_${workersResponse.status}`);
  const rows = await workersResponse.json() as StoredWorkerRow[];
  const referenceMs = referenceAt.getTime();
  return rows.map((row) => summarizeWorker(row, referenceMs, safeStaleAfterMs));
}
