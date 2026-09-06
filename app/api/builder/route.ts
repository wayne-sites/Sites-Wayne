import { NextRequest, NextResponse } from "next/server";
import { getAIProviderConfig, type AIProviderConfig } from "@/lib/ai/config";
import { extractBuilderJson, validateBuilderProject } from "@/lib/builder/manifest";
import { bodyWithinLimit, clientIp, fetchWithTimeout, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

const builderSystemPrompt = [
  "Você é o Nexus Builder V1, um gerador de projetos web estáticos completos.",
  "Responda SOMENTE com um objeto JSON válido, sem markdown, comentários ou texto antes/depois.",
  "O projeto deve funcionar abrindo index.html diretamente no navegador, sem build, npm, backend ou servidor.",
  "Gere no máximo 10 arquivos usando apenas HTML, CSS, JavaScript, JSON, Markdown ou TXT.",
  "Use caminhos relativos simples. Sempre inclua index.html e README.md.",
  "Priorize interface responsiva, acessibilidade, boa UX e código legível.",
  "Não inclua chaves, tokens, credenciais, .env, dados privados, trackers, mineração, pagamentos, downloads executáveis, shell, PowerShell, batch ou ações de deploy.",
  "Não invente integrações reais. Quando uma função exigiria backend/API, implemente apenas uma experiência local segura e documente a limitação no README.",
  "Schema obrigatório: {\"name\":string,\"kind\":\"static-web\",\"summary\":string,\"stack\":string[],\"features\":string[],\"howToRun\":string,\"files\":[{\"path\":string,\"content\":string}]}",
].join(" ");

async function providerCompletion(
  provider: AIProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature: number,
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
        max_tokens: 5000,
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

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada.", requestId: id }, { status: 403 });
  }
  if (!bodyWithinLimit(request, 20_000)) {
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

  let body: { brief?: unknown };
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
          content: `Crie um projeto completo para este pedido:\n\n${brief}\n\nEntregue somente o JSON no schema exigido.`,
        },
      ],
      0.25,
    );

    let project;
    try {
      project = parseProject(first);
    } catch (firstError) {
      log("warn", "nexus-builder", "first_manifest_invalid", {
        requestId: id,
        provider: provider.name,
        error: firstError,
      });
      const repaired = await providerCompletion(
        provider,
        [
          {
            role: "system",
            content: `${builderSystemPrompt} Corrija a saída fornecida para cumprir exatamente o schema e as restrições.`,
          },
          {
            role: "user",
            content: `Pedido original:\n${brief}\n\nSaída inválida a corrigir:\n${first.slice(0, 30_000)}`,
          },
        ],
        0,
      );
      project = parseProject(repaired);
    }

    return NextResponse.json({
      project,
      mode: "live",
      provider: provider.name,
      model: provider.model,
      remaining: usage.remaining,
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
