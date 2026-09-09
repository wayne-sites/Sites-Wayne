import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { redeemPairingCode } from "../workers/nexus-worker/pair.mjs";

const pairingCode = `nxp1_${"A".repeat(16)}`;
const workerToken = `nxw1_${"B".repeat(43)}`;

test("pairing helper troca codigo one-time sem Authorization", async () => {
  let request = null;
  const token = await redeemPairingCode(
    "https://example.supabase.co/functions/v1/nexus-worker-gateway",
    pairingCode,
    async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ credential: { token: workerToken, displayOnce: true } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.equal(token, workerToken);
  assert.equal(request.url, "https://example.supabase.co/functions/v1/nexus-worker-gateway");
  assert.equal(request.init.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(request.init.body), { action: "pair", payload: { code: pairingCode } });
});

test("pairing helper rejeita codigo invalido e HTTP remoto", async () => {
  await assert.rejects(() => redeemPairingCode("https://example.supabase.co/functions/v1/nexus-worker-gateway", "nxp1_curto"), /PAIRING_CODE_invalid/);
  await assert.rejects(() => redeemPairingCode("http://example.com/functions/v1/nexus-worker-gateway", pairingCode), /must_use_https/);
});

test("migration de pairing e invoker-only, one-time e limitada a 10 minutos", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260909213000_nexus_worker_pairing_v1.sql", import.meta.url), "utf8");
  assert.match(sql, /security invoker/gi);
  assert.match(sql, /for update/i);
  assert.match(sql, /p_ttl_seconds > 600/);
  assert.match(sql, /consumed_at is not null/);
  assert.match(sql, /revoke execute .* from public, anon, authenticated/i);
  assert.match(sql, /grant execute .* to service_role/i);
});

test("gateway processa pair antes de exigir bearer token", async () => {
  const source = await readFile(new URL("../supabase/functions/nexus-worker-gateway/index.ts", import.meta.url), "utf8");
  const pairIndex = source.indexOf('if (action === "pair")');
  const authIndex = source.indexOf("const token = bearerToken(request)");
  assert.ok(pairIndex >= 0 && authIndex > pairIndex);
  assert.doesNotMatch(source, /console\.(?:log|error).*code/i);
  assert.match(source, /createWorkerToken\(\)/);
  assert.match(source, /nexus_redeem_worker_pairing/);
});

test("pairing fica automatico apenas em Preview e Production continua por flag", async () => {
  const [route, page, component] = await Promise.all([
    readFile(new URL("../app/api/nexus/workers/pairings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/studio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/nexus-worker-enrollment.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /NEXUS_WORKER_PAIRING_V1 === "1" \|\| process\.env\.VERCEL_ENV === "preview"/);
  assert.match(page, /NEXUS_WORKER_PAIRING_V1 === "1" \|\| process\.env\.VERCEL_ENV === "preview"/);
  assert.doesNotMatch(component, /NEXT_PUBLIC_NEXUS_WORKER_PAIRING_V1/);
  assert.match(component, /pairingEnabled: boolean/);
});

test("launchers aceitam pairing sem persistir codigo", async () => {
  const [shell, powershell, manifest] = await Promise.all([
    readFile(new URL("../workers/nexus-worker/start.sh", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/start.ps1", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/worker-manifest.json", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /NEXUS_WORKER_PAIRING_CODE/);
  assert.match(shell, /unset NEXUS_WORKER_PAIRING_CODE/);
  assert.match(powershell, /Remove-Item Env:NEXUS_WORKER_PAIRING_CODE/);
  assert.doesNotMatch(shell, /gateway\.url.*PAIRING/i);
  const value = JSON.parse(manifest);
  assert.equal(value.version, "0.3.0-preview");
  assert.ok(value.files.includes("pair.mjs"));
  assert.equal(value.security.pairingCodeStoredByLauncher, false);
  assert.equal(value.security.pairingMaxTtlSeconds, 600);
});
