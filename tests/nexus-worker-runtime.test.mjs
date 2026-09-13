import assert from "node:assert/strict";
import test from "node:test";
import { executeWorkerCapability, WORKER_CAPABILITIES, WORKER_TOOLS } from "../workers/nexus-worker/runtime.mjs";

test("worker runtime anuncia somente ferramentas nativas low-risk", () => {
  assert.deepEqual(WORKER_TOOLS, ["nexus-json", "nexus-markdown"]);
  assert.deepEqual(WORKER_CAPABILITIES, [
    "data.json.validate",
    "data.json.format",
    "document.markdown.normalize",
    "document.markdown.inspect",
  ]);
});

test("worker runtime valida JSON sem executar código", () => {
  const result = executeWorkerCapability("data.json.validate", { text: "{\"ok\":true}" });
  assert.equal(result.valid, true);
  assert.equal(result.rootType, "object");
});

test("worker runtime formata JSON", () => {
  const result = executeWorkerCapability("data.json.format", { text: "{\"b\":2,\"a\":1}", spaces: 2 });
  assert.equal(result.spaces, 2);
  assert.match(result.text, /\n  \"b\": 2/);
});

test("worker runtime normaliza markdown", () => {
  const result = executeWorkerCapability("document.markdown.normalize", { text: "# Título  \r\n\r\n\r\n\r\nTexto   " });
  assert.equal(result.text, "# Título\n\n\nTexto");
});

test("worker runtime inspeciona markdown", () => {
  const result = executeWorkerCapability("document.markdown.inspect", { text: "# Título\n\n[link](https://example.com)\n\n```js\n1\n```" });
  assert.equal(result.headingCount, 1);
  assert.equal(result.links, 1);
  assert.equal(result.fencedCodeBlocks, 1);
});

test("worker runtime bloqueia capability não allowlisted", () => {
  assert.throws(
    () => executeWorkerCapability("shell.exec", { command: "whoami" }),
    /worker_capability_unsupported/,
  );
});
