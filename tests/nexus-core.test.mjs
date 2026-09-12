import assert from "node:assert/strict";
import test from "node:test";
import {
  NEXUS_TOOL_REGISTRY,
  inferNexusProjectType,
  parseNexusProjectInput,
  selectNexusTools,
} from "../lib/nexus-core.ts";

test("intent router classifica tipos comuns sem depender de um único motor", () => {
  assert.equal(inferNexusProjectType("Crie um site institucional para uma clínica"), "website");
  assert.equal(inferNexusProjectType("Monte uma automação com webhook e n8n"), "automation");
  assert.equal(inferNexusProjectType("Gere uma apresentação executiva em PPTX"), "presentation");
  assert.equal(inferNexusProjectType("Quero um sistema desktop para estoque"), "software");
});

test("project primitive aceita projeto universal com artefatos persistentes", () => {
  const result = parseNexusProjectInput({
    name: "Portal Restaurante",
    description: "Crie um site para restaurantes aceitarem pedidos online.",
    stack: ["Next.js", "Supabase"],
    metadata: { source: "test", creation_mode: "SIMPLE" },
    artifacts: [
      {
        kind: "code",
        name: "Página inicial",
        path: "app/page.tsx",
        mime_type: "text/typescript",
        content_text: "export default function Page(){return null}",
      },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.project_type, "website");
    assert.equal(result.data.artifacts.length, 1);
    assert.equal(result.data.artifacts[0].path, "app/page.tsx");
  }
});

test("artifact primitive recusa path traversal e payload excessivo", () => {
  const base = {
    name: "Projeto seguro",
    project_type: "software",
  };
  assert.equal(parseNexusProjectInput({
    ...base,
    artifacts: [{ kind: "code", name: "segredo", path: "../secret.txt", content_text: "x" }],
  }).ok, false);
  assert.equal(parseNexusProjectInput({
    ...base,
    artifacts: [{ kind: "code", name: "grande", path: "large.txt", content_text: "x".repeat(500_001) }],
  }).ok, false);
});

test("project primitive recusa tipo, stack e metadata fora do contrato", () => {
  assert.equal(parseNexusProjectInput({ name: "Projeto X", project_type: "teleport" }).ok, false);
  assert.equal(parseNexusProjectInput({ name: "Projeto X", stack: ["x".repeat(81)] }).ok, false);
  assert.equal(parseNexusProjectInput({ name: "Projeto X", metadata: [] }).ok, false);
});

test("tool registry tem ids únicos, permissões explícitas e seleção por tipo", () => {
  const ids = NEXUS_TOOL_REGISTRY.map((tool) => tool.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(NEXUS_TOOL_REGISTRY.every((tool) => tool.permissions.length > 0), true);
  const websiteTools = selectNexusTools("website").map((tool) => tool.id);
  assert.deepEqual(websiteTools, ["site-builder", "deployment-engine"]);
  assert.equal(selectNexusTools("automation")[0]?.id, "automation-builder");
});
