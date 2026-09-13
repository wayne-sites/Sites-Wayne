import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const storeUrl = new URL("../lib/server/nexus-worker-store.ts", import.meta.url);
const presenceUrl = new URL("../lib/server/nexus-worker-presence.ts", import.meta.url);
const maintenanceUrl = new URL("../app/api/maintenance/route.ts", import.meta.url);
const routeUrl = new URL("../app/api/nexus/workers/route.ts", import.meta.url);
const componentUrl = new URL("../components/nexus-worker-presence.tsx", import.meta.url);

async function readPresence(rows) {
  const requests = [];
  const source = stripTypeScriptTypes(await readFile(presenceUrl, "utf8"))
    .replace(/^import .*;\s*$/gm, "")
    .replace("export async function listNexusWorkersForUser", "async function listNexusWorkersForUser");
  const context = vm.createContext({
    getSupabaseUrl: () => "https://example.invalid",
    getSupabaseSecretKey: () => "test-only",
    fetchSafeGet: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => url.includes("nexus_workspaces?") ? [{ id: "workspace-a" }] : rows };
    },
  });
  vm.runInContext(source, context);
  const result = await context.listNexusWorkersForUser("owner-a", 25, new Date("2026-09-10T12:00:00Z"));
  return { rows: JSON.parse(JSON.stringify(result)), requests };
}

const proofId = "123e4567-e89b-42d3-a456-426614174000";
const worker = {
  id: "worker-a", name: "Meu Nexus Worker", platform: "linux", status: "online",
  last_seen_at: "2026-09-10T11:59:30Z", capabilities: {}, created_at: "2026-09-09T12:00:00Z",
};

test("heartbeat runtime metadata produces proof even when enrollment name has no marker", async () => {
  const { rows, requests } = await readPresence([{ ...worker, reported_name: `host [proof:${proofId}]` }]);
  assert.deepEqual(rows[0].physicalProof, { id: proofId, state: "active" });
  assert.equal(rows[0].name, "Meu Nexus Worker");
  assert.ok(requests[1].includes("reported_name:runtime_info->>reported_name"));
  assert.equal("reported_name" in rows[0], false);
  assert.equal("runtime_info" in rows[0], false);
});

test("enrollment label cannot fabricate proof and malformed heartbeat names fail closed", async () => {
  for (const reported_name of [undefined, null, {}, 12, "host", "host [proof:invalid]"]) {
    const { rows } = await readPresence([{ ...worker, name: `label [proof:${proofId}]`, reported_name }]);
    assert.equal(rows[0].physicalProof, null);
  }
});

test("heartbeat proof becomes historical when stale, disabled, or errored", async () => {
  for (const change of [{ last_seen_at: "2026-09-10T11:57:59Z" }, { status: "disabled" }, { status: "error" }]) {
    const { rows } = await readPresence([{ ...worker, ...change, reported_name: `host [proof:${proofId}]` }]);
    assert.deepEqual(rows[0].physicalProof, { id: proofId, state: "historical" });
    assert.notEqual(rows[0].status, "online");
  }
});

test("worker presence reconciliation demotes only stale online workers", async () => {
  const source = await readFile(storeUrl, "utf8");
  assert.match(source, /reconcileStaleNexusWorkers/);
  assert.match(source, /status=eq\.online&last_seen_at=lt\./);
  assert.match(source, /method:\s*"PATCH"/);
  assert.match(source, /JSON\.stringify\(\{ status: "offline", updated_at: referenceIso \}\)/);
  assert.match(source, /prefer:\s*"return=representation"/);
  assert.match(source, /Math\.max\(60_000, Math\.min\(Math\.trunc\(staleAfterMs\), 15 \* 60_000\)\)/);
});

test("maintenance sweep reconciles stale worker presence without failing the whole cron", async () => {
  const source = await readFile(maintenanceUrl, "utf8");
  assert.match(source, /reconcileStaleNexusWorkers\(referenceAt\)\.catch\(\(\) => null\)/);
  assert.match(source, /stale_workers_marked_offline/);
  assert.match(source, /nexusWorkers:\s*staleNexusWorkers === null \? null : \{ markedOffline: staleNexusWorkers\.length \}/);
});

test("private presence read is owner-scoped and computes effective freshness", async () => {
  const source = await readFile(presenceUrl, "utf8");
  assert.match(source, /nexus_workspaces\?owner_user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
  assert.match(source, /workspace_id=in\.\(\$\{workspaceIds\.join\(","\)\}\)/);
  assert.match(source, /row\.status === "online" && ageMs !== null && ageMs <= staleAfterMs/);
  assert.match(source, /fresh \? "online" : "offline"/);
  assert.match(source, /staleAfterMs = 120_000/);
  assert.doesNotMatch(source, /token_hash|credential|nxw1_|nxp1_/i);
});

test("presence derives a sanitized physical proof gate from the backend marker", async () => {
  const source = await readFile(presenceUrl, "utf8");
  assert.match(source, /PHYSICAL_PROOF_MARKER/);
  assert.match(source, /\[proof:/);
  assert.match(source, /displayName: displayName \|\| "Nexus Worker"/);
  assert.match(source, /physicalProof: proofId \? \{/);
  assert.match(source, /state: status === "online" \? "active" : "historical"/);
  assert.match(source, /proofId: match\[1\]\.toLowerCase\(\)/);
  assert.doesNotMatch(source, /token_hash|credential|nxw1_|nxp1_/i);
});

test("worker presence endpoint requires auth and returns no-store", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /const user = await getCurrentUser\(\)/);
  assert.match(source, /if \(!user\) return apiError\("Autenticação necessária\.", 401/);
  assert.match(source, /listNexusWorkersForUser\(user\.id, 25\)/);
  assert.match(source, /"cache-control": "no-store"/);
});

test("Studio polls effective worker presence every 30 seconds and exposes proof state", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /fetch\("\/api\/nexus\/workers", \{ method: "GET", cache: "no-store" \}\)/);
  assert.match(source, /setInterval\(\(\) => void refresh\(true\), 30_000\)/);
  assert.match(source, /A prova física só fica ativa quando o backend observa um heartbeat recente/);
  assert.match(source, /physicalProof\?\.state === "active"/);
  assert.match(source, /PROVA FÍSICA ATIVA/);
  assert.match(source, /PROVA FÍSICA ANTERIOR/);
  assert.match(source, /physicalProof\.id\.slice\(0, 8\)/);
  assert.doesNotMatch(source, /credential|token_hash|nxw1_|nxp1_/i);
});
