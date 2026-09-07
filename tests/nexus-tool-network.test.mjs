import assert from "node:assert/strict";
import test from "node:test";
import {
  NEXUS_DEFAULT_RUNTIME,
  NEXUS_TOOL_CATALOG,
  findToolsByCapability,
  planNexusExecution,
  resolveNexusCapability,
} from "../lib/nexus-tool-network.ts";

test("catálogo nasce com manifests únicos e capabilities explícitas", () => {
  assert.ok(NEXUS_TOOL_CATALOG.length >= 10);
  assert.equal(new Set(NEXUS_TOOL_CATALOG.map((tool) => tool.id)).size, NEXUS_TOOL_CATALOG.length);
  for (const tool of NEXUS_TOOL_CATALOG) {
    assert.ok(tool.version.length > 0);
    assert.ok(tool.category.length > 0);
    assert.ok(tool.capabilities.length > 0);
    assert.ok(tool.license.length > 0);
    assert.equal(typeof tool.sandboxRequired, "boolean");
  }
});

test("capability router encontra FFmpeg sem acoplar consumidor ao nome", () => {
  const tools = findToolsByCapability("video.encode");
  assert.ok(tools.some((tool) => tool.id === "ffmpeg"));
});

test("capability nativa gera plano executável em zero cost mode", () => {
  const plan = planNexusExecution("data.json.validate", NEXUS_DEFAULT_RUNTIME);
  assert.equal(plan.status, "ready");
  assert.equal(plan.toolId, "nexus-json");
  assert.equal(plan.zeroCostMode, true);
  assert.equal(plan.requiresWorker, false);
  assert.equal(plan.requiresApproval, false);
  assert.ok(plan.stages.includes("verify"));
  assert.ok(plan.stages.includes("store_artifact"));
});

test("ferramenta pesada não finge execução sem worker", () => {
  const plan = planNexusExecution("video.encode", NEXUS_DEFAULT_RUNTIME);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.toolId, "ffmpeg");
  assert.equal(plan.requiresWorker, true);
  assert.equal(plan.blockedReason, "worker_or_installation_required");
  assert.ok(plan.stages.includes("queue_job"));
});

test("browser automation é classificada como alto risco e exige aprovação", () => {
  const runtime = [{ toolId: "playwright", availability: "installed", healthy: true }];
  const plan = planNexusExecution("browser.navigate", runtime);
  assert.equal(plan.status, "ready");
  assert.equal(plan.toolId, "playwright");
  assert.equal(plan.requiresApproval, true);
  assert.equal(plan.sandboxRequired, true);
});

test("runtime offline nunca é tratado como executável", () => {
  const resolution = resolveNexusCapability("ai.chat", [{ toolId: "ollama", availability: "offline", healthy: false }]);
  assert.equal(resolution.tool?.id, "ollama");
  assert.equal(resolution.executable, false);
  assert.equal(resolution.blockedReason, "worker_or_installation_required");
});

test("capability inexistente falha fechada", () => {
  const plan = planNexusExecution("quantum.teleport", NEXUS_DEFAULT_RUNTIME);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.toolId, null);
  assert.equal(plan.blockedReason, "capability_unavailable");
});
