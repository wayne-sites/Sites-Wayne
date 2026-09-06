import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILDER_CAPABILITIES,
  BUILDER_CAPABILITY_CATEGORIES,
  RECOMMENDED_BUILDER_CAPABILITY_IDS,
  buildBuilderCapabilityPrompt,
  normalizeBuilderCapabilities,
} from "../lib/builder/capabilities.ts";

test("Builder V2 expõe exatamente 100 módulos únicos", () => {
  assert.equal(BUILDER_CAPABILITIES.length, 100);
  assert.equal(new Set(BUILDER_CAPABILITIES.map((item) => item.id)).size, 100);
});

test("Builder V2 mantém dez categorias com dez módulos cada", () => {
  assert.equal(BUILDER_CAPABILITY_CATEGORIES.length, 10);
  for (const category of BUILDER_CAPABILITY_CATEGORIES) {
    assert.equal(BUILDER_CAPABILITIES.filter((item) => item.category === category).length, 10, category);
  }
});

test("normalização remove IDs desconhecidos e duplicados", () => {
  const normalized = normalizeBuilderCapabilities([
    "semantic-html",
    "semantic-html",
    "nao-existe",
    "no-secrets",
  ]);
  assert.deepEqual(normalized, ["semantic-html", "no-secrets"]);
});

test("ausência de seleção usa conjunto recomendado", () => {
  const normalized = normalizeBuilderCapabilities(undefined);
  assert.deepEqual(normalized, RECOMMENDED_BUILDER_CAPABILITY_IDS);
  assert.ok(normalized.length >= 50);
});

test("todos os módulos podem ser ativados de uma vez", () => {
  const ids = BUILDER_CAPABILITIES.map((item) => item.id);
  const normalized = normalizeBuilderCapabilities(ids);
  assert.equal(normalized.length, 100);
  const prompt = buildBuilderCapabilityPrompt(normalized);
  assert.match(prompt, /\[Segurança\]/);
  assert.match(prompt, /Nunca inclua chaves, tokens/i);
  assert.match(prompt, /\[Acessibilidade\]/);
  assert.match(prompt, /\[Qualidade\]/);
});
