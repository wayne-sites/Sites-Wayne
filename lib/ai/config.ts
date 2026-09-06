const allowedTools = new Set([
  "Assistente de texto",
  "Resumidor",
  "Plano de negócio",
  "Descrição de produto",
  "Organizador de estudos",
  "Criador de publicações",
]);

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const DEFAULT_OLLAMA_MODEL = "jarvis-local";

export type AIProviderName = "groq" | "ollama" | "custom";

export type AIProviderConfig = {
  name: AIProviderName;
  apiUrl: string;
  apiKey?: string;
  model: string;
};

export function normalizeAITool(value: unknown) {
  const tool = typeof value === "string" ? value.slice(0, 80) : "Assistente de texto";
  return allowedTools.has(tool) ? tool : "Assistente de texto";
}

function parseProviderUrl(raw: string, allowLoopback: boolean) {
  const parsed = new URL(raw);
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol === "https:") return parsed;
  if (allowLoopback && loopback && parsed.protocol === "http:") return parsed;
  throw new Error("ai_provider_url_must_use_https");
}

function resolveGroqKey() {
  const direct = process.env.GROQ_API_KEY?.trim();
  if (direct) return direct;

  const clientKey = process.env.CLIENT_KEY?.trim();
  if (clientKey?.startsWith("gsk_")) return clientKey;

  return undefined;
}

export function getAIProviderConfig(): AIProviderConfig | null {
  const requested = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const groqKey = resolveGroqKey();
  const legacyKey = process.env.AI_API_KEY?.trim();

  const useGroq = requested === "groq" || (!requested && Boolean(groqKey));
  if (useGroq) {
    const apiKey = groqKey || legacyKey;
    if (!apiKey) return null;
    const apiUrl = process.env.GROQ_API_URL?.trim() || process.env.AI_API_URL?.trim() || GROQ_CHAT_COMPLETIONS_URL;
    const parsed = parseProviderUrl(apiUrl, false);
    if (parsed.hostname !== "api.groq.com") throw new Error("groq_provider_host_invalid");
    return {
      name: "groq",
      apiUrl: parsed.toString(),
      apiKey,
      model: process.env.GROQ_MODEL?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    };
  }

  if (requested === "ollama") {
    if (process.env.NODE_ENV === "production") throw new Error("ollama_not_allowed_in_production");
    const apiUrl = process.env.OLLAMA_OPENAI_URL?.trim() || "http://127.0.0.1:11434/v1/chat/completions";
    const parsed = new URL(apiUrl);
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    if (!loopback) throw new Error("ollama_must_use_loopback");
    return {
      name: "ollama",
      apiUrl: parsed.toString(),
      model: process.env.OLLAMA_MODEL?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    };
  }

  if (requested && requested !== "custom") throw new Error("unsupported_ai_provider");

  const apiUrl = process.env.AI_API_URL?.trim();
  if (!apiUrl || !legacyKey) return null;
  const parsed = parseProviderUrl(apiUrl, process.env.NODE_ENV !== "production");
  return {
    name: "custom",
    apiUrl: parsed.toString(),
    apiKey: legacyKey,
    model: process.env.AI_MODEL?.trim() || "",
  };
}
