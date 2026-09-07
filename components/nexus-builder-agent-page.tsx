"use client";

import { FormEvent, useMemo, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { BUILDER_CAPABILITIES } from "@/lib/builder/capabilities";
import type { AgentPlan } from "@/lib/builder/agent-plan";
import type { BuilderProject } from "@/lib/builder/manifest";
import styles from "./nexus-builder-agent-page.module.css";

type Stage = "idle" | "planning" | "generating" | "auditing" | "ready" | "blocked" | "error";
type PreviewMode = "desktop" | "tablet" | "mobile";

type PlanResponse = {
  plan?: AgentPlan;
  error?: string;
  provider?: string;
  model?: string;
};

type BuildResponse = {
  project?: BuilderProject;
  error?: string;
  provider?: string;
  model?: string;
  generationPath?: string;
  capabilities?: string[];
};

const examples = [
  "Crie um site completo para uma barbearia premium em São Paulo, focado em agendamentos, serviços, equipe, localização e FAQ.",
  "Crie um site para uma academia moderna com planos demonstrativos, horários, professores, dúvidas frequentes e chamada para contato.",
  "Crie um site institucional futurista para uma empresa de tecnologia, com serviços, projetos, sobre, FAQ e formulário visual.",
];

function safeSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "nexus-agent-project";
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
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
    .map((file) => file.content)
    .join("\n");
  const stripped = index.content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "");
  const injected = `<style>${css}</style>`;
  return /<\/head>/i.test(stripped) ? stripped.replace(/<\/head>/i, `${injected}</head>`) : `${injected}${stripped}`;
}

