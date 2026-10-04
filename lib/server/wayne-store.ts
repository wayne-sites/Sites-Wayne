import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { getSupabaseUrl, getSupabaseSecretKey } from "./supabase-env";
import { fetchWithTimeout } from "./http";
import { initialState, execute } from "@/lib/wayne/engine";
import type { State, VaultEntry } from "@/lib/wayne/types";
import type { Context } from "@/lib/wayne/skills/context";
export class WayneConflictError extends Error {}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const url = getSupabaseUrl(),
    key = getSupabaseSecretKey();
  if (!url || !key) throw Error("wayne_not_configured");
  const response = await fetchWithTimeout(
    `${url}/rest/v1/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    15000,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.message === "wayne_revision_conflict")
      throw new WayneConflictError("Recarregue o painel e tente novamente.");
    throw Error("wayne_storage_unavailable");
  }
  return response.json() as Promise<T>;
}
export async function loadWayne(userId: string) {
  const owner = encodeURIComponent(userId);
  const [states, records] = await Promise.all([
    request<{ state: State; revision: number }[]>(
      `nexus_wayne_state?user_id=eq.${owner}&select=state,revision&limit=1`,
    ),
    request<{ entry: VaultEntry }[]>(
      `nexus_wayne_vault?user_id=eq.${owner}&select=entry&order=created_at.desc,id.desc&limit=50`,
    ),
  ]);
  return {
    state: states[0]?.state || initialState(),
    revision: states[0]?.revision || 0,
    vault: records.map((r) => r.entry),
  };
}
export async function runWayne(userId: string, input: unknown) {
  // The reducer changes only an isolated copy; the database commits state, Vault,
  // project, artifacts and audit in one transaction with revision checking.
  const snapshot = await loadWayne(userId);
  const context: Context = {
    state: structuredClone(snapshot.state),
    history: snapshot.vault,
    entries: [],
    now: new Date().toISOString(),
    uuid: randomUUID,
    hash: (text) => createHash("sha256").update(text).digest("hex"),
  };
  const result = execute(context, input);
  const saved = await request<{ revision: number; projectId: string | null }>(
    "rpc/nexus_wayne_commit",
    {
      p_owner_user_id: userId,
      p_expected_revision: snapshot.revision,
      p_state: context.state,
      p_entries: context.entries,
      p_generation: context.generation || null,
    },
  );
  return { result, persistence: { ...saved, status: "persisted" } };
}
