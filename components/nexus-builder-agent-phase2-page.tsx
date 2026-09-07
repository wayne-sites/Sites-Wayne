"use client";

import { FormEvent, useMemo, useState } from "react";
import { ModuleShell } from "@/components/module-shell";
import { BUILDER_CAPABILITIES } from "@/lib/builder/capabilities";
import type { AgentPlan } from "@/lib/builder/agent-plan";
import type { BuilderProject } from "@/lib/builder/manifest";
import styles from "./nexus-builder-agent-page.module.css";

type Stage = "idle" | "planning" | "generating" | "auditing" | "ready" | "publishing" | "error" | "blocked";
type PreviewMode = "desktop" | "tablet" | "mobile";
type JobStatus = "queued" | "running" | "ci_passed" | "preview_ready" | "failed";

type PlanResponse = { plan?: AgentPlan; error?: string; provider?: string; model?: string };
type BuildResponse = {
  project?: BuilderProject;
  error?: string;
  provider?: string;
  model?: string;
  generationPath?: string;
};
type PublishStart = { id?: string; token?: string; status?: JobStatus; publishSlug?: string; error?: string };
type PublishStatus = {
  id: string;
  status: JobStatus;
  projectName?: string;
  branchName?: string | null;
  commitSha?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  previewUrl?: string | null;
  ciUrl?: string | null;
  attempts?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
};

const examples = [
  "Crie um site completo para uma barbearia premium em São Paulo, focado em agendamentos, serviços, equipe, localização e FAQ.",
  "Crie um site para uma academia moderna com planos demonstrativos, horários, professores, dúvidas frequentes e chamada para contato.",
  "Crie um site institucional futurista para uma empresa de tecnologia, com serviços, projetos, sobre, FAQ e formulário visual.",
];

