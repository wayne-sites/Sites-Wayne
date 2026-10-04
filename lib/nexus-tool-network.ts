export const NEXUS_PRICING_MODELS = ["free", "open-source", "self-hosted", "free-tier", "paid"] as const;
export const NEXUS_EXECUTION_TYPES = ["native", "cli", "node", "python", "docker", "http", "mcp", "worker", "browser"] as const;
export const NEXUS_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

export type NexusPricingModel = (typeof NEXUS_PRICING_MODELS)[number];
export type NexusExecutionType = (typeof NEXUS_EXECUTION_TYPES)[number];
export type NexusRiskLevel = (typeof NEXUS_RISK_LEVELS)[number];

export interface NexusToolManifest {
  id: string;
  name: string;
  version: string;
  category: string[];
  description: string;
  homepage?: string;
  repository?: string;
  license: string;
  pricingModel: NexusPricingModel;
  execution: NexusExecutionType;
  capabilities: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissions: string[];
  requirements?: {
    cpu?: string;
    ram?: string;
    gpu?: string;
    disk?: string;
    os?: string[];
  };
  sandboxRequired: boolean;
  riskLevel: NexusRiskLevel;
}

export type NexusToolAvailability = "native" | "connected" | "installed" | "available" | "offline" | "blocked";

export type NexusRuntimeToolState = {
  toolId: string;
  availability: NexusToolAvailability;
  healthy: boolean;
};

export type NexusCapabilityResolution = {
  capability: string;
  tool: NexusToolManifest | null;
  candidates: NexusToolManifest[];
  executable: boolean;
  blockedReason: string | null;
  zeroCostMode: boolean;
};

export type NexusExecutionPlan = {
  capability: string;
  status: "ready" | "blocked";
  toolId: string | null;
  toolName: string | null;
  execution: NexusExecutionType | null;
  sandboxRequired: boolean;
  riskLevel: NexusRiskLevel | null;
  zeroCostMode: boolean;
  requiresWorker: boolean;
  requiresConnection: boolean;
  requiresApproval: boolean;
  blockedReason: string | null;
  stages: Array<
    | "validate"
    | "resolve_capability"
    | "select_tool"
    | "check_permission"
    | "check_cost"
    | "check_environment"
    | "queue_job"
    | "execute"
    | "verify"
    | "store_artifact"
    | "log"
  >;
};

const objectSchema = { type: "object" } as const;

