import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runPhysicalProof } from "../workers/nexus-worker/prove.mjs";

const token = `nxw1_${"A".repeat(43)}`;

function withEnv(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("physical proof faz heartbeat sem claim e retorna somente metadados sanitizados", async () => {
  let request = null;
  const proof = await withEnv({
    NEXUS_WORKER_TOKEN: token,
    NEXUS_WORKER_GATEWAY_URL: "https://example.supabase.co/functions/v1/nexus-worker-gateway",
    NEXUS_WORKER_NAME: "CI Physical Proof",
  }, () => runPhysicalProof(async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ heartbeat: { status: "online" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }));

  assert.equal(proof.protocolVersion, "1");
  assert.equal(proof.heartbeat, 200);
  assert.equal(proof.runtime.json, true);
  assert.equal(proof.runtime.markdown, true);
  assert.equal(proof.runtime.shellBlocked, true);
  assert.match(proof.proofId, /^[0-9a-f-]{36}$/i);
  assert.equal(request.url, "https://example.supabase.co/functions/v1/nexus-worker-gateway");
  assert.equal(JSON.parse(request.init.body).action, "heartbeat");
  assert.equal(JSON.parse(request.init.body).action === "claim", false);
  assert.equal(Object.prototype.hasOwnProperty.call(proof, "token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(proof, "hostname"), false);
});

test("proof launchers nao persistem segredo e iniciam worker somente depois da prova", async () => {
  const [shell, powershell, probe] = await Promise.all([
    readFile(new URL("../workers/nexus-worker/prove.sh", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/prove.ps1", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/prove.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /node \"\$VERIFY\"/);
  assert.match(shell, /node \"\$DOCTOR\"/);
  assert.match(shell, /node \"\$PROVE\"/);
  assert.match(shell, /exec node \"\$WORKER\"/);
  assert.match(shell, /unset NEXUS_WORKER_PAIRING_CODE/);
  assert.doesNotMatch(shell, />[^\n]*(?:nxw1_|nxp1_|NEXUS_WORKER_TOKEN)/i);

  assert.match(powershell, /-AsSecureString/);
  assert.match(powershell, /Remove-Item Env:NEXUS_WORKER_PAIRING_CODE/);
  assert.match(powershell, /Remove-Item Env:NEXUS_WORKER_TOKEN/);
  assert.match(powershell, /& node \$Prove/);
  assert.match(powershell, /& node \$Worker/);

  assert.doesNotMatch(probe, /console\.(?:log|error)\([^\n]*(?:NEXUS_WORKER_TOKEN|nxw1_|nxp1_)/i);
  assert.doesNotMatch(probe, /action:\s*["']claim["']/i);
  assert.match(probe, /credential=redacted/);
});
