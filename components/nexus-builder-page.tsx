"use client";

import { FormEvent, useMemo, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import type { BuilderProject } from "@/lib/builder/manifest";
import styles from "./nexus-builder-page.module.css";

type BuilderResponse = {
  project?: BuilderProject;
  error?: string;
  provider?: string;
  model?: string;
  remaining?: number;
};

const suggestions = [
  "Crie uma landing page moderna para uma barbearia premium com serviços, depoimentos e botão de contato.",
  "Crie um painel financeiro pessoal que funcione localmente no navegador e salve dados no localStorage.",
  "Crie um site de portfólio futurista para uma empresa de tecnologia com projetos, serviços e formulário visual.",
];

function safeSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "nexus-project";
}

function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function staticPreview(project: BuilderProject | null) {
  if (!project) return "";
  const index = project.files.find((file) => file.path.toLowerCase() === "index.html");
  if (!index) return "";
  const css = project.files
    .filter((file) => file.path.toLowerCase().endsWith(".css"))
    .map((file) => `/* ${file.path} */\n${file.content}`)
    .join("\n\n");

  const stripped = index.content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "");

  const injected = `<style>${css}</style>`;
  if (/<\/head>/i.test(stripped)) return stripped.replace(/<\/head>/i, `${injected}</head>`);
  return `${injected}${stripped}`;
}

export function NexusBuilderPage() {
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<BuilderProject | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const selectedFile = project?.files.find((file) => file.path === selectedPath) || project?.files[0] || null;
  const preview = useMemo(() => staticPreview(project), [project]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (brief.trim().length < 20 || loading) return;
    setLoading(true);
    setError("");
    setProject(null);
    setSelectedPath("");

    try {
      const response = await fetch("/api/builder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const data = (await response.json()) as BuilderResponse;
      if (!response.ok || !data.project) {
        setError(data.error || "O Builder não conseguiu gerar o projeto.");
        return;
      }
      setProject(data.project);
      setSelectedPath(data.project.files[0]?.path || "");
      setProvider(data.provider || null);
      setModel(data.model || null);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch {
      setError("Não foi possível conectar ao Nexus Builder.");
    } finally {
      setLoading(false);
    }
  }

  function exportBundle() {
    if (!project) return;
    const bundle = {
      format: "nexus-builder/v1",
      generatedAt: new Date().toISOString(),
      project,
    };
    downloadText(`${safeSlug(project.name)}.nexus.json`, JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
  }

  function exportSelected() {
    if (!selectedFile) return;
    downloadText(selectedFile.path.split("/").at(-1) || "arquivo.txt", selectedFile.content);
  }

  return (
    <ModuleShell
      active="/builder"
      eyebrow="NEXUS BUILDER • V1"
      title="Descreva. Gere. Inspecione. Exporte."
      description="O Builder transforma um pedido em um projeto web estático completo usando a IA real do Nexus. Nesta primeira versão ele gera e valida os arquivos automaticamente, mas não publica nem altera repositórios sem um gate explícito."
      action={
        <div className="usage-pill">
          <span>✦</span>
          <p>
            <strong>Builder seguro</strong>
            <small>{provider ? `${provider}${model ? ` • ${model}` : ""}` : "Groq quando o provider estiver ativo"}</small>
          </p>
        </div>
      }
    >
      <div className={styles.workspace}>
        <form className={styles.panel} onSubmit={generate}>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>✦ IA real</span>
            <span className={styles.safeBadge}>✓ sem deploy automático</span>
          </div>

          <label htmlFor="builder-brief">O que você quer que o Nexus crie?</label>
          <textarea
            id="builder-brief"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            maxLength={4000}
            placeholder="Ex.: crie um site completo para uma academia, com planos, depoimentos, FAQ e formulário visual..."
          />

          <div className={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => setBrief(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <button className={styles.generate} disabled={loading || brief.trim().length < 20}>
            {loading ? "Gerando projeto..." : "Criar projeto com Nexus Builder"}
          </button>

          <p className={styles.note}>
            V1 gera HTML/CSS/JS que roda direto no navegador. Backend, publicação, GitHub e CI entram na próxima camada do agente.
            {remaining !== null ? ` • ${remaining} gerações restantes hoje.` : ""}
          </p>
          {error && <p className={styles.error}>{error}</p>}
        </form>

        <section className={styles.resultPanel}>
          {!project ? (
            <div className={styles.empty}>
              <div>
                <span>{loading ? "…" : "◇"}</span>
                <strong>{loading ? "Construindo arquivos" : "Seu projeto aparecerá aqui"}</strong>
                <p>
                  O Nexus gera a estrutura, valida nomes de arquivos e bloqueia segredos ou caminhos perigosos antes de entregar o pacote.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className={styles.projectHead}>
                <div>
                  <h2>{project.name}</h2>
                  <p>{project.summary}</p>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={exportBundle}>Baixar pacote</button>
                  <button type="button" disabled title="Entra na próxima etapa do Builder Agent">GitHub em breve</button>
                </div>
              </header>

              <div className={styles.meta}>
                <span>{project.files.length} arquivos</span>
                {project.stack.map((item) => <span key={item}>{item}</span>)}
                {project.features.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
              </div>

              <div className={styles.editor}>
                <aside className={styles.fileList}>
                  <p>Arquivos</p>
                  {project.files.map((file) => (
                    <button
                      type="button"
                      className={(selectedFile?.path === file.path) ? styles.active : ""}
                      onClick={() => setSelectedPath(file.path)}
                      key={file.path}
                      title={file.path}
                    >
                      {file.path}
                    </button>
                  ))}
                </aside>
                <div className={styles.fileView}>
                  <div className={styles.fileToolbar}>
                    <strong>{selectedFile?.path}</strong>
                    <button type="button" onClick={() => selectedFile && navigator.clipboard?.writeText(selectedFile.content)}>Copiar</button>
                    <button type="button" onClick={exportSelected}>Baixar arquivo</button>
                  </div>
                  <pre>{selectedFile?.content}</pre>
                </div>
              </div>

              {preview && (
                <div className={styles.previewBlock}>
                  <div className={styles.previewHead}>
                    <strong>Preview estático</strong>
                    <small>JavaScript desativado no preview por segurança</small>
                  </div>
                  <iframe
                    title={`Preview de ${project.name}`}
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={preview}
                  />
                </div>
              )}

              <div className={styles.runInfo}>
                <strong>Como executar:</strong> {project.howToRun}
              </div>
            </>
          )}
        </section>
      </div>
    </ModuleShell>
  );
}
