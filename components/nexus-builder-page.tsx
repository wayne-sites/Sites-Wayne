"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import {
  BUILDER_CAPABILITIES,
  BUILDER_CAPABILITY_CATEGORIES,
  RECOMMENDED_BUILDER_CAPABILITY_IDS,
  type BuilderCapabilityCategory,
} from "@/lib/builder/capabilities";
import type { BuilderProject } from "@/lib/builder/manifest";
import styles from "./nexus-builder-page.module.css";

type BuilderResponse = {
  project?: BuilderProject;
  error?: string;
  provider?: string;
  model?: string;
  remaining?: number;
  capabilities?: string[];
  generationPath?: "structured" | "repaired" | "html-fallback";
};

type PreviewMode = "desktop" | "tablet" | "mobile";

type HistoryEntry = {
  id: string;
  createdAt: string;
  brief: string;
  project: BuilderProject;
  projectType: string;
  visualStyle: string;
  capabilityIds: string[];
};

const STORAGE_KEY = "nexus-builder-v2-config";
const HISTORY_KEY = "nexus-builder-v2-history";

const suggestions = [
  "Crie uma landing page moderna para uma barbearia premium com serviços, depoimentos, FAQ e botão de contato.",
  "Crie um painel financeiro pessoal que funcione localmente no navegador e salve dados no localStorage.",
  "Crie um site de portfólio futurista para uma empresa de tecnologia com projetos, serviços e formulário visual.",
  "Crie um catálogo elegante para uma marca de roupas, com filtros visuais e carrinho apenas demonstrativo local.",
  "Crie uma página para academia com planos, horários, professores, depoimentos e chamada para matrícula.",
  "Crie um site educacional para ensinar Python básico com trilha de módulos, progresso local e exercícios visuais.",
];

const projectTypes = [
  ["landing", "Landing page"],
  ["business", "Site institucional"],
  ["portfolio", "Portfólio"],
  ["dashboard", "Dashboard local"],
  ["catalog", "Catálogo"],
  ["education", "Educação"],
  ["event", "Evento"],
  ["community", "Comunidade"],
] as const;

const visualStyles = [
  ["premium", "Premium"],
  ["futuristic", "Futurista"],
  ["minimal", "Minimalista"],
  ["corporate", "Corporativo"],
  ["editorial", "Editorial"],
  ["playful", "Vibrante"],
  ["luxury", "Luxuoso"],
  ["brutalist", "Brutalista"],
] as const;

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

