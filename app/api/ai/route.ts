import { NextRequest, NextResponse } from "next/server";
import { getAIProviderConfig, normalizeAITool } from "@/lib/ai/config";
import { nexusSystemInstruction } from "@/lib/ai/prompts";
import { bodyWithinLimit, clientIp, fetchWithTimeout, isSameOrigin, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { rateLimit } from "@/lib/server/rate-limit";

function readProvider() {
  try {
    return { provider: getAIProviderConfig(), error: null };
  } catch (error) {
    return { provider: null, error };
  }
}

export async function GET() {
  const { provider, error } = readProvider();
  if (error) {
    return NextResponse.json(
      { configured: false, provider: null, model: null, code: "invalid_provider_config" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { configured: Boolean(provider), provider: provider?.name || null, model: provider?.model || null },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origem não autorizada.", requestId: id }, { status: 403 });
  if (!bodyWithinLimit(request, 16_384)) return NextResponse.json({ error: "Solicitação muito grande.", requestId: id }, { status: 413 });

  const limit = Number(process.env.AI_FREE_DAILY_LIMIT || 10);
  const usage = rateLimit(`ai:${clientIp(request)}`, Number.isFinite(limit) ? limit : 10, 86_400_000);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Limite diário atingido.", requestId: id },
      { status: 429, headers: { "retry-after": String(usage.retryAfterSeconds) } },
    );
  }

  let body: { prompt?: unknown; tool?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const tool = normalizeAITool(body.tool);
  if (!prompt || prompt.length > 6000) {
    return NextResponse.json({ error: "O texto deve ter entre 1 e 6.000 caracteres." }, { status: 400 });
  }

  const { provider, error: providerError } = readProvider();
  if (providerError) {
    log("error", "nexus-ai", "invalid_provider_config", { requestId: id, error: providerError });
    return NextResponse.json(
      { error: "O provedor de IA está configurado incorretamente.", code: "invalid_provider_config", requestId: id },
      { status: 503 },
    );
  }
  if (!provider) {
    return NextResponse.json(
      { error: "O provedor real de IA ainda não foi ativado.", code: "ai_not_configured", requestId: id },
      { status: 503 },
    );
  }

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

    const response = await fetchWithTimeout(
      provider.apiUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.5,
          max_tokens: 700,
          messages: [
            { role: "system", content: nexusSystemInstruction(tool) },
            { role: "user", content: prompt },
          ],
        }),
      },
      20_000,
    );

    if (!response.ok) {
      log("warn", "nexus-ai", "provider_http_error", {
        requestId: id,
        provider: provider.name,
        status: response.status,
      });
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: "A credencial do provedor de IA foi recusada.", code: "provider_auth_failed", requestId: id },
          { status: 503 },
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: "O provedor de IA atingiu o limite temporário. Tente novamente em instantes.", code: "provider_rate_limited", requestId: id },
          { status: 503 },
        );
      }
      throw new Error(`provider_${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      output_text?: string;
      result?: string;
    };
    const result = data.choices?.[0]?.message?.content || data.output_text || data.result;
    if (!result) throw new Error("provider_empty");

    return NextResponse.json({
      result: result.slice(0, 50_000),
      mode: "live",
      provider: provider.name,
      model: provider.model,
      remaining: usage.remaining,
      requestId: id,
    });
  } catch (error) {
    log("warn", "nexus-ai", "provider_unavailable", { requestId: id, provider: provider.name, error });
    return NextResponse.json(
      { error: "O provedor de IA não respondeu. Tente novamente.", code: "provider_unavailable", requestId: id },
      { status: 502 },
    );
  }
}
