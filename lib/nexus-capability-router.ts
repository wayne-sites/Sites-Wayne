import {
  NEXUS_TOOL_CATALOG,
  type NexusCapabilityResolution,
  type NexusExecutionPlan,
  type NexusPricingModel,
  type NexusRiskLevel,
  type NexusRuntimeToolState,
  type NexusToolManifest,
} from "./nexus-tool-network.ts";

const PRICING_PRIORITY: Record<NexusPricingModel, number> = {
  free: 0,
  "open-source": 1,
  "self-hosted": 2,
  "free-tier": 3,
  paid: 100,
};

const RISK_PRIORITY: Record<NexusRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function stateFor(toolId: string, runtime: NexusRuntimeToolState[]) {
  return runtime.find((item) => item.toolId === toolId) || null;
}

function runtimePriority(state: NexusRuntimeToolState | null) {
  if (!state || !state.healthy) return 50;
  if (state.availability === "native") return 0;
  if (state.availability === "installed") return 1;
  if (state.availability === "connected") return 2;
  if (state.availability === "available") return 10;
  return 50;
}

export function rankNexusToolCandidates(
  tools: NexusToolManifest[],
  runtime: NexusRuntimeToolState[],
) {
  return [...tools].sort((left, right) => {
    const runtimeDelta = runtimePriority(stateFor(left.id, runtime)) - runtimePriority(stateFor(right.id, runtime));
    if (runtimeDelta !== 0) return runtimeDelta;
    const pricingDelta = PRICING_PRIORITY[left.pricingModel] - PRICING_PRIORITY[right.pricingModel];
    if (pricingDelta !== 0) return pricingDelta;
    const riskDelta = RISK_PRIORITY[left.riskLevel] - RISK_PRIORITY[right.riskLevel];
    if (riskDelta !== 0) return riskDelta;
    return left.id.localeCompare(right.id);
  });
}

export function resolveNexusCapabilityV2(
  capability: string,
  runtime: NexusRuntimeToolState[],
  options: { zeroCostMode?: boolean; allowPaid?: boolean } = {},
): NexusCapabilityResolution {
  const normalized = capability.trim().toLowerCase();
  const zeroCostMode = options.zeroCostMode !== false;
  const matching = NEXUS_TOOL_CATALOG.filter((tool) => tool.capabilities.includes(normalized));
  const allowed = matching.filter((tool) => {
    if (zeroCostMode && tool.pricingModel === "paid") return false;
    if (tool.pricingModel === "paid" && options.allowPaid !== true) return false;
    return true;
  });
  const candidates = rankNexusToolCandidates(allowed, runtime);
  const tool = candidates[0] || null;

  if (!tool) {
    const paidOnly = matching.length > 0 && matching.every((item) => item.pricingModel === "paid");
    return {
      capability: normalized,
      tool: null,
      candidates: [],
      executable: false,
      blockedReason: paidOnly && zeroCostMode ? "zero_cost_mode" : "capability_unavailable",
      zeroCostMode,
    };
  }

  const state = stateFor(tool.id, runtime);
  const executable = Boolean(state?.healthy && ["native", "installed", "connected"].includes(state.availability));
  let blockedReason: string | null = null;
  if (!executable) {
    if (state?.availability === "blocked") blockedReason = "tool_blocked";
    else if (state && !state.healthy) blockedReason = "tool_unhealthy";
    else if (["worker", "cli", "python", "docker", "node"].includes(tool.execution)) blockedReason = "worker_or_installation_required";
    else if (["http", "mcp", "browser"].includes(tool.execution)) blockedReason = "connector_required";
    else blockedReason = "tool_not_available";
  }

  return { capability: normalized, tool, candidates, executable, blockedReason, zeroCostMode };
}

export function planNexusExecutionV2(
  capability: string,
  runtime: NexusRuntimeToolState[],
  options: { zeroCostMode?: boolean; allowPaid?: boolean } = {},
): NexusExecutionPlan {
  const resolution = resolveNexusCapabilityV2(capability, runtime, options);
  const tool = resolution.tool;
  const requiresWorker = Boolean(tool && ["worker", "cli", "python", "docker", "node"].includes(tool.execution));
  const requiresConnection = Boolean(tool && ["http", "mcp", "browser"].includes(tool.execution));
  const requiresApproval = Boolean(tool && (tool.riskLevel === "high" || tool.riskLevel === "critical" || tool.pricingModel === "paid"));

  return {
    capability: resolution.capability,
    status: resolution.executable ? "ready" : "blocked",
    toolId: tool?.id || null,
    toolName: tool?.name || null,
    execution: tool?.execution || null,
    sandboxRequired: Boolean(tool?.sandboxRequired),
    riskLevel: tool?.riskLevel || null,
    zeroCostMode: resolution.zeroCostMode,
    requiresWorker,
    requiresConnection,
    requiresApproval,
    blockedReason: resolution.blockedReason,
    stages: [
      "validate",
      "resolve_capability",
      "select_tool",
      "check_permission",
      "check_cost",
      "check_environment",
      ...(requiresWorker ? (["queue_job"] as const) : []),
      "execute",
      "verify",
      "store_artifact",
      "log",
    ],
  };
}
