import assert from "node:assert/strict";
import test from "node:test";
import { rankNexusToolCandidates, resolveNexusCapabilityV2 } from "../lib/nexus-capability-router.ts";
import { NEXUS_DEFAULT_RUNTIME } from "../lib/nexus-tool-network.ts";

function tool(id, riskLevel, pricingModel = "open-source") {
  return {
    id,
    name: id,
    version: "1",
    category: ["test"],
    description: "test provider",
    license: "test",
    pricingModel,
    execution: "worker",
    capabilities: ["test.capability"],
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    permissions: [],
    sandboxRequired: true,
    riskLevel,
  };
}

test("ranking de risco é semântico: low antes de medium, high e critical", () => {
  const runtime = [
    { toolId: "critical", availability: "available", healthy: true },
    { toolId: "high", availability: "available", healthy: true },
    { toolId: "medium", availability: "available", healthy: true },
    { toolId: "low", availability: "available", healthy: true },
  ];
  const ranked = rankNexusToolCandidates(
    [tool("critical", "critical"), tool("high", "high"), tool("medium", "medium"), tool("low", "low")],
    runtime,
  );
  assert.deepEqual(ranked.map((item) => item.id), ["low", "medium", "high", "critical"]);
});

test("provider instalado saudável vence adapter apenas disponível", () => {
  const runtime = [
    { toolId: "installed", availability: "installed", healthy: true },
    { toolId: "available", availability: "available", healthy: true },
  ];
  const ranked = rankNexusToolCandidates([tool("available", "low"), tool("installed", "medium")], runtime);
  assert.equal(ranked[0].id, "installed");
});

test("router V2 mantém JSON nativo executável no modo zero cost", () => {
  const resolved = resolveNexusCapabilityV2("data.json.validate", NEXUS_DEFAULT_RUNTIME);
  assert.equal(resolved.executable, true);
  assert.equal(resolved.tool?.id, "nexus-json");
  assert.equal(resolved.zeroCostMode, true);
});
