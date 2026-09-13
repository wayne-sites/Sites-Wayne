export const NEXUS_PROJECT_TYPES = [
  "website",
  "app",
  "software",
  "ai",
  "agent",
  "automation",
  "image",
  "video",
  "audio",
  "presentation",
  "document",
  "spreadsheet",
  "game",
  "database",
  "api",
  "business",
  "other",
] as const;

export const NEXUS_ARTIFACT_KINDS = [
  "code",
  "document",
  "image",
  "video",
  "audio",
  "dataset",
  "workflow",
  "agent",
  "design",
  "config",
  "other",
] as const;

export type NexusProjectType = (typeof NEXUS_PROJECT_TYPES)[number];
export type NexusArtifactKind = (typeof NEXUS_ARTIFACT_KINDS)[number];

export type NexusArtifactInput = {
  kind: NexusArtifactKind;
  name: string;
  path: string;
  mime_type: string | null;
  content_text: string | null;
  content_json: unknown | null;
  metadata: Record<string, unknown>;
};

export type NexusProjectCreateInput = {
  name: string;
  description: string | null;
  project_type: NexusProjectType;
  stack: string[];
  metadata: Record<string, unknown>;
  artifacts: NexusArtifactInput[];
};

export interface NexusTool {
  id: string;
  name: string;
  category: string;
  description: string;
  permissions: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export const NEXUS_TOOL_REGISTRY: NexusTool[] = [
  { id: "site-builder", name: "Site Builder", category: "development", description: "Gera projetos web estruturados e auditáveis.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "ai-builder", name: "AI Builder", category: "ai", description: "Orquestra recursos de IA para projetos Nexus.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "automation-builder", name: "Automation Builder", category: "automation", description: "Modela automações em trigger, conditions, actions e output.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "agent-builder", name: "Agent Builder", category: "agents", description: "Define agentes com objetivo, ferramentas, memória e permissões.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "document-creator", name: "Document Creator", category: "documents", description: "Cria artefatos documentais persistentes.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "image-studio", name: "Image Studio", category: "images", description: "Cria e edita artefatos visuais.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "spreadsheet-builder", name: "Spreadsheet Builder", category: "spreadsheets", description: "Cria planilhas, modelos e análises tabulares.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "presentation-builder", name: "Presentation Builder", category: "presentations", description: "Cria apresentações e narrativas estruturadas.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "research-engine", name: "Research Engine", category: "research", description: "Organiza pesquisa com fontes, evidências e síntese.", permissions: ["project:read", "artifact:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
  { id: "deployment-engine", name: "Deployment Engine", category: "deployment", description: "Coordena build, testes, preview, aprovação e deploy.", permissions: ["project:read", "deployment:write"], inputSchema: { type: "object" }, outputSchema: { type: "object" } },
];

const PROJECT_TOOL_MAP: Partial<Record<NexusProjectType, string[]>> = {
  website: ["site-builder", "deployment-engine"],
  app: ["ai-builder", "deployment-engine"],
  software: ["ai-builder", "deployment-engine"],
  ai: ["ai-builder"],
  agent: ["agent-builder", "ai-builder"],
  automation: ["automation-builder"],
  image: ["image-studio"],
  document: ["document-creator"],
  spreadsheet: ["spreadsheet-builder"],
  presentation: ["presentation-builder"],
  business: ["research-engine", "document-creator"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length < min || cleaned.length > max) return null;
  return cleaned;
}

function cleanOptionalText(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  return cleanText(value, 1, max);
}

function jsonWithinLimit(value: unknown, maxBytes: number) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= maxBytes;
  } catch {
    return false;
  }
}

function cleanArtifactPath(value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.length > 300 || path.startsWith("/") || path.includes("../") || path === ".." || path.includes("\u0000")) return null;
  return path;
}

