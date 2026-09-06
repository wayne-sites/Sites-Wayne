import { NextRequest, NextResponse } from "next/server";
import { getAIProviderConfig, type AIProviderConfig } from "@/lib/ai/config";
import {
  buildBuilderCapabilityPrompt,
  normalizeBuilderCapabilities,
} from "@/lib/builder/capabilities";
import { extractBuilderHtml, extractBuilderJson, validateBuilderProject } from "@/lib/builder/manifest";
import { bodyWithinLimit, clientIp, fetchWithTimeout, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

const PROJECT_TYPES = new Map([
  ["landing", "landing page comercial"],
  ["business", "site institucional"],
  ["portfolio", "portfólio"],
  ["dashboard", "painel/dashboard local"],
  ["catalog", "catálogo de produtos ou serviços"],
  ["education", "experiência educacional"],
  ["event", "site de evento"],
  ["community", "interface de comunidade"],
]);

const VISUAL_STYLES = new Map([
  ["premium", "premium e refinado"],
  ["futuristic", "futurista e tecnológico"],
  ["minimal", "minimalista e limpo"],
  ["corporate", "corporativo e confiável"],
  ["editorial", "editorial e tipográfico"],
  ["playful", "vibrante e amigável"],
  ["luxury", "luxuoso e sofisticado"],
  ["brutalist", "brutalista controlado e legível"],
]);

const builderSystemPrompt = [
  "Você é o Nexus Builder V2, um gerador de projetos web estáticos completos.",
  "Responda SOMENTE com um objeto JSON válido, sem markdown, comentários ou texto antes/depois.",
  "O projeto deve funcionar abrindo index.html diretamente no navegador, sem build, npm, backend ou servidor.",
  "Gere no máximo 10 arquivos usando apenas HTML, CSS, JavaScript, JSON, Markdown ou TXT.",
  "Use caminhos relativos simples. Sempre inclua index.html e README.md.",
  "Priorize interface responsiva, acessibilidade, boa UX e código legível.",
  "Não inclua chaves, tokens, credenciais, .env, dados privados, trackers, mineração, pagamentos, downloads executáveis, shell, PowerShell, batch ou ações de deploy.",
  "Não invente integrações reais. Quando uma função exigiria backend/API, implemente apenas uma experiência local segura e documente a limitação no README.",
  "Schema obrigatório: {\"name\":string,\"kind\":\"static-web\",\"summary\":string,\"stack\":string[],\"features\":string[],\"howToRun\":string,\"files\":[{\"path\":string,\"content\":string}]}",
].join(" ");

const singleFileFallbackPrompt = [
  "Você é o Nexus Builder V2 em modo de recuperação.",
  "Responda SOMENTE com um documento HTML completo, começando por <!doctype html> e terminando em </html>.",
  "Não use markdown nem cercas de código.",
  "Inclua todo o CSS em <style> e todo JavaScript necessário em <script> no próprio arquivo.",
  "O resultado deve funcionar abrindo index.html diretamente no navegador, sem build, npm, backend ou servidor.",
  "Não use fetch, APIs externas, scripts externos, fontes externas, iframes, trackers, pagamentos ou formulários que enviem dados para servidores.",
  "Não inclua chaves, tokens, credenciais, dados privados, eval, mineração, downloads executáveis, shell, PowerShell, batch ou ações de deploy.",
  "Mantenha o documento abaixo de 18.000 caracteres e priorize interface responsiva, acessibilidade, boa UX e conteúdo completo.",
].join(" ");

function normalizeOption(value: unknown, options: Map<string, string>, fallback: string) {
  if (typeof value !== "string") return fallback;
  return options.has(value) ? value : fallback;
}

function generationContext(
  projectType: string,
  visualStyle: string,
  capabilityIds: string[],
) {
  const capabilityPrompt = buildBuilderCapabilityPrompt(capabilityIds);
  return [
    `Tipo de projeto: ${PROJECT_TYPES.get(projectType)}.`,
    `Direção visual: ${VISUAL_STYLES.get(visualStyle)}.`,
    capabilityPrompt ? `Módulos de qualidade ativos (${capabilityIds.length}):\n${capabilityPrompt}` : "Nenhum módulo opcional foi selecionado.",
  ].join("\n\n");
}

async function providerCompletion(
  provider: AIProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature: number,
  maxTokens = 5000,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  const response = await fetchWithTimeout(
    provider.apiUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.model,
        temperature,
        max_tokens: maxTokens,
        messages,
      }),
    },
    35_000,
  );

  if (!response.ok) {
    const error = new Error(`provider_${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    output_text?: string;
    result?: string;
  };
  const result = data.choices?.[0]?.message?.content || data.output_text || data.result;
  if (!result) throw new Error("provider_empty");
  return result;
}

function parseProject(raw: string) {
  return validateBuilderProject(extractBuilderJson(raw));
}

function buildSingleFileProject(rawHtml: string) {
  const html = extractBuilderHtml(rawHtml);
  const title = html.match(/<title[^>]*>([^<]{1,80})<\/title>/i)?.[1]?.trim() || "Projeto Nexus Builder";
  return validateBuilderProject({
    name: title,
    kind: "static-web",
    summary: "Projeto web estático gerado pelo Nexus Builder em modo de recuperação robusta.",
    stack: ["HTML", "CSS", "JavaScript"],
    features: ["Layout responsivo", "Conteúdo pronto para editar", "Execução local sem build"],
    howToRun: "Baixe os arquivos e abra index.html em um navegador moderno.",
    files: [
      { path: "index.html", content: html },
      {
        path: "README.md",
        content: [
          `# ${title}`,
          "",
          "Projeto web estático gerado pelo Nexus Builder.",
          "",
          "## Como executar",
          "Abra `index.html` em um navegador moderno. Nenhum build ou servidor é necessário.",
        ].join("\n"),
      },
    ],
  });
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada.", requestId: id }, { status: 403 });
  }
  if (!bodyWithinLimit(request, 35_000)) {
    return NextResponse.json({ error: "Solicitação muito grande.", requestId: id }, { status: 413 });
  }

  const configuredLimit = Number(process.env.BUILDER_FREE_DAILY_LIMIT || 4);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 4;
  const usage = rateLimit(`builder:${clientIp(request)}`, limit, 86_400_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Limite diário do Builder atingido.", code: "builder_rate_limited", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds) } },
    );
  }

  let body: {
    brief?: unknown;
    capabilities?: unknown;
    projectType?: unknown;
    visualStyle?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido.", requestId: id }, { status: 400 });
  }

  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 20 || brief.length > 4000) {
    return NextResponse.json(
      { error: "Descreva o projeto usando entre 20 e 4.000 caracteres.", requestId: id },
      { status: 400 },
    );
  }

  const capabilityIds = normalizeBuilderCapabilities(body.capabilities);
  const projectType = normalizeOption(body.projectType, PROJECT_TYPES, "landing");
  const visualStyle = normalizeOption(body.visualStyle, VISUAL_STYLES, "premium");
  const context = generationContext(projectType, visualStyle, capabilityIds);

  let provider: AIProviderConfig | null;
  try {
    provider = getAIProviderConfig();
  } catch (error) {
    log("error", "nexus-builder", "invalid_provider_config", { requestId: id, error });
    return NextResponse.json(
      { error: "O provedor de IA está configurado incorretamente.", code: "invalid_provider_config", requestId: id },
      { status: 503 },
    );
  }

  if (!provider) {
    return NextResponse.json(
      { error: "O Nexus Builder precisa de um provedor de IA ativo.", code: "ai_not_configured", requestId: id },
      { status: 503 },
    );
  }

  try {
    const first = await providerCompletion(
      provider,
      [
        { role: "system", content: builderSystemPrompt },
        {
          role: "user",
          content: `Crie um projeto completo para este pedido:\n\n${brief}\n\n${context}\n\nEntregue somente o JSON no schema exigido.`,
        },
      ],
      0.25,
    );

    let project;
    let generationPath: "structured" | "repaired" | "html-fallback" = "structured";
    try {
      project = parseProject(first);
    } catch (firstError) {
      log("warn", "nexus-builder", "first_manifest_invalid", {
        requestId: id,
        provider: provider.name,
        error: firstError,
      });

      try {
        const repaired = await providerCompletion(
          provider,
          [
            {
              role: "system",
              content: `${builderSystemPrompt} Corrija a saída fornecida para cumprir exatamente o schema e as restrições.`,
            },
            {
              role: "user",
              content: `Pedido original:\n${brief}\n\n${context}\n\nSaída inválida a corrigir:\n${first.slice(0, 30_000)}`,
            },
          ],
          0,
        );
        project = parseProject(repaired);
        generationPath = "repaired";
      } catch (repairError) {
        log("warn", "nexus-builder", "manifest_repair_failed_using_html_fallback", {
          requestId: id,
          provider: provider.name,
          error: repairError,
        });

        const fallback = await providerCompletion(
          provider,
          [
            { role: "system", content: singleFileFallbackPrompt },
            {
              role: "user",
              content: `Crie o site completo para este pedido:\n\n${brief}\n\n${context}`,
            },
          ],
          0.2,
          3500,
        );
        project = buildSingleFileProject(fallback);
        generationPath = "html-fallback";
      }
    }

    return NextResponse.json({
      project,
      mode: "live",
      provider: provider.name,
      model: provider.model,
      remaining: usage.remaining,
      capabilities: capabilityIds,
      projectType,
      visualStyle,
      generationPath,
      requestId: id,
    });
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status?: number }).status) : 0;
    log("warn", "nexus-builder", "generation_failed", {
      requestId: id,
      provider: provider.name,
      status: status || undefined,
      error,
    });

    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: "A credencial do provedor de IA foi recusada.", code: "provider_auth_failed", requestId: id },
        { status: 503 },
      );
    }
    if (status === 429) {
      return NextResponse.json(
        { error: "O provedor de IA atingiu o limite temporário. Tente novamente em instantes.", code: "provider_rate_limited", requestId: id },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "O Builder não conseguiu gerar um pacote válido desta vez. Tente simplificar o pedido.",
        code: "builder_generation_failed",
        requestId: id,
      },
      { status: 502 },
    );
  }
}
