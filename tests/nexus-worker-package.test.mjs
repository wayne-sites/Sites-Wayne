import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { WORKER_CAPABILITIES, WORKER_TOOLS } from "../workers/nexus-worker/runtime.mjs";

const root = new URL("../workers/nexus-worker/", import.meta.url);

async function manifest() {
  return JSON.parse(await readFile(new URL("worker-manifest.json", root), "utf8"));
}

test("worker package manifest segue o runtime allowlisted", async () => {
  const value = await manifest();
  assert.equal(value.name, "nexus-worker");
  assert.equal(value.version, "0.3.1-preview");
  assert.equal(value.protocolVersion, "1");
  assert.equal(value.minimumNode, "22.13.0");
  assert.deepEqual(value.tools, WORKER_TOOLS);
  assert.deepEqual(value.capabilities, WORKER_CAPABILITIES);
  assert.equal(value.security.zeroCostOnly, true);
  assert.equal(value.security.shellExec, false);
  assert.equal(value.security.childProcess, false);
  assert.equal(value.security.eval, false);
  assert.equal(value.security.docker, false);
  assert.equal(value.security.browserAutomation, false);
  assert.equal(value.security.tokenStoredByInstaller, false);
  assert.equal(value.security.pairingCodeStoredByLauncher, false);
  assert.equal(value.security.pairingCodeSingleUse, true);
  assert.equal(value.security.pairingMaxTtlSeconds, 600);
  assert.equal(value.security.proofCredentialRedacted, true);
  assert.equal(value.security.proofClaimsJobsByDefault, false);
  assert.equal(value.security.autostart, false);
  assert.equal(value.security.gatewayStoredLocally, true);
});

test("worker package declara apenas arquivos locais e todos existem", async () => {
  const value = await manifest();
  assert.equal(new Set(value.files).size, value.files.length);
  for (const file of value.files) {
    assert.match(file, /^[A-Za-z0-9._-]+$/);
    await access(new URL(file, root));
  }
});

test("worker package inclui verificadores, pairing, prova, launchers e instaladores dos tres sistemas", async () => {
  const value = await manifest();
  assert.equal(value.launchers.windows, "start.ps1");
  assert.equal(value.launchers.linux, "start.sh");
  assert.equal(value.launchers.macos, "start.sh");
  assert.equal(value.installers.windows, "install.ps1");
  assert.equal(value.installers.linux, "install.sh");
  assert.equal(value.installers.macos, "install.sh");
  assert.equal(value.pairing, "pair.mjs");
  assert.equal(value.proof.probe, "prove.mjs");
  assert.equal(value.proof.windows, "prove.ps1");
  assert.equal(value.proof.linux, "prove.sh");
  assert.equal(value.proof.macos, "prove.sh");
  for (const file of ["verify.mjs", "worker-manifest.json", "install.ps1", "install.sh", "pair.mjs", "prove.mjs", "prove.ps1", "prove.sh"]) {
    assert.ok(value.files.includes(file));
  }
});

test("instaladores nao persistem token e bloqueiam autostart inseguro", async () => {
  const [powershell, shell] = await Promise.all([
    readFile(new URL("install.ps1", root), "utf8"),
    readFile(new URL("install.sh", root), "utf8"),
  ]);
  assert.match(powershell, /NEXUS_AUTOSTART_BLOCKED/);
  assert.match(shell, /NEXUS_AUTOSTART_BLOCKED/);
  assert.doesNotMatch(powershell, /SetEnvironmentVariable\([^\n]*NEXUS_WORKER_TOKEN/);
  assert.doesNotMatch(shell, />[^\n]*token/i);
  assert.match(powershell, /gateway\.url/);
  assert.match(shell, /gateway\.url/);
});
