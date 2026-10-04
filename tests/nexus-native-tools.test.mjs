import assert from "node:assert/strict";
import test from "node:test";
import { executeNexusNativeCapability } from "../lib/nexus-native-tools.ts";

test("JSON validate aceita JSON válido sem executar código", () => {
  const result = executeNexusNativeCapability("data.json.validate", { text: '{"ok":true}' });
  assert.equal(result.toolId, "nexus-json");
  assert.equal(result.output.valid, true);
  assert.equal(result.output.rootType, "object");
});

test("JSON validate retorna diagnóstico para JSON inválido", () => {
  const result = executeNexusNativeCapability("data.json.validate", { text: "{x}" });
  assert.equal(result.output.valid, false);
  assert.equal(typeof result.output.error, "string");
});

test("JSON format aplica indentação controlada", () => {
  const result = executeNexusNativeCapability("data.json.format", { text: '{"a":1}', spaces: 4 });
  assert.equal(result.output.spaces, 4);
  assert.equal(result.output.text, '{\n    "a": 1\n}');
});

test("Markdown normalize remove trailing whitespace e normaliza CRLF", () => {
  const result = executeNexusNativeCapability("document.markdown.normalize", { text: "# Título  \r\n\r\nTexto   \r\n" });
  assert.equal(result.output.text, "# Título\n\nTexto");
});

test("Markdown inspect conta headings, links e blocos de código", () => {
  const text = "# Título\n\n[Link](https://example.com)\n\n```js\nconst x = 1\n```";
  const result = executeNexusNativeCapability("document.markdown.inspect", { text });
  assert.equal(result.output.headingCount, 1);
  assert.equal(result.output.links, 1);
  assert.equal(result.output.fencedCodeBlocks, 1);
});

test("capability nativa desconhecida é bloqueada", () => {
  assert.throws(() => executeNexusNativeCapability("runtime.shell.execute", {}), /native_capability_unsupported/);
});

test("payload textual excessivo é recusado", () => {
  assert.throws(() => executeNexusNativeCapability("data.json.validate", { text: "x".repeat(250001) }), /native_text_invalid/);
});
