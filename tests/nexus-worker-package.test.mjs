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
});

test("worker package declara apenas arquivos locais e todos existem", async () => {
  const value = await manifest();
  assert.equal(new Set(value.files).size, value.files.length);
  for (const file of value.files) {
    assert.match(file, /^[A-Za-z0-9._-]+$/);
    await access(new URL(file, root));
  }
});

test("worker package inclui verificador e launchers dos tres sistemas", async () => {
  const value = await manifest();
  assert.equal(value.launchers.windows, "start.ps1");
  assert.equal(value.launchers.linux, "start.sh");
  assert.equal(value.launchers.macos, "start.sh");
  assert.ok(value.files.includes("verify.mjs"));
  assert.ok(value.files.includes("worker-manifest.json"));
});