function auditProject(project: BuilderProject | null) {
  if (!project) return [];
  const index = project.files.find((file) => file.path.toLowerCase() === "index.html")?.content || "";
  const all = project.files.map((file) => file.content).join("\n");
  return [
    ["DOCTYPE", /<!doctype html>/i.test(index)],
    ["Idioma", /<html[^>]+lang=["'][^"']+["']/i.test(index)],
    ["Viewport", /name=["']viewport["']/i.test(index)],
    ["Título", /<title[^>]*>[^<]+<\/title>/i.test(index)],
    ["Meta descrição", /name=["']description["']/i.test(index)],
    ["H1", /<h1\b/i.test(index)],
    ["Main semântico", /<main\b/i.test(index)],
    ["Sem eval", !/\beval\s*\(/i.test(all)],
    ["Sem segredo aparente", !/(?:gsk_|sk-proj-|ghp_|github_pat_|AKIA[0-9A-Z]{12})/.test(all)],
    ["Sem script remoto", !/<script[^>]+src=["']https?:/i.test(all)],
    ["README", project.files.some((file) => file.path.toLowerCase() === "readme.md")],
    ["Sem asset remoto", !/(?:src|href)=["']https?:\/\//i.test(index)],
  ] as Array<[string, boolean]>;
}

function fileStats(project: BuilderProject | null) {
  if (!project) return { chars: 0, lines: 0 };
  const chars = project.files.reduce((sum, file) => sum + file.content.length, 0);
  const lines = project.files.reduce((sum, file) => sum + file.content.split("\n").length, 0);
  return { chars, lines };
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
  const [generationPath, setGenerationPath] = useState<string | null>(null);
  const [projectType, setProjectType] = useState("landing");
  const [visualStyle, setVisualStyle] = useState("premium");
  const [selectedCapabilities, setSelectedCapabilities] = useState<Set<string>>(
    () => new Set(RECOMMENDED_BUILDER_CAPABILITY_IDS),
  );
  const [capabilitySearch, setCapabilitySearch] = useState("");
  const [capabilityCategory, setCapabilityCategory] = useState<BuilderCapabilityCategory | "Todos">("Todos");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          brief?: string;
          projectType?: string;
          visualStyle?: string;
          capabilityIds?: string[];
        };
        if (typeof parsed.brief === "string") setBrief(parsed.brief.slice(0, 4000));
        if (projectTypes.some(([value]) => value === parsed.projectType)) setProjectType(parsed.projectType || "landing");
        if (visualStyles.some(([value]) => value === parsed.visualStyle)) setVisualStyle(parsed.visualStyle || "premium");
        if (Array.isArray(parsed.capabilityIds)) {
          const allowed = new Set(BUILDER_CAPABILITIES.map((item) => item.id));
          setSelectedCapabilities(new Set(parsed.capabilityIds.filter((id) => allowed.has(id))));
        }
      }
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory) as HistoryEntry[];
        if (Array.isArray(parsedHistory)) setHistory(parsedHistory.slice(0, 5));
      }
    } catch {
      // Configuração local corrompida é ignorada; o Builder continua com defaults seguros.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          brief,
          projectType,
          visualStyle,
          capabilityIds: [...selectedCapabilities],
        }),
      );
    } catch {
      // Persistência local é opcional.
    }
  }, [brief, projectType, selectedCapabilities, visualStyle]);

  const selectedFile = project?.files.find((file) => file.path === selectedPath) || project?.files[0] || null;
  const preview = useMemo(() => staticPreview(project), [project]);
  const checks = useMemo(() => auditProject(project), [project]);
  const stats = useMemo(() => fileStats(project), [project]);
  const qualityScore = checks.length ? Math.round((checks.filter(([, ok]) => ok).length / checks.length) * 100) : 0;

  const visibleCapabilities = useMemo(() => {
    const query = capabilitySearch.trim().toLocaleLowerCase("pt-BR");
    return BUILDER_CAPABILITIES.filter((item) => {
      const categoryMatches = capabilityCategory === "Todos" || item.category === capabilityCategory;
      const queryMatches = !query || `${item.label} ${item.description} ${item.category}`.toLocaleLowerCase("pt-BR").includes(query);
      return categoryMatches && queryMatches;
    });
  }, [capabilityCategory, capabilitySearch]);

  function saveHistory(entry: HistoryEntry) {
    setHistory((current) => {
      const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 5);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Histórico local é opcional.
      }
      return next;
    });
  }

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
        body: JSON.stringify({
          brief,
          projectType,
          visualStyle,
          capabilities: [...selectedCapabilities],
        }),
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
      setGenerationPath(data.generationPath || null);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (Array.isArray(data.capabilities)) setSelectedCapabilities(new Set(data.capabilities));
      saveHistory({
        id: `${Date.now()}-${safeSlug(data.project.name)}`,
        createdAt: new Date().toISOString(),
        brief,
        project: data.project,
        projectType,
        visualStyle,
        capabilityIds: data.capabilities || [...selectedCapabilities],
      });
    } catch {
      setError("Não foi possível conectar ao Nexus Builder.");
    } finally {
      setLoading(false);
    }
  }

  function toggleCapability(id: string) {
    setSelectedCapabilities((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportBundle() {
    if (!project) return;
    const bundle = {
      format: "nexus-builder/v2",
      generatedAt: new Date().toISOString(),
      generator: {
        provider,
        model,
        generationPath,
        projectType,
        visualStyle,
        capabilities: [...selectedCapabilities],
      },
      project,
    };
    downloadText(`${safeSlug(project.name)}.nexus.json`, JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
  }

  function exportSelected() {
    if (!selectedFile) return;
    downloadText(selectedFile.path.split("/").at(-1) || "arquivo.txt", selectedFile.content);
  }

  function copyAll() {
    if (!project) return;
    const text = project.files.map((file) => `===== ${file.path} =====\n${file.content}`).join("\n\n");
    void navigator.clipboard?.writeText(text);
  }

  function updateSelectedFile(content: string) {
    if (!project || !selectedFile) return;
    setProject({
      ...project,
      files: project.files.map((file) => file.path === selectedFile.path ? { ...file, content } : file),
    });
  }

  function restoreHistory(entry: HistoryEntry) {
    setBrief(entry.brief);
    setProject(entry.project);
    setProjectType(entry.projectType);
    setVisualStyle(entry.visualStyle);
    setSelectedCapabilities(new Set(entry.capabilityIds));
    setSelectedPath(entry.project.files[0]?.path || "");
    setError("");
  }

  return (
    <ModuleShell
      active="/builder"
      eyebrow="NEXUS BUILDER • V2 • 100 MÓDULOS"
      title="Descreva. Configure. Gere. Audite. Exporte."
      description="O Builder V2 combina Groq real com 100 módulos configuráveis de estrutura, design, UX, acessibilidade, SEO, performance, segurança, conteúdo, conversão e qualidade."
      action={
        <div className="usage-pill">
          <span>✦</span>
          <p>
            <strong>{selectedCapabilities.size}/100 módulos ativos</strong>
            <small>{provider ? `${provider}${model ? ` • ${model}` : ""}` : "Groq em produção"}</small>
          </p>
        </div>
      }
    >
      <div className={styles.workspace}>
        <form className={styles.panel} onSubmit={generate}>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>✦ IA real</span>
            <span className={styles.safeBadge}>✓ geração validada</span>
            <span className={styles.badge}>100 módulos</span>
          </div>

          <label htmlFor="builder-brief">O que você quer que o Nexus crie?</label>
          <textarea
            id="builder-brief"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            maxLength={4000}
            placeholder="Ex.: crie um site completo para uma academia, com planos, depoimentos, FAQ e formulário visual..."
          />
          <div className={styles.counter}>{brief.length}/4000 caracteres</div>

          <div className={styles.configGrid}>
            <label>
              Tipo
              <select value={projectType} onChange={(event) => setProjectType(event.target.value)}>
                {projectTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Estilo visual
              <select value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)}>
                {visualStyles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <div className={styles.suggestions}>
            {suggestions.slice(0, 3).map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => setBrief(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <section className={styles.capabilityPanel} aria-label="Módulos do Builder">
            <div className={styles.capabilityHead}>
              <div>
                <strong>Módulos de geração</strong>
                <small>{selectedCapabilities.size} selecionados de 100</small>
              </div>
              <div className={styles.capabilityActions}>
                <button type="button" onClick={() => setSelectedCapabilities(new Set(RECOMMENDED_BUILDER_CAPABILITY_IDS))}>Recomendados</button>
                <button type="button" onClick={() => setSelectedCapabilities(new Set(BUILDER_CAPABILITIES.map((item) => item.id)))}>Todos</button>
                <button type="button" onClick={() => setSelectedCapabilities(new Set())}>Limpar</button>
              </div>
            </div>

            <input
              className={styles.capabilitySearch}
              value={capabilitySearch}
              onChange={(event) => setCapabilitySearch(event.target.value)}
              placeholder="Buscar entre 100 módulos..."
              aria-label="Buscar módulos"
            />

            <div className={styles.categoryTabs}>
              <button type="button" className={capabilityCategory === "Todos" ? styles.categoryActive : ""} onClick={() => setCapabilityCategory("Todos")}>Todos</button>
              {BUILDER_CAPABILITY_CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={capabilityCategory === category ? styles.categoryActive : ""}
                  onClick={() => setCapabilityCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className={styles.capabilityList}>
              {visibleCapabilities.map((item) => (
                <label className={styles.capabilityItem} key={item.id}>
                  <input
                    type="checkbox"
                    checked={selectedCapabilities.has(item.id)}
                    onChange={() => toggleCapability(item.id)}
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.category} • {item.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <button className={styles.generate} disabled={loading || brief.trim().length < 20}>
            {loading ? "Gerando projeto..." : `Criar com ${selectedCapabilities.size} módulos`}
          </button>

          <p className={styles.note}>
            V2 gera HTML/CSS/JS estático, aplica os módulos selecionados e mantém as travas de paths, extensões, tamanho e segredos.
            {remaining !== null ? ` • ${remaining} gerações restantes hoje.` : ""}
          </p>
          {error && <p className={styles.error}>{error}</p>}

          {history.length > 0 && (
            <div className={styles.history}>
              <strong>Histórico local</strong>
              {history.map((entry) => (
                <button type="button" key={entry.id} onClick={() => restoreHistory(entry)}>
                  <span>{entry.project.name}</span>
                  <small>{new Date(entry.createdAt).toLocaleString("pt-BR")}</small>
                </button>
              ))}
            </div>
          )}
        </form>

        <section className={styles.resultPanel}>
          {!project ? (
            <div className={styles.empty}>
              <div>
                <span>{loading ? "…" : "◇"}</span>
                <strong>{loading ? "Construindo e validando" : "Seu projeto aparecerá aqui"}</strong>
                <p>
                  O Nexus usa os módulos escolhidos como requisitos reais de geração e valida o pacote antes de entregar os arquivos.
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
                  <button type="button" onClick={exportBundle}>Baixar pacote V2</button>
                  <button type="button" onClick={copyAll}>Copiar tudo</button>
                </div>
              </header>

              <div className={styles.meta}>
                <span>{project.files.length} arquivos</span>
                <span>{stats.lines} linhas</span>
                <span>{Math.round(stats.chars / 1024)} KB texto</span>
                <span>Qualidade {qualityScore}%</span>
                {generationPath && <span>Pipeline: {generationPath}</span>}
                {project.stack.map((item) => <span key={item}>{item}</span>)}
              </div>

              <div className={styles.auditGrid}>
                {checks.map(([label, ok]) => (
                  <span className={ok ? styles.auditOk : styles.auditWarn} key={label}>{ok ? "✓" : "!"} {label}</span>
                ))}
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
                    <button type="button" onClick={exportSelected}>Baixar</button>
                  </div>
                  <textarea
                    className={styles.codeEditor}
                    spellCheck={false}
                    value={selectedFile?.content || ""}
                    onChange={(event) => updateSelectedFile(event.target.value)}
                    aria-label={`Editar ${selectedFile?.path || "arquivo"}`}
                  />
                </div>
              </div>

              {preview && (
                <div className={styles.previewBlock}>
                  <div className={styles.previewHead}>
                    <div>
                      <strong>Preview estático</strong>
                      <small>JavaScript desativado no iframe de inspeção</small>
                    </div>
                    <div className={styles.previewModes}>
                      {(["desktop", "tablet", "mobile"] as PreviewMode[]).map((mode) => (
                        <button type="button" key={mode} className={previewMode === mode ? styles.previewModeActive : ""} onClick={() => setPreviewMode(mode)}>
                          {mode === "desktop" ? "Desktop" : mode === "tablet" ? "Tablet" : "Mobile"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`${styles.previewCanvas} ${styles[previewMode]}`}>
                    <iframe
                      title={`Preview de ${project.name}`}
                      sandbox=""
                      referrerPolicy="no-referrer"
                      srcDoc={preview}
                    />
                  </div>
                </div>
              )}

              <div className={styles.runInfo}>
                <strong>Como executar:</strong> {project.howToRun}
                <br />
                <small>Alterações feitas no editor são locais e entram no pacote baixado; o preview continua isolado.</small>
              </div>
            </>
          )}
        </section>
      </div>
    </ModuleShell>
  );
}