function auditProject(project: BuilderProject | null) {
  if (!project) return [] as Array<[string, boolean]>;
  const index = project.files.find((file) => file.path.toLowerCase() === "index.html")?.content || "";
  const all = project.files.map((file) => file.content).join("\n");
  return [
    ["index.html", Boolean(index)],
    ["DOCTYPE", /<!doctype html>/i.test(index)],
    ["lang", /<html[^>]+lang=["'][^"']+["']/i.test(index)],
    ["viewport", /name=["']viewport["']/i.test(index)],
    ["title", /<title[^>]*>[^<]+<\/title>/i.test(index)],
    ["meta description", /name=["']description["']/i.test(index)],
    ["H1", /<h1\b/i.test(index)],
    ["main semântico", /<main\b/i.test(index)],
    ["README", project.files.some((file) => file.path.toLowerCase() === "readme.md")],
    ["sem eval", !/\beval\s*\(/i.test(all)],
    ["sem segredo aparente", !/(?:gsk_|sk-proj-|ghp_|github_pat_|AKIA[0-9A-Z]{12})/.test(all)],
    ["sem script remoto", !/<script[^>]+src=["']https?:/i.test(all)],
    ["sem iframe remoto", !/<iframe[^>]+src=["']https?:/i.test(all)],
    ["sem formulário externo", !/<form[^>]+action=["']https?:/i.test(all)],
  ] as Array<[string, boolean]>;
}

function pipelineLabel(stage: Stage) {
  if (stage === "planning") return "Planejando arquitetura, conteúdo e SEO...";
  if (stage === "generating") return "Gerando o projeto com 100 módulos...";
  if (stage === "auditing") return "Auditando o pacote gerado...";
  if (stage === "ready") return "Pipeline concluído.";
  if (stage === "blocked") return "Planejamento bloqueado por requisito técnico.";
  if (stage === "error") return "Pipeline interrompido por erro.";
  return "Aguardando briefing.";
}

export function NexusBuilderAgentPage() {
  const [brief, setBrief] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [project, setProject] = useState<BuilderProject | null>(null);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [generationPath, setGenerationPath] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");

  const checks = useMemo(() => auditProject(project), [project]);
  const auditPassed = checks.filter(([, ok]) => ok).length;
  const score = checks.length ? Math.round((auditPassed / checks.length) * 100) : 0;
  const preview = useMemo(() => staticPreview(project), [project]);
  const selectedFile = project?.files.find((file) => file.path === selectedPath) || project?.files[0] || null;
  const working = stage === "planning" || stage === "generating" || stage === "auditing";

  async function runAgent(event: FormEvent) {
    event.preventDefault();
    if (working || brief.trim().length < 20) return;

    setError("");
    setPlan(null);
    setProject(null);
    setSelectedPath("");
    setStage("planning");

    try {
      const planResponse = await fetch("/api/builder/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const planData = (await planResponse.json()) as PlanResponse;
      if (!planResponse.ok || !planData.plan) {
        setError(planData.error || "O Agent não conseguiu planejar o projeto.");
        setStage("error");
        return;
      }

      setPlan(planData.plan);
      setProvider(planData.provider || "");
      setModel(planData.model || "");

      if (!planData.plan.readiness.canGenerate) {
        setStage("blocked");
        return;
      }

      const pagePlan = planData.plan.pages
        .map((page) => `${page.title}: ${page.purpose}. Seções: ${page.sections.join(", ")}.`)
        .join("\n");
      const missingData = planData.plan.missingBusinessData.length
        ? `Dados reais ainda ausentes: ${planData.plan.missingBusinessData.join(", ")}. Use placeholders explicitamente marcados e não invente valores.`
        : "Os dados essenciais informados podem ser usados como fornecidos, sem extrapolar fatos.";
      const buildBrief = [
        planData.plan.buildBrief,
        `Objetivo: ${planData.plan.objective}`,
        `Público: ${planData.plan.audience}`,
        `Conversão principal: ${planData.plan.conversionGoal}`,
        `SEO principal: ${planData.plan.seo.primaryKeyword}`,
        `Título SEO: ${planData.plan.seo.title}`,
        `Descrição SEO: ${planData.plan.seo.description}`,
        `Arquitetura planejada:\n${pagePlan}`,
        missingData,
      ].join("\n\n");

      setStage("generating");
      const buildResponse = await fetch("/api/builder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: buildBrief.slice(0, 4000),
          projectType: planData.plan.pages.length > 1 ? "business" : "landing",
          visualStyle: "premium",
          capabilities: BUILDER_CAPABILITIES.map((item) => item.id),
        }),
      });
      const buildData = (await buildResponse.json()) as BuildResponse;
      if (!buildResponse.ok || !buildData.project) {
        setError(buildData.error || "O Agent planejou, mas não conseguiu gerar o projeto.");
        setStage("error");
        return;
      }

      setProject(buildData.project);
      setSelectedPath(buildData.project.files[0]?.path || "");
      setProvider(buildData.provider || planData.provider || "");
      setModel(buildData.model || planData.model || "");
      setGenerationPath(buildData.generationPath || "");
      setStage("auditing");

      const generatedChecks = auditProject(buildData.project);
      if (!generatedChecks.length || !generatedChecks.every(([, ok]) => ok)) {
        setStage("ready");
        return;
      }
      setStage("ready");
    } catch {
      setError("Não foi possível concluir o pipeline do Nexus Builder Agent.");
      setStage("error");
    }
  }

  function exportAgentBundle() {
    if (!plan || !project) return;
    downloadJson(`${safeSlug(project.name)}.nexus-agent.json`, {
      format: "nexus-builder-agent/v3",
      generatedAt: new Date().toISOString(),
      provider,
      model,
      generationPath,
      capabilities: BUILDER_CAPABILITIES.map((item) => item.id),
      plan,
      audit: {
        score,
        checks: checks.map(([label, ok]) => ({ label, ok })),
      },
      publicationGate: {
        githubWrite: false,
        vercelPreview: false,
        reason: "Credenciais de publicação ainda não foram conectadas ao Agent V3. O pacote está pronto para a Fase 2.",
      },
      project,
    });
  }

  return (
    <ModuleShell
      active="/builder"
      eyebrow="NEXUS BUILDER • V3 AGENT • FASE 1"
      title="Descreva o negócio. O Agent planeja, constrói e audita."
      description="A V3 encadeia planejamento por IA, arquitetura, SEO, geração com 100 módulos e auditoria automática antes do gate de publicação."
      action={<a className={styles.backLink} href="/builder">← Builder V2</a>}
    >
      <div className={styles.layout}>
        <form className={styles.control} onSubmit={runAgent}>
          <div className={styles.badges}>
            <span>V3 Agent</span><span>100 módulos</span><span>Groq strict</span>
          </div>
          <label htmlFor="agent-brief">Descreva o site ou negócio</label>
          <textarea
            id="agent-brief"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            maxLength={4000}
            placeholder="Ex.: crie um site para uma barbearia premium em Curitiba, focado em agendamento e apresentação dos serviços..."
          />
          <div className={styles.counter}>{brief.length}/4000</div>
          <div className={styles.examples}>
            {examples.map((example) => <button type="button" key={example} onClick={() => setBrief(example)}>{example}</button>)}
          </div>
          <button className={styles.run} type="submit" disabled={working || brief.trim().length < 20}>
            {working ? "Agent trabalhando..." : "Executar pipeline V3"}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </form>

        <section className={styles.output}>
          <div className={styles.pipeline}>
            {[
              ["1", "Planejamento", stage === "planning" || Boolean(plan)],
              ["2", "Geração", stage === "generating" || Boolean(project)],
              ["3", "Auditoria", stage === "auditing" || stage === "ready"],
              ["4", "GitHub", false],
              ["5", "Vercel Preview", false],
            ].map(([number, label, done]) => (
              <div className={done ? styles.done : ""} key={String(number)}><b>{number}</b><span>{label}</span></div>
            ))}
          </div>
          <p className={styles.stage}>{pipelineLabel(stage)}</p>

          {!plan && !project && <div className={styles.empty}><strong>Agent aguardando missão</strong><p>Ele vai montar o plano antes de gerar qualquer arquivo.</p></div>}

          {plan && <section className={styles.plan}>
            <div className={styles.sectionHead}><div><small>PLANO DE PRODUÇÃO</small><h2>{plan.projectName}</h2></div><span>{plan.readiness.canGenerate ? "✓ gerável" : "⚠ bloqueado"}</span></div>
            <div className={styles.planGrid}>
              <article><small>Objetivo</small><p>{plan.objective}</p></article>
              <article><small>Público</small><p>{plan.audience}</p></article>
              <article><small>Conversão</small><p>{plan.conversionGoal}</p></article>
              <article><small>SEO</small><p>{plan.seo.primaryKeyword}</p></article>
            </div>
            <div className={styles.pages}>
              {plan.pages.map((page) => <article key={page.slug}><strong>{page.title}</strong><small>/{page.slug}</small><p>{page.purpose}</p><span>{page.sections.join(" • ")}</span></article>)}
            </div>
            {plan.missingBusinessData.length > 0 && <div className={styles.warning}><strong>Dados reais ainda faltando</strong><p>{plan.missingBusinessData.join(" • ")}</p></div>}
            {plan.readiness.blockers.length > 0 && <div className={styles.warning}><strong>Bloqueadores</strong><p>{plan.readiness.blockers.join(" • ")}</p></div>}
          </section>}

          {project && <section className={styles.project}>
            <div className={styles.sectionHead}>
              <div><small>PROJETO GERADO</small><h2>{project.name}</h2><p>{project.summary}</p></div>
              <button type="button" onClick={exportAgentBundle}>Baixar pacote Agent</button>
            </div>
            <div className={styles.metrics}>
              <span>{project.files.length} arquivos</span>
              <span>{BUILDER_CAPABILITIES.length}/100 módulos</span>
              <span>auditoria {score}%</span>
              <span>{provider || "provider"}{model ? ` • ${model}` : ""}</span>
              {generationPath && <span>{generationPath}</span>}
            </div>
            <div className={styles.audit}>
              {checks.map(([label, ok]) => <span className={ok ? styles.ok : styles.fail} key={label}>{ok ? "✓" : "!"} {label}</span>)}
            </div>
            <div className={styles.editor}>
              <aside>{project.files.map((file) => <button type="button" className={selectedFile?.path === file.path ? styles.active : ""} key={file.path} onClick={() => setSelectedPath(file.path)}>{file.path}</button>)}</aside>
              <pre>{selectedFile?.content}</pre>
            </div>
            <div className={styles.previewHead}><strong>Preview seguro</strong><div>{(["desktop", "tablet", "mobile"] as PreviewMode[]).map((mode) => <button className={previewMode === mode ? styles.active : ""} type="button" key={mode} onClick={() => setPreviewMode(mode)}>{mode}</button>)}</div></div>
            <div className={`${styles.preview} ${styles[previewMode]}`}><iframe sandbox="" title="Preview do projeto" srcDoc={preview} /></div>
          </section>}

          {(plan || project) && <section className={styles.gate}>
            <h3>Gate de publicação</h3>
            <div><span className={project ? styles.gateOk : styles.gateWait}>1</span><p><strong>Projeto gerado</strong><small>{project ? "Pacote validado pelo Builder." : "Aguardando geração."}</small></p></div>
            <div><span className={score === 100 ? styles.gateOk : styles.gateWarn}>2</span><p><strong>Auditoria</strong><small>{project ? `${auditPassed}/${checks.length} verificações passaram.` : "Aguardando pacote."}</small></p></div>
            <div><span className={plan?.missingBusinessData.length ? styles.gateWarn : styles.gateOk}>3</span><p><strong>Dados do negócio</strong><small>{plan?.missingBusinessData.length ? `${plan.missingBusinessData.length} campos ainda precisam de dados reais.` : "Nenhum dado essencial pendente detectado."}</small></p></div>
            <div><span className={styles.gateWait}>4</span><p><strong>GitHub Agent</strong><small>Fase 2: criação automática de branch/repositório e PR com credencial server-side limitada.</small></p></div>
            <div><span className={styles.gateWait}>5</span><p><strong>Vercel Preview</strong><small>Fase 2: deploy de Preview após GitHub + checks, sem liberar produção automaticamente.</small></p></div>
          </section>}
        </section>
      </div>
    </ModuleShell>
  );
}
