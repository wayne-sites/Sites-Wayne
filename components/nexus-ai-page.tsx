"use client";

import { FormEvent, useEffect, useState } from "react";
import { ModuleShell } from "@/components/module-shell";

const aiTools = [
  "Assistente de texto",
  "Resumidor",
  "Plano de negócio",
  "Descrição de produto",
  "Organizador de estudos",
  "Criador de publicações",
];

type ProviderStatus = {
  configured: boolean;
  provider: string | null;
  model: string | null;
};

type AIResponse = {
  result?: string;
  error?: string;
  provider?: string;
  model?: string;
  remaining?: number;
};

function providerLabel(provider: string | null) {
  if (provider === "groq") return "Groq Cloud";
  if (provider === "ollama") return "Ollama local";
  if (provider === "custom") return "Provider externo";
  return "IA não configurada";
}

export function NexusAIPage() {
  const [tool, setTool] = useState(aiTools[0]);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ProviderStatus>({ configured: false, provider: null, model: null });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ai", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as Partial<ProviderStatus>;
        if (!active) return;
        setStatus({
          configured: response.ok && data.configured === true,
          provider: typeof data.provider === "string" ? data.provider : null,
          model: typeof data.model === "string" ? data.model : null,
        });
      })
      .catch(() => {
        if (active) setStatus({ configured: false, provider: null, model: null });
      })
      .finally(() => {
        if (active) setStatusLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult("");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, tool }),
      });
      const data = (await response.json()) as AIResponse;
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (data.provider) {
        setStatus({ configured: response.ok, provider: data.provider, model: data.model || null });
        setStatusLoaded(true);
      }
      setResult(data.result || data.error || "Não foi possível gerar o resultado.");
    } catch {
      setResult("Não foi possível conectar ao assistente. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const online = statusLoaded && status.configured;
  const statusTitle = !statusLoaded ? "Verificando IA" : online ? `${providerLabel(status.provider)} online` : "IA aguardando provider";
  const statusDetail = online
    ? status.model || "Modelo configurado no servidor"
    : "A chave fica somente no servidor e nunca é enviada ao navegador";

  return (
    <ModuleShell
      active="/ia"
      eyebrow="NEXUS IA • LIVE BETA"
      title="Transforme intenção em ação com IA real."
      description="Escolha uma ferramenta, descreva o objetivo e receba uma resposta gerada pelo provider ativo do Wayne Sites. Groq roda na nuvem; Ollama fica restrito ao desenvolvimento local."
      action={
        <div className="usage-pill">
          <span>{online ? "●" : "β"}</span>
          <p>
            <strong>{statusTitle}</strong>
            <small>{statusDetail}</small>
          </p>
        </div>
      }
    >
      <div className="ai-workspace">
        <aside>
          <p>Ferramentas</p>
          {aiTools.map((item) => (
            <button
              className={tool === item ? "active" : ""}
              onClick={() => {
                setTool(item);
                setResult("");
              }}
              key={item}
            >
              <span>{item === "Plano de negócio" ? "↯" : item === "Organizador de estudos" ? "▤" : "✦"}</span>
              {item}
            </button>
          ))}
        </aside>

        <form onSubmit={generate}>
          <div className="workspace-head">
            <span>✦</span>
            <p>
              <strong>{tool}</strong>
              <small>
                {online
                  ? `IA real • ${providerLabel(status.provider)}${remaining !== null ? ` • ${remaining} usos restantes` : ""}`
                  : "Provider ainda não confirmado neste ambiente"}
              </small>
            </p>
          </div>

          <label htmlFor="ai-prompt">O que você quer criar?</label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={6000}
            placeholder={tool === "Plano de negócio" ? "Ex.: quero vender sites para negócios locais..." : "Digite ou cole seu texto aqui..."}
          />

          <div className="prompt-suggestions">
            <span>Tente:</span>
            {["Melhorar meu texto", "Criar estratégia", "Organizar em etapas"].map((item) => (
              <button type="button" onClick={() => setPrompt(item)} key={item}>
                {item}
              </button>
            ))}
          </div>

          <button className="generate-button" disabled={loading || !prompt.trim()}>
            {loading ? "Pensando..." : "Gerar com Nexus IA"}
            <span>✦</span>
          </button>

          {!online && statusLoaded && (
            <p className="ai-provider-warning">
              A interface está pronta, mas este ambiente ainda não confirmou uma credencial de IA válida.
            </p>
          )}

          {(loading || result) && (
            <div className="ai-output">
              {loading ? (
                <div className="output-loading"><i /><i /><i /></div>
              ) : (
                <>
                  <div>
                    <span>✦ Resultado</span>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(result)}>Copiar</button>
                  </div>
                  <pre>{result}</pre>
                </>
              )}
            </div>
          )}
        </form>
      </div>
    </ModuleShell>
  );
}