function staticPreview(project: BuilderProject | null) {
  if (!project) return "";
  const index = project.files.find((file) => file.path.toLowerCase() === "index.html");
  if (!index) return "";
  const css = project.files.filter((file) => file.path.toLowerCase().endsWith(".css")).map((file) => file.content).join("\n");
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

function stageLabel(stage: Stage, publication: PublishStatus | null) {
  if (publication?.status === "queued") return "Job enfileirado. O worker seguro vai assumir a tarefa.";
  if (publication?.status === "running") return "Worker criando branch, arquivos e executando os gates.";
  if (publication?.status === "ci_passed") return "GitHub + gates concluídos. Aguardando Vercel Preview.";
  if (publication?.status === "preview_ready") return "Fase 2 concluída: PR e Preview prontos.";
  if (publication?.status === "failed") return "O worker interrompeu o pipeline sem mergear nada.";
  if (stage === "planning") return "Planejando arquitetura, conteúdo e SEO...";
  if (stage === "generating") return "Gerando o projeto com 100 módulos...";
  if (stage === "auditing") return "Auditando o pacote gerado...";
  if (stage === "publishing") return "Enfileirando publicação Preview...";
  if (stage === "ready") return "Projeto pronto para o gate GitHub + Preview.";
  if (stage === "blocked") return "Planejamento bloqueado por requisito técnico.";
  if (stage === "error") return "Pipeline interrompido por erro.";
  return "Aguardando briefing.";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function NexusBuilderAgentPhase2Page() {
  const [brief, setBrief] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [project, setProject] = useState<BuilderProject | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [generationPath, setGenerationPath] = useState("");
  const [error, setError] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [publication, setPublication] = useState<PublishStatus | null>(null);

  const checks = useMemo(() => auditProject(project), [project]);
  const auditPassed = checks.filter(([, ok]) => ok).length;
  const score = checks.length ? Math.round((auditPassed / checks.length) * 100) : 0;
  const preview = useMemo(() => staticPreview(project), [project]);
  const selectedFile = project?.files.find((file) => file.path === selectedPath) || project?.files[0] || null;
  const working = stage === "planning" || stage === "generating" || stage === "auditing" || stage === "publishing";
  const githubDone = publication?.status === "ci_passed" || publication?.status === "preview_ready";
  const previewDone = publication?.status === "preview_ready";

  async function runAgent(event: FormEvent) {
    event.preventDefault();
    if (working || brief.trim().length < 20) return;
    setError(""); setPlan(null); setProject(null); setPublication(null); setSelectedPath(""); setStage("planning");
    try {
      const planResponse = await fetch("/api/builder/plan", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief }),
      });
      const planData = await planResponse.json() as PlanResponse;
      if (!planResponse.ok || !planData.plan) throw new Error(planData.error || "O Agent não conseguiu planejar o projeto.");
      setPlan(planData.plan); setProvider(planData.provider || ""); setModel(planData.model || "");
      if (!planData.plan.readiness.canGenerate) { setStage("blocked"); return; }

      const pagePlan = planData.plan.pages.map((page) => `${page.title}: ${page.purpose}. Seções: ${page.sections.join(", ")}.`).join("\n");
      const missingData = planData.plan.missingBusinessData.length
        ? `Dados reais ainda ausentes: ${planData.plan.missingBusinessData.join(", ")}. Use placeholders explicitamente marcados e não invente valores.`
        : "Use somente os dados reais fornecidos.";
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
      ].join("\n\n").slice(0, 4000);

      setStage("generating");
      const buildResponse = await fetch("/api/builder", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: buildBrief,
          projectType: planData.plan.pages.length > 1 ? "business" : "landing",
          visualStyle: "premium",
          capabilities: BUILDER_CAPABILITIES.map((item) => item.id),
        }),
      });
      const buildData = await buildResponse.json() as BuildResponse;
      if (!buildResponse.ok || !buildData.project) throw new Error(buildData.error || "O Agent não conseguiu gerar o projeto.");
      setProject(buildData.project); setSelectedPath(buildData.project.files[0]?.path || "");
      setProvider(buildData.provider || planData.provider || ""); setModel(buildData.model || planData.model || "");
      setGenerationPath(buildData.generationPath || ""); setStage("auditing");
      auditProject(buildData.project);
      setStage("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir o pipeline.");
      setStage("error");
    }
  }

  async function publishPreview() {
    if (!project || !plan || working || score < 80) return;
    setError(""); setPublication(null); setStage("publishing");
    try {
      const response = await fetch("/api/builder/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project, plan, provider, model, generationPath,
          audit: { score, checks: checks.map(([label, ok]) => ({ label, ok })) },
        }),
      });
      const started = await response.json() as PublishStart;
      if (!response.ok || !started.id || !started.token) throw new Error(started.error || "Não foi possível enfileirar o Preview.");
      setPublication({ id: started.id, status: started.status || "queued" });

      for (let attempt = 0; attempt < 100; attempt += 1) {
        await delay(attempt === 0 ? 1000 : 5000);
        const statusResponse = await fetch(`/api/builder/jobs/${started.id}`, {
          headers: { "x-builder-job-token": started.token }, cache: "no-store",
        });
        const status = await statusResponse.json() as PublishStatus & { error?: string };
        if (!statusResponse.ok) throw new Error(status.error || "Não foi possível acompanhar o job.");
        setPublication(status);
        if (status.status === "preview_ready") { setStage("ready"); return; }
        if (status.status === "failed") throw new Error(status.errorMessage || "O worker não concluiu o Preview.");
      }
      setStage("ready");
      setError("O job continua ativo. O PR será processado pelo worker agendado; mantenha esta página aberta para acompanhar.");
    } catch (caught) {
      setStage("ready");
      setError(caught instanceof Error ? caught.message : "Falha ao criar o Preview.");
    }
  }

  return (
    <ModuleShell
      active="/builder"
      eyebrow="NEXUS BUILDER • V3 AGENT • FASE 2"
      title="Do briefing ao PR e Preview, com gates automáticos."
      description="Planeja, gera, audita, cria uma branch isolada, executa verificações, abre PR e aguarda o Preview da Vercel. Merge e produção continuam bloqueados."
      action={<a className={styles.backLink} href="/builder">← Builder V2</a>}
    >
      <div className={styles.layout}>
        <form className={styles.control} onSubmit={runAgent}>
          <div className={styles.badges}><span>Fase 2</span><span>100 módulos</span><span>OIDC</span><span>Preview only</span></div>
          <label htmlFor="agent-brief">Descreva o site ou negócio</label>
          <textarea id="agent-brief" value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={4000}
            placeholder="Ex.: crie um site premium para uma academia em Belo Horizonte, focado em planos, horários e captação de contatos..." />
          <div className={styles.counter}>{brief.length}/4000</div>
          <div className={styles.examples}>{examples.map((example) => <button type="button" key={example} onClick={() => setBrief(example)}>{example}</button>)}</div>
          <button className={styles.run} type="submit" disabled={working || brief.trim().length < 20}>{working ? "Agent trabalhando..." : "Executar pipeline"}</button>
          {project && <button className={styles.run} style={{ marginTop: 9 }} type="button" onClick={publishPreview} disabled={working || score < 80 || previewDone}>
            {previewDone ? "Preview concluído" : publication ? "Acompanhar PR + Preview" : "Criar PR + Preview"}
          </button>}
          {error && <p className={styles.error}>{error}</p>}
        </form>

        <section className={styles.output}>
          <div className={styles.pipeline}>
            {[
              ["1", "Planejamento", Boolean(plan)],
              ["2", "Geração", Boolean(project)],
              ["3", "Auditoria", Boolean(project)],
              ["4", "GitHub", githubDone],
              ["5", "Vercel Preview", previewDone],
            ].map(([number, label, done]) => <div className={done ? styles.done : ""} key={String(number)}><b>{number}</b><span>{label}</span></div>)}
          </div>
          <p className={styles.stage}>{stageLabel(stage, publication)}</p>

          {!plan && !project && <div className={styles.empty}><div><strong>Agent aguardando missão</strong><p>A Fase 2 termina em PR + Preview, nunca em merge automático.</p></div></div>}

          {plan && <section className={styles.plan}>
            <div className={styles.sectionHead}><div><small>PLANO</small><h2>{plan.projectName}</h2></div><span>{plan.readiness.canGenerate ? "✓ gerável" : "⚠ bloqueado"}</span></div>
            <div className={styles.planGrid}>
              <article><small>Objetivo</small><p>{plan.objective}</p></article>
              <article><small>Público</small><p>{plan.audience}</p></article>
              <article><small>Conversão</small><p>{plan.conversionGoal}</p></article>
              <article><small>SEO</small><p>{plan.seo.primaryKeyword}</p></article>
            </div>
            <div className={styles.pages}>{plan.pages.map((page) => <article key={page.slug}><strong>{page.title}</strong><small>/{page.slug}</small><p>{page.purpose}</p><span>{page.sections.join(" • ")}</span></article>)}</div>
            {plan.missingBusinessData.length > 0 && <div className={styles.warning}><strong>Dados reais faltando</strong><p>{plan.missingBusinessData.join(" • ")}</p></div>}
          </section>}

          {project && <section className={styles.project}>
            <div className={styles.sectionHead}><div><small>PROJETO</small><h2>{project.name}</h2><p>{project.summary}</p></div><span>auditoria {score}%</span></div>
            <div className={styles.metrics}><span>{project.files.length} arquivos</span><span>100/100 módulos</span><span>{provider || "provider"}</span>{model && <span>{model}</span>}{generationPath && <span>{generationPath}</span>}</div>
            <div className={styles.audit}>{checks.map(([label, ok]) => <span className={ok ? styles.ok : styles.fail} key={label}>{ok ? "✓" : "!"} {label}</span>)}</div>
            <div className={styles.editor}>
              <aside>{project.files.map((file) => <button type="button" className={selectedFile?.path === file.path ? styles.active : ""} key={file.path} onClick={() => setSelectedPath(file.path)}>{file.path}</button>)}</aside>
              <pre>{selectedFile?.content}</pre>
            </div>
            <div className={styles.previewHead}><strong>Preview local seguro</strong><div>{(["desktop", "tablet", "mobile"] as PreviewMode[]).map((mode) => <button className={previewMode === mode ? styles.active : ""} type="button" key={mode} onClick={() => setPreviewMode(mode)}>{mode}</button>)}</div></div>
            <div className={`${styles.preview} ${styles[previewMode]}`}><iframe sandbox="" title="Preview local" srcDoc={preview} /></div>
          </section>}

          {(plan || project) && <section className={styles.gate}>
            <h3>Gate Fase 2</h3>
            <div><span className={project ? styles.gateOk : styles.gateWait}>1</span><p><strong>Pacote</strong><small>{project ? "Gerado e validado." : "Aguardando."}</small></p></div>
            <div><span className={score >= 80 ? styles.gateOk : styles.gateWarn}>2</span><p><strong>Auditoria</strong><small>{project ? `${auditPassed}/${checks.length} verificações passaram.` : "Aguardando."}</small></p></div>
            <div><span className={githubDone ? styles.gateOk : publication ? styles.gateWarn : styles.gateWait}>3</span><p><strong>GitHub Agent</strong><small>{publication?.prUrl ? `PR #${publication.prNumber} criado; gates do worker concluídos.` : publication ? `Status: ${publication.status}.` : "Branch e PR só são criados após sua ação de Preview."}</small>{publication?.prUrl && <a className={styles.backLink} href={publication.prUrl} target="_blank" rel="noreferrer">Abrir PR</a>}</p></div>
            <div><span className={previewDone ? styles.gateOk : publication ? styles.gateWarn : styles.gateWait}>4</span><p><strong>Vercel Preview</strong><small>{publication?.previewUrl ? "Preview isolado pronto." : publication ? "Aguardando Vercel." : "Ainda não iniciado."}</small>{publication?.previewUrl && <a className={styles.backLink} href={publication.previewUrl} target="_blank" rel="noreferrer">Abrir Preview</a>}</p></div>
            <div><span className={styles.gateWait}>5</span><p><strong>Produção</strong><small>Bloqueada. O worker não possui etapa de merge nem deploy de produção.</small></p></div>
          </section>}
        </section>
      </div>
    </ModuleShell>
  );
}