function parseArtifact(value: unknown): NexusArtifactInput | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.kind !== "string" || !(NEXUS_ARTIFACT_KINDS as readonly string[]).includes(value.kind)) return null;
  const name = cleanText(value.name, 1, 180);
  const path = cleanArtifactPath(value.path);
  const mimeType = cleanOptionalText(value.mime_type, 160);
  if (!name || !path || (value.mime_type && !mimeType)) return null;

  let contentText: string | null = null;
  if (value.content_text !== undefined && value.content_text !== null) {
    if (typeof value.content_text !== "string" || Buffer.byteLength(value.content_text, "utf8") > 500_000) return null;
    contentText = value.content_text;
  }

  const contentJson = value.content_json === undefined ? null : value.content_json;
  if (contentJson !== null && !jsonWithinLimit(contentJson, 500_000)) return null;

  const metadata = value.metadata === undefined ? {} : value.metadata;
  if (!isPlainObject(metadata) || !jsonWithinLimit(metadata, 20_000)) return null;

  return {
    kind: value.kind as NexusArtifactKind,
    name,
    path,
    mime_type: mimeType,
    content_text: contentText,
    content_json: contentJson,
    metadata,
  };
}

export function inferNexusProjectType(brief: string): NexusProjectType {
  const value = brief.toLocaleLowerCase("pt-BR");
  const rules: Array<[NexusProjectType, RegExp]> = [
    ["website", /\b(site|website|landing page|portal|blog|loja|marketplace|pwa)\b/],
    ["app", /\b(app|aplicativo|android|ios|mobile)\b/],
    ["automation", /\b(automa(?:ção|cao)|workflow|zapier|n8n|make)\b/],
    ["agent", /\b(agente|multi-agent|multiagente)\b/],
    ["ai", /\b(ia|inteligência artificial|inteligencia artificial|rag|chatbot|copiloto)\b/],
    ["image", /\b(imagem|logo|banner|thumbnail|mockup|design gráfico|design grafico)\b/],
    ["video", /\b(vídeo|video|reel|short|trailer)\b/],
    ["audio", /\b(áudio|audio|podcast|narração|narracao|tts)\b/],
    ["presentation", /\b(apresentação|apresentacao|slides|pptx)\b/],
    ["spreadsheet", /\b(planilha|xlsx|excel|csv)\b/],
    ["document", /\b(documento|pdf|docx|ebook|relatório|relatorio)\b/],
    ["game", /\b(jogo|game|unity|godot|unreal)\b/],
    ["database", /\b(banco de dados|database|postgres|supabase|mysql|sqlite)\b/],
    ["api", /\b(api|graphql|webhook|websocket)\b/],
    ["business", /\b(negócio|negocio|empresa|monetização|monetizacao|vendas)\b/],
    ["software", /\b(software|desktop|programa|sistema)\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || "other";
}

export function selectNexusTools(projectType: NexusProjectType) {
  const ids = new Set(PROJECT_TOOL_MAP[projectType] || []);
  return NEXUS_TOOL_REGISTRY.filter((tool) => ids.has(tool.id));
}

export function parseNexusProjectInput(value: unknown): { ok: true; data: NexusProjectCreateInput } | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: "Projeto inválido." };

  const name = cleanText(value.name, 2, 160);
  const description = cleanOptionalText(value.description, 5000);
  if (!name || (value.description && !description)) return { ok: false, error: "Nome ou descrição inválidos." };

  const inferred = typeof value.project_type === "string" ? value.project_type : inferNexusProjectType(description || name);
  if (!(NEXUS_PROJECT_TYPES as readonly string[]).includes(inferred)) return { ok: false, error: "Tipo de projeto inválido." };

  const rawStack = value.stack === undefined ? [] : value.stack;
  if (!Array.isArray(rawStack) || rawStack.length > 32) return { ok: false, error: "Stack inválida." };
  const stack: string[] = [];
  for (const item of rawStack) {
    const cleaned = cleanText(item, 1, 80);
    if (!cleaned) return { ok: false, error: "Stack inválida." };
    stack.push(cleaned);
  }

  const metadata = value.metadata === undefined ? {} : value.metadata;
  if (!isPlainObject(metadata) || !jsonWithinLimit(metadata, 20_000)) return { ok: false, error: "Metadados inválidos." };

  const rawArtifacts = value.artifacts === undefined ? [] : value.artifacts;
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length > 64) return { ok: false, error: "Artefatos inválidos." };
  const artifacts: NexusArtifactInput[] = [];
  for (const item of rawArtifacts) {
    const artifact = parseArtifact(item);
    if (!artifact) return { ok: false, error: "Artefato inválido." };
    artifacts.push(artifact);
  }

  return {
    ok: true,
    data: {
      name,
      description,
      project_type: inferred as NexusProjectType,
      stack,
      metadata,
      artifacts,
    },
  };
}
