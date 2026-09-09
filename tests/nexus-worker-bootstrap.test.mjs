import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectWorkerEnvironment, runtimeSelfTest } from "../workers/nexus-worker/doctor.mjs";

const validToken = `nxw1_${"A".repeat(43)}`;

test("worker doctor aceita gateway HTTPS e nao depende de segredo publico", () => {
  const result = inspectWorkerEnvironment({
    NEXUS_WORKER_TOKEN: validToken,
    NEXUS_WORKER_GATEWAY_URL: "https://example.supabase.co/functions/v1/nexus-worker-gateway",
  });
  assert.equal(result.transport, "supabase-edge");
  assert.deepEqual(result.tools, ["nexus-json", "nexus-markdown"]);
});

test("worker doctor rejeita token invalido e transporte remoto HTTP", () => {
  assert.throws(
    () => inspectWorkerEnvironment({ NEXUS_WORKER_TOKEN: "nxw1_curto", NEXUS_BASE_URL: "https://nexus.example" }),
    /NEXUS_WORKER_TOKEN_invalid/,
  );
  assert.throws(
    () => inspectWorkerEnvironment({ NEXUS_WORKER_TOKEN: validToken, NEXUS_BASE_URL: "http://nexus.example" }),
    /NEXUS_BASE_URL_must_use_https/,
  );
});

test("worker doctor permite HTTP somente para desenvolvimento local", () => {
  const result = inspectWorkerEnvironment({
    NEXUS_WORKER_TOKEN: validToken,
    NEXUS_BASE_URL: "http://127.0.0.1:3000",
  });
  assert.equal(result.transport, "vercel-api");
});

test("worker doctor prova allowlist basica e bloqueio de shell", () => {
  assert.deepEqual(runtimeSelfTest(), { json: true, markdown: true, shellBlocked: true });
});

test("launchers pedem token interativamente e aceitam gateway local instalado", async () => {
  const [powershell, shell] = await Promise.all([
    readFile(new URL("../workers/nexus-worker/start.ps1", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/start.sh", import.meta.url), "utf8"),
  ]);
  assert.match(powershell, /Read-Host .*Nexus Worker.*-AsSecureString/);
  assert.match(powershell, /doctor\.mjs/);
  assert.match(powershell, /gateway\.url/);
  assert.match(shell, /read -r -s -p/);
  assert.match(shell, /doctor\.mjs/);
  assert.match(shell, /gateway\.url/);
});

test("Studio usa instalador sem injetar token no comando", async () => {
  const studio = await readFile(new URL("../components/nexus-worker-enrollment.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(studio, /NEXUS_WORKER_TOKEN=\\?"\$\{token\}/);
  assert.match(studio, /install\.ps1/);
  assert.match(studio, /install\.sh/);
  assert.match(studio, /-Start/);
  assert.match(studio, /--start/);
});
