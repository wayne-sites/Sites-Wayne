"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { NexusWorkerEnrollment } from "./nexus-worker-enrollment";
import { NexusWorkerJobRunner } from "./nexus-worker-job-runner";
import styles from "./nexus-studio-home.module.css";

type ProjectType =
  | "website" | "app" | "software" | "ai" | "agent" | "automation" | "image" | "video"
  | "audio" | "presentation" | "document" | "spreadsheet" | "game" | "database" | "api" | "business";

type NexusProject = {
  id: string;
  name: string;
  description: string | null;
  project_type: ProjectType | "other";
  status: "draft" | "active" | "archived";
  artifacts?: Array<{ id: string; kind: string; name: string; path: string; version: number }>;
};

type CreateResponse = { project?: NexusProject; error?: string };

const creationCards: Array<{ type: ProjectType; label: string; icon: string; description: string; href?: string }> = [
  { type: "website", label: "Website", icon: "◫", description: "Sites, landing pages, portais e SaaS.", href: "/builder" },
  { type: "app", label: "App", icon: "▣", description: "Mobile, PWA e experiências instaláveis." },
  { type: "software", label: "Software", icon: "⌘", description: "Sistemas web, desktop e ferramentas." },
  { type: "ai", label: "AI", icon: "✦", description: "Copilotos, RAG, classificação e geração.", href: "/ia" },
  { type: "agent", label: "Agent", icon: "◎", description: "Agentes com ferramentas, memória e gates." },
  { type: "automation", label: "Automation", icon: "⚙", description: "Triggers, condições, ações e outputs.", href: "/automacoes" },
  { type: "image", label: "Image", icon: "◇", description: "Imagens, logos, mockups e assets." },
  { type: "video", label: "Video", icon: "▶", description: "Roteiro, assets, narração e edição." },
  { type: "audio", label: "Audio", icon: "◖", description: "Narração, voz, podcast e sound design." },
  { type: "presentation", label: "Presentation", icon: "▥", description: "Slides, narrativa e materiais executivos." },
  { type: "document", label: "Document", icon: "▤", description: "PDF, DOCX, relatórios e documentação." },
  { type: "spreadsheet", label: "Spreadsheet", icon: "▦", description: "Planilhas, modelos, fórmulas e dashboards." },
  { type: "game", label: "Game", icon: "♢", description: "Jogos web, mobile e protótipos.", href: "/jogos" },
  { type: "database", label: "Database", icon: "◉", description: "Schemas, relações, RLS e migrations." },
  { type: "api", label: "API", icon: "⇄", description: "REST, webhooks, RPC e integrações." },
  { type: "business", label: "Business", icon: "↗", description: "Produto, vendas, monetização e operação.", href: "/solucoes-corporativas" },
];

const creationModes = ["SIMPLE", "PRO", "DEVELOPER", "DESIGNER", "AUTOMATION", "BUSINESS", "AGENT"] as const;

function projectNameFromBrief(brief: string) {
  const first = brief.trim().split(/[.!?\n]/)[0]?.trim() || "Projeto Nexus";
  return first.slice(0, 100);
}

export function NexusStudioHome({
  initialProjects,
  coreReady,
  pairingEnabled,
}: {
  initialProjects: NexusProject[];
  coreReady: boolean;
  pairingEnabled: boolean;
}) {
  const [brief, setBrief] = useState("");
  const [selectedType, setSelectedType] = useState<ProjectType | null>(null);
  const [mode, setMode] = useState<(typeof creationModes)[number]>("SIMPLE");
  const [projects, setProjects] = useState(initialProjects);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<NexusProject | null>(null);

  const selectedCard = useMemo(() => creationCards.find((card) => card.type === selectedType) || null, [selectedType]);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (brief.trim().length < 10 || loading) return;
    setLoading(true);
    setError("");
    setCreated(null);
    try {
      const response = await fetch("/api/nexus/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: projectNameFromBrief(brief),
          description: brief,
          ...(selectedType ? { project_type: selectedType } : {}),
          metadata: { source: "nexus-studio", creation_mode: mode },
        }),
      });
      const data = await response.json() as CreateResponse;
      if (!response.ok || !data.project) {
        setError(data.error || "Não foi possível criar o projeto.");
        return;
      }
      setCreated(data.project);
      setProjects((current) => [data.project!, ...current.filter((item) => item.id !== data.project!.id)]);
    } catch {
      setError("Não foi possível conectar ao Nexus Core.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.studio}>
      <section className={styles.createPanel}>
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.kicker}>UNIVERSAL CREATION ENGINE</span>
            <h2>O que você quer criar?</h2>
            <p>Escolha um tipo ou simplesmente descreva. O projeto vira uma primitive persistente do Nexus Core.</p>
          </div>
          <span className={coreReady ? styles.ready : styles.pending}>{coreReady ? "CORE ONLINE" : "SCHEMA PENDENTE"}</span>
        </div>

        <div className={styles.cards}>
          {creationCards.map((card) => (
            <button
              type="button"
              key={card.type}
              className={selectedType === card.type ? styles.selectedCard : styles.card}
              onClick={() => setSelectedType((current) => current === card.type ? null : card.type)}
            >
              <span>{card.icon}</span>
              <strong>{card.label}</strong>
              <small>{card.description}</small>
            </button>
          ))}
        </div>

        <form className={styles.commandBox} onSubmit={createProject}>
          <div className={styles.modeRow}>
            {creationModes.map((item) => <button type="button" key={item} className={mode === item ? styles.activeMode : ""} onClick={() => setMode(item)}>{item}</button>)}
          </div>
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            maxLength={5000}
            placeholder="Ex.: Crie uma plataforma para restaurantes aceitarem pedidos online, com painel, pagamentos e automações..."
          />
          <div className={styles.commandFooter}>
            <span>{selectedCard ? `${selectedCard.icon} ${selectedCard.label}` : "✦ classificação automática"}</span>
            <button type="submit" disabled={brief.trim().length < 10 || loading}>{loading ? "CRIANDO..." : "+ CRIAR"}</button>
          </div>
        </form>

        {error && <div className={styles.error}>{error}</div>}
        {created && (
          <div className={styles.created}>
            <div><span>PROJECT</span><strong>{created.name}</strong><small>{created.project_type} • {created.status} • {created.id.slice(0, 8).toUpperCase()}</small></div>
            {selectedCard?.href && <Link href={`${selectedCard.href}?project=${encodeURIComponent(created.id)}`}>ABRIR MOTOR <span>→</span></Link>}
          </div>
        )}
      </section>

      <section className={styles.projectSection}>
        <div className={styles.sectionHeader}><div><span className={styles.kicker}>CREATOR WORKSPACE</span><h2>Projetos persistentes</h2></div><strong>{projects.length}</strong></div>
        {projects.length ? (
          <div className={styles.projectGrid}>
            {projects.slice(0, 12).map((project) => (
              <article key={project.id}>
                <span>{project.project_type.toUpperCase()}</span>
                <h3>{project.name}</h3>
                <p>{project.description || "Projeto Nexus sem descrição."}</p>
                <footer><small>{project.artifacts?.length || 0} artefatos</small><code>{project.id.slice(0, 8)}</code></footer>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}><strong>Nenhum projeto persistente ainda.</strong><p>Crie o primeiro projeto acima. O histórico deixa de depender apenas do navegador.</p></div>
        )}
      </section>

      <NexusWorkerJobRunner projects={projects.map(({ id, name }) => ({ id, name }))} />
      <NexusWorkerEnrollment pairingEnabled={pairingEnabled} />
    </div>
  );
}
