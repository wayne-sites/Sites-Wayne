import { NextRequest, NextResponse } from "next/server";
import { getAIProviderConfig, type AIProviderConfig } from "@/lib/ai/config";
import { AGENT_PLAN_JSON_SCHEMA, validateAgentPlan } from "@/lib/builder/agent-plan";
import { bodyWithinLimit, clientIp, fetchWithTimeout, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

const plannerSystemPrompt = [
  "Você é o Nexus Builder V3 Agent Planner.",
  "Transforme uma descrição de negócio/site em um plano de produção executável para um site estático profissional.",
  "Nunca invente endereço, telefone, e-mail, preço, depoimento, certificação, número de clientes ou resultado comercial.",
  "Quando dados reais estiverem ausentes, liste-os em missingBusinessData e use placeholders no buildBrief.",
  "O plano deve priorizar conversão ética, SEO, acessibilidade, mobile first, performance e segurança.",
  "readiness.canGenerate normalmente deve ser true se for possível gerar uma versão segura com placeholders.",
  "Use readiness.blockers apenas quando o pedido for tecnicamente impossível ou contraditório para um projeto web estático.",
  "O buildBrief deve ser detalhado o suficiente para outro agente gerar o site sem precisar reler esta conversa.",
  "Responda somente no schema solicitado.",
].join(" ");

function parseJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("agent_json_missing");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function planCompletion(provider: AIProviderConfig, brief: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  const groqStrict = provider.name === "groq" && /^openai\/gpt-oss-(?:20b|120b)$/i.test(provider.model);
  const payload: Record<string, unknown> = {
    model: provider.model,
    temperature: 0.15,
    max_tokens: 2600,
    messages: [
      { role: "system", content: plannerSystemPrompt },
      {
        role: "user",
        content: `Planeje este projeto:\n\n${brief}\n\nEntregue objetivo, público, páginas, SEO, conteúdo, dados faltantes, riscos, readiness e buildBrief.`,
      },
    ],
  };

  if (groqStrict) {
    payload.reasoning_effort = "low";
    payload.response_format = {
      type: "json_schema",
      json_schema: {
        name: "nexus_builder_agent_plan",
        strict: true,
        schema: AGENT_PLAN_JSON_SCHEMA,
      },
    };
  }

  const response = await fetchWithTimeout(
    provider.apiUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    30_000,
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

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origem não autorizada.", requestId: id }, { status: 403 });
  }
  if (!bodyWithinLimit(request, 12_000)) {
    return NextResponse.json({ error: "Solicitação muito grande.", requestId: id }, { status: 413 });
  }

  const usage = rateLimit(`builder-plan:${clientIp(request)}`, 8, 86_400_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Limite diário do planejamento atingido.", code: "planner_rate_limited", requestId: id },
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
    log("error", "nexus-builder-agent", "invalid_provider_config", { requestId: id, error });
    return NextResponse.json(
      { error: "O provedor de IA está configurado incorretamente.", code: "invalid_provider_config", requestId: id },
      { status: 503 },
    );
  }

  if (!provider) {
    return NextResponse.json(
      { error: "O Nexus Builder Agent precisa de um provedor de IA ativo.", code: "ai_not_configured", requestId: id },
      { status: 503 },
    );
  }

  try {
    const raw = await planCompletion(provider, brief);
    const plan = validateAgentPlan(parseJson(raw));
    return NextResponse.json({
      plan,
      mode: "live",
      provider: provider.name,
      model: provider.model,
      remaining: usage.remaining,
      requestId: id,
    });
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status?: number }).status) : 0;
    log("warn", "nexus-builder-agent", "planning_failed", {
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
      { error: "O Agent não conseguiu montar um plano válido desta vez.", code: "agent_planning_failed", requestId: id },
      { status: 502 },
    );
  }
}
