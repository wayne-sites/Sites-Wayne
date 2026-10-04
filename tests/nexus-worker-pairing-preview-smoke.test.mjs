import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const smokeUrl = new URL("../scripts/nexus-worker-pairing-preview-smoke.mjs", import.meta.url);

test("pairing preview smoke roda somente em Vercel Preview", async () => {
  const source = await readFile(smokeUrl, "utf8");
  assert.match(source, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(source, /NEXUS_PAIRING_PREVIEW_SMOKE_SKIPPED/);
  assert.doesNotMatch(source, /VERCEL_ENV === "production"/);
});

test("pairing preview smoke prova pair, heartbeat e bloqueio de reutilizacao", async () => {
  const source = await readFile(smokeUrl, "utf8");
  assert.match(source, /action: "pair"/);
  assert.match(source, /action: "heartbeat"/);
  assert.match(source, /reuseResponse\.status !== 401/);
  assert.match(source, /pairing_invalid/);
  assert.match(source, /pair=201 heartbeat=200 reuse=401/);
});

test("pairing preview smoke nao imprime segredos e limpa residuos", async () => {
  const source = await readFile(smokeUrl, "utf8");
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:pairingCode|token)/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /nexus_workers/);
  assert.match(source, /nexus_worker_pairings/);
  assert.match(source, /finally \{/);
  assert.match(source, /token = ""/);
});

test("pairing preview smoke usa TTL curto e service-role apenas no servidor", async () => {
  const source = await readFile(smokeUrl, "utf8");
  assert.match(source, /p_ttl_seconds: 120/);
  assert.match(source, /SUPABASE_SECRET_KEY/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_(?:SECRET|SERVICE_ROLE)/);
});
