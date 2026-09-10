import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storeUrl = new URL("../lib/server/nexus-worker-store.ts", import.meta.url);
const presenceUrl = new URL("../lib/server/nexus-worker-presence.ts", import.meta.url);
const maintenanceUrl = new URL("../app/api/maintenance/route.ts", import.meta.url);
const routeUrl = new URL("../app/api/nexus/workers/route.ts", import.meta.url);
const componentUrl = new URL("../components/nexus-worker-presence.tsx", import.meta.url);

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

test("worker presence endpoint requires auth and returns no-store", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /const user = await getCurrentUser\(\)/);
  assert.match(source, /if \(!user\) return apiError\("Autenticação necessária\.", 401/);
  assert.match(source, /listNexusWorkersForUser\(user\.id, 25\)/);
  assert.match(source, /"cache-control": "no-store"/);
});

test("Studio polls effective worker presence every 30 seconds", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /fetch\("\/api\/nexus\/workers", \{ method: "GET", cache: "no-store" \}\)/);
  assert.match(source, /setInterval\(\(\) => void refresh\(true\), 30_000\)/);
  assert.match(source, /ONLINE exige heartbeat com no máximo 2 minutos/);
  assert.doesNotMatch(source, /credential|token_hash|nxw1_|nxp1_/i);
});
