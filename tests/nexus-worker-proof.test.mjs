import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runPhysicalProof } from "../workers/nexus-worker/prove.mjs";

const token = `nxw1_${"A".repeat(43)}`;
const proofId = "123e4567-e89b-42d3-a456-426614174000";

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

test("physical proof faz heartbeat verificavel sem claim e retorna somente metadados sanitizados", async () => {
  let request = null;
  const proof = await withEnv({
    NEXUS_WORKER_TOKEN: token,
    NEXUS_WORKER_GATEWAY_URL: "https://example.supabase.co/functions/v1/nexus-worker-gateway",
    NEXUS_WORKER_NAME: "CI Physical Proof",
    NEXUS_WORKER_PROOF_ID: proofId,
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
  assert.equal(proof.proofId, proofId);
  assert.equal(proof.backendMarker, `proof:${proofId}`);
  assert.equal(request.url, "https://example.supabase.co/functions/v1/nexus-worker-gateway");

  const envelope = JSON.parse(request.init.body);
  assert.equal(envelope.action, "heartbeat");
  assert.equal(envelope.action === "claim", false);
  assert.equal(envelope.payload.name, `CI Physical Proof [proof:${proofId}]`);
  assert.equal(request.init.body.includes(token), false);
  assert.equal(Object.prototype.hasOwnProperty.call(proof, "token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(proof, "hostname"), false);
});

test("physical proof rejeita proofId invalido antes do heartbeat", async () => {
  let called = false;
  await assert.rejects(
    () => withEnv({
      NEXUS_WORKER_TOKEN: token,
      NEXUS_WORKER_GATEWAY_URL: "https://example.supabase.co/functions/v1/nexus-worker-gateway",
      NEXUS_WORKER_NAME: "CI Physical Proof",
      NEXUS_WORKER_PROOF_ID: "nao-e-uuid",
    }, () => runPhysicalProof(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    })),
    /NEXUS_WORKER_PROOF_ID_invalid/,
  );
  assert.equal(called, false);
});

test("proof launchers mantem proofId na sessao e nao persistem segredo", async () => {
  const [shell, powershell, probe, worker] = await Promise.all([
    readFile(new URL("../workers/nexus-worker/prove.sh", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/prove.ps1", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/prove.mjs", import.meta.url), "utf8"),
    readFile(new URL("../workers/nexus-worker/index.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /node \"\$VERIFY\"/);
  assert.match(shell, /node \"\$DOCTOR\"/);
  assert.match(shell, /node \"\$PROVE\"/);
  assert.match(shell, /exec node \"\$WORKER\"/);
  assert.match(shell, /NEXUS_WORKER_PROOF_ID/);
  assert.match(shell, /randomUUID/);
  assert.match(shell, /unset NEXUS_WORKER_PAIRING_CODE/);
  assert.doesNotMatch(shell, />[^\n]*(?:nxw1_|nxp1_|NEXUS_WORKER_TOKEN)/i);

  assert.match(powershell, /-AsSecureString/);
  assert.match(powershell, /\[guid\]::NewGuid\(\)/i);
  assert.match(powershell, /NEXUS_WORKER_PROOF_ID/);
  assert.match(powershell, /Remove-Item Env:NEXUS_WORKER_PAIRING_CODE/);
  assert.match(powershell, /Remove-Item Env:NEXUS_WORKER_TOKEN/);
  assert.match(powershell, /& node \$Prove/);
  assert.match(powershell, /& node \$Worker/);

  assert.doesNotMatch(probe, /console\.(?:log|error)\([^\n]*(?:NEXUS_WORKER_TOKEN|nxw1_|nxp1_)/i);
  assert.doesNotMatch(probe, /action:\s*["']claim["']/i);
  assert.match(probe, /backend=verifiable credential=redacted/);
  assert.match(probe, /\[proof:\$\{proofId\}\]/);

  assert.match(worker, /NEXUS_WORKER_PROOF_ID/);
  assert.match(worker, /\[proof:\$\{proofId\.toLowerCase\(\)\}\]/);
  assert.doesNotMatch(worker, /NEXUS_WORKER_PROOF_ID[^\n]*writeFile/i);
});
