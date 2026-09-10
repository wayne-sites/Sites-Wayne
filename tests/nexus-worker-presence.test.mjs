import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storeUrl = new URL("../lib/server/nexus-worker-store.ts", import.meta.url);
const maintenanceUrl = new URL("../app/api/maintenance/route.ts", import.meta.url);

test("worker presence reconciliation demotes only stale online workers", async () => {
  const source = await readFile(storeUrl, "utf8");
  assert.match(source, /reconcileStaleNexusWorkers/);
  assert.match(source, /status=eq\.online&last_seen_at=lt\./);
  assert.match(source, /method:\s*"PATCH"/);
  assert.match(source, /JSON\.stringify\(\{ status: "offline", updated_at: referenceIso \}\)/);
  assert.match(source, /prefer:\s*"return=representation"/);
  assert.match(source, /Math\.max\(60_000, Math\.min\(Math\.trunc\(staleAfterMs\), 15 \* 60_000\)\)/);
  assert.doesNotMatch(source, /status=neq\.disabled/);
});

test("maintenance sweep reconciles stale worker presence without failing the whole cron", async () => {
  const source = await readFile(maintenanceUrl, "utf8");
  assert.match(source, /reconcileStaleNexusWorkers\(referenceAt\)\.catch\(\(\) => null\)/);
  assert.match(source, /stale_workers_marked_offline/);
  assert.match(source, /nexusWorkers:\s*staleNexusWorkers === null \? null : \{ markedOffline: staleNexusWorkers\.length \}/);
});