export const NEXUS_TOOL_CATALOG: NexusToolManifest[] = [
  {
    id: "nexus-json",
    name: "Nexus JSON",
    version: "1.0.0",
    category: ["data", "development"],
    description: "Validação, formatação e transformação JSON executadas nativamente pelo Nexus.",
    license: "Nexus native",
    pricingModel: "free",
    execution: "native",
    capabilities: ["data.json.validate", "data.json.format"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: [],
    sandboxRequired: false,
    riskLevel: "low",
  },
  {
    id: "nexus-markdown",
    name: "Nexus Markdown",
    version: "1.0.0",
    category: ["documents", "development"],
    description: "Processamento textual e Markdown de baixo custo no runtime Nexus.",
    license: "Nexus native",
    pricingModel: "free",
    execution: "native",
    capabilities: ["document.markdown.normalize", "document.markdown.inspect"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: [],
    sandboxRequired: false,
    riskLevel: "low",
  },
  {
    id: "ffmpeg",
    name: "FFmpeg",
    version: "external",
    category: ["video", "audio", "media"],
    description: "Seed de adapter para codificação e transformação de mídia em Nexus Worker.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["video.encode", "video.cut", "video.subtitle", "audio.convert", "media.probe"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["artifact:read", "artifact:write", "process:spawn"],
    requirements: { cpu: "recommended", os: ["windows", "linux", "macos"] },
    sandboxRequired: true,
    riskLevel: "medium",
  },
  {
    id: "imagemagick",
    name: "ImageMagick",
    version: "external",
    category: ["images"],
    description: "Seed de adapter para conversão e processamento de imagens em worker.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["image.convert", "image.resize", "image.compose"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["artifact:read", "artifact:write", "process:spawn"],
    sandboxRequired: true,
    riskLevel: "medium",
  },
  {
    id: "pandoc",
    name: "Pandoc",
    version: "external",
    category: ["documents"],
    description: "Seed de adapter para conversão entre formatos documentais.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["document.convert", "document.export"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["artifact:read", "artifact:write", "process:spawn"],
    sandboxRequired: true,
    riskLevel: "medium",
  },
  {
    id: "tesseract",
    name: "Tesseract",
    version: "external",
    category: ["ocr", "documents", "images"],
    description: "Seed de adapter para OCR local em workers compatíveis.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["ocr.extract_text"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["artifact:read", "artifact:write", "process:spawn"],
    sandboxRequired: true,
    riskLevel: "medium",
  },
  {
    id: "playwright",
    name: "Playwright",
    version: "external",
    category: ["browser", "testing", "automation"],
    description: "Seed de adapter para browser automation controlada por permissões.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["browser.navigate", "browser.screenshot", "browser.test"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["browser:navigate", "network:outbound", "artifact:write"],
    requirements: { cpu: "recommended", ram: "2GB+", os: ["windows", "linux", "macos"] },
    sandboxRequired: true,
    riskLevel: "high",
  },
  {
    id: "ollama",
    name: "Ollama",
    version: "external",
    category: ["ai", "llm"],
    description: "Provider local para modelos de linguagem e IA via Nexus Worker.",
    license: "unverified-at-runtime",
    pricingModel: "self-hosted",
    execution: "worker",
    capabilities: ["ai.chat", "ai.generate_text", "ai.local_model"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["network:local", "model:read"],
    requirements: { cpu: "supported", gpu: "optional", os: ["windows", "linux", "macos"] },
    sandboxRequired: true,
    riskLevel: "medium",
  },
  {
    id: "blender",
    name: "Blender",
    version: "external",
    category: ["3d", "design"],
    description: "Seed de adapter para geração e renderização 3D em worker.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["3d.render", "3d.convert", "3d.scene.execute"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["artifact:read", "artifact:write", "process:spawn"],
    requirements: { cpu: "high", gpu: "recommended" },
    sandboxRequired: true,
    riskLevel: "high",
  },
  {
    id: "libreoffice",
    name: "LibreOffice",
    version: "external",
    category: ["documents", "spreadsheets", "presentations"],
    description: "Seed de adapter para conversões documentais em worker.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["document.office.convert", "spreadsheet.convert", "presentation.convert"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["artifact:read", "artifact:write", "process:spawn"],
    sandboxRequired: true,
    riskLevel: "medium",
  },
  {
    id: "sqlite",
    name: "SQLite",
    version: "external",
    category: ["database"],
    description: "Seed de adapter para bancos SQLite locais e temporários.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["database.sqlite.query", "database.sqlite.export"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["artifact:read", "artifact:write", "filesystem:scoped"],
    sandboxRequired: true,
    riskLevel: "medium",
  },
  {
    id: "git",
    name: "Git",
    version: "external",
    category: ["development", "git"],
    description: "Seed de adapter para operações Git controladas em workspace isolado.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["git.status", "git.diff", "git.commit"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["filesystem:workspace", "process:spawn"],
    sandboxRequired: true,
    riskLevel: "high",
  },
  {
    id: "python",
    name: "Python Runtime",
    version: "external",
    category: ["development", "data", "ai"],
    description: "Runtime compartilhado para adapters Python em workers autorizados.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["runtime.python.execute"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["process:spawn", "filesystem:sandbox"],
    sandboxRequired: true,
    riskLevel: "critical",
  },
  {
    id: "nodejs",
    name: "Node.js Runtime",
    version: "external",
    category: ["development"],
    description: "Runtime compartilhado para adapters Node.js em workers autorizados.",
    license: "unverified-at-runtime",
    pricingModel: "open-source",
    execution: "worker",
    capabilities: ["runtime.node.execute"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["process:spawn", "filesystem:sandbox"],
    sandboxRequired: true,
    riskLevel: "critical",
  },
  {
    id: "docker",
    name: "Docker",
    version: "external",
    category: ["containers", "devops"],
    description: "Runtime opcional para adapters isolados em hosts autorizados.",
    license: "unverified-at-runtime",
    pricingModel: "self-hosted",
    execution: "worker",
    capabilities: ["container.run", "container.inspect"],
    inputSchema: objectSchema,
    outputSchema: objectSchema,
    permissions: ["container:run", "filesystem:sandbox", "network:controlled"],
    sandboxRequired: true,
    riskLevel: "critical",
  },
];

const PRICING_PRIORITY: Record<NexusPricingModel, number> = {
  free: 0,
  "open-source": 1,
  "self-hosted": 2,
  "free-tier": 3,
  paid: 100,
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

export function findToolsByCapability(capability: string) {
  const normalized = capability.trim().toLowerCase();
  return NEXUS_TOOL_CATALOG.filter((tool) => tool.capabilities.includes(normalized));
}

export function resolveNexusCapability(
  capability: string,
  runtime: NexusRuntimeToolState[],
  options: { zeroCostMode?: boolean; allowPaid?: boolean } = {},
): NexusCapabilityResolution {
  const normalized = capability.trim().toLowerCase();
  const zeroCostMode = options.zeroCostMode !== false;
  const candidates = findToolsByCapability(normalized)
    .filter((tool) => !zeroCostMode || tool.pricingModel !== "paid")
    .filter((tool) => options.allowPaid === true || tool.pricingModel !== "paid")
    .sort((left, right) => {
      const runtimeDelta = runtimePriority(stateFor(left.id, runtime)) - runtimePriority(stateFor(right.id, runtime));
      if (runtimeDelta !== 0) return runtimeDelta;
      const pricingDelta = PRICING_PRIORITY[left.pricingModel] - PRICING_PRIORITY[right.pricingModel];
      if (pricingDelta !== 0) return pricingDelta;
      return left.riskLevel.localeCompare(right.riskLevel);
    });

  const tool = candidates[0] || null;
  if (!tool) {
    return { capability: normalized, tool: null, candidates: [], executable: false, blockedReason: "capability_unavailable", zeroCostMode };
  }

  const state = stateFor(tool.id, runtime);
  const executable = Boolean(state?.healthy && ["native", "installed", "connected"].includes(state.availability));
  const blockedReason = executable
    ? null
    : tool.execution === "worker"
      ? "worker_or_installation_required"
      : tool.execution === "http" || tool.execution === "mcp" || tool.execution === "browser"
        ? "connector_required"
        : "tool_not_available";

  return { capability: normalized, tool, candidates, executable, blockedReason, zeroCostMode };
}

export function planNexusExecution(
  capability: string,
  runtime: NexusRuntimeToolState[],
  options: { zeroCostMode?: boolean; allowPaid?: boolean } = {},
): NexusExecutionPlan {
  const resolution = resolveNexusCapability(capability, runtime, options);
  const tool = resolution.tool;
  const requiresWorker = tool?.execution === "worker" || tool?.execution === "cli" || tool?.execution === "python" || tool?.execution === "docker";
  const requiresConnection = tool?.execution === "http" || tool?.execution === "mcp" || tool?.execution === "browser";
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

export const NEXUS_DEFAULT_RUNTIME: NexusRuntimeToolState[] = [
  { toolId: "nexus-json", availability: "native", healthy: true },
  { toolId: "nexus-markdown", availability: "native", healthy: true },
];
