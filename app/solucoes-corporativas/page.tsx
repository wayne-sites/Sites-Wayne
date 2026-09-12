"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import styles from "./solucoes-corporativas.module.css";

const solutions = [
  { icon: "▦", title: "ERP", description: "Estrutura para centralizar finanças, estoque, operação e indicadores em um fluxo integrado.", status: "Diagnóstico" },
  { icon: "◎", title: "CRM", description: "Organização de leads, relacionamento, follow-up e etapas comerciais para reduzir perda de oportunidades.", status: "Diagnóstico" },
  { icon: "◇", title: "RH", description: "Mapeamento de rotinas de contratação, treinamento, documentação e acompanhamento de equipe.", status: "Diagnóstico" },
  { icon: "⚙", title: "Automação", description: "Conexão entre tarefas repetitivas, APIs, alertas, evidências e rotinas agendadas com gates de segurança.", status: "Nexus" },
] as const;

const benefits = [
  "Redução de trabalho manual por meio de processos padronizados",
  "Visão operacional mais clara para decisões baseadas em dados disponíveis",
  "Integração entre site, atendimento, automações e ferramentas internas",
  "Evolução por etapas: diagnóstico, implementação, validação e manutenção",
] as const;

type CaptureState = "idle" | "saving" | "saved" | "error";

export default function SolucoesCorporativasPage() {
  const [briefing, setBriefing] = useState("");
  const [copied, setCopied] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [leadCode, setLeadCode] = useState("");
  const whatsAppNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") || "5537999584722";

  async function buildBriefing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "");
    const business = String(data.get("business") || "");
    const solution = String(data.get("solution") || "");
    const bottleneck = String(data.get("bottleneck") || "");
    const contact = String(data.get("contact") || "");
    const message = [
      "Diagnóstico — Soluções Corporativas Nexus",
      `Nome: ${name}`,
      `Negócio: ${business}`,
      `Área prioritária: ${solution}`,
      `Principal gargalo: ${bottleneck}`,
      `Contato: ${contact}`,
      "",
      "Quero avaliar escopo, integrações, prazo e custo antes de qualquer implementação.",
    ].join("\n");
    setBriefing(message);
    setCopied(false);
    setCaptureState("saving");
    setLeadCode("");

    const query = new URLSearchParams(window.location.search);
    try {
      const response = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "solucoes-corporativas",
          name,
          business,
          solution,
          bottleneck,
          contact,
          consent: data.get("consent") === "on",
          utm_source: query.get("utm_source"),
          utm_medium: query.get("utm_medium"),
          utm_campaign: query.get("utm_campaign"),
        }),
      });
      const body = await response.json() as { leadCode?: string };
      if (!response.ok || !body.leadCode) throw new Error("capture_failed");
      setLeadCode(body.leadCode);
      setCaptureState("saved");
    } catch {
      setCaptureState("error");
    }
  }

  async function copyBriefing() {
    await navigator.clipboard.writeText(briefing);
    setCopied(true);
  }

  return (
    <ModuleShell
      active="/solucoes-corporativas"
      eyebrow="NEXUS • NEGÓCIOS"
      title="Soluções corporativas conectadas ao Nexus."
      description="Área para diagnosticar ERP, CRM, RH e automação e transformar necessidades operacionais em projetos executáveis dentro do ecossistema Wayne/Nexus."
      action={<div className={styles.heroActions}><a className="primary-button" href="#diagnostico">Solicitar diagnóstico <span>→</span></a><Link href="/servicos">Ver Sites Wayne</Link></div>}
    >
      <section className={styles.positioning}>
        <div><span>INTEGRAÇÃO</span><h2>Do site à operação interna.</h2><p>O módulo reaproveita a proposta do material corporativo enviado e a conecta às áreas já existentes do Nexus: Sites Wayne, Builder, Automações e atendimento comercial.</p></div>
        <div className={styles.flow} aria-label="Fluxo de integração"><span>Site</span><i>→</i><span>CRM</span><i>→</i><span>Operação</span><i>→</i><span>Automação</span></div>
      </section>

      <section className={styles.section} aria-labelledby="solutions-title">
        <header><span>CAPACIDADES</span><h2 id="solutions-title">Quatro frentes para organizar crescimento.</h2><p>ERP, CRM e RH entram como frentes de diagnóstico. Automação conecta essas frentes ao motor de execução do Nexus.</p></header>
        <div className={styles.cards}>{solutions.map((solution) => <article key={solution.title}><div><span className={styles.icon}>{solution.icon}</span><em>{solution.status}</em></div><h3>{solution.title}</h3><p>{solution.description}</p><a href="#diagnostico">Mapear necessidade <b>→</b></a></article>)}</div>
      </section>

      <section className={styles.benefits} aria-labelledby="benefits-title">
        <div><span>BENEFÍCIOS</span><h2 id="benefits-title">Menos fragmentação. Mais controle operacional.</h2><p>O foco é reduzir tarefas isoladas e criar um fluxo que possa ser medido, auditado e melhorado.</p></div>
        <ul>{benefits.map((benefit) => <li key={benefit}><span>✓</span>{benefit}</li>)}</ul>
      </section>

      <section className={styles.integration} aria-label="Integrações Nexus">
        <article><span>◆</span><div><strong>Nexus Builder</strong><p>Criação e evolução de interfaces e projetos web.</p></div><Link href="/builder">Abrir</Link></article>
        <article><span>⚙</span><div><strong>Automações</strong><p>Rotinas agendadas, evidências e execução controlada.</p></div><Link href="/automacoes">Abrir</Link></article>
        <article><span>↗</span><div><strong>Sites Wayne</strong><p>Oferta comercial para presença digital e aquisição.</p></div><Link href="/servicos">Abrir</Link></article>
      </section>

      <section className={styles.diagnostic} id="diagnostico" aria-labelledby="diagnostic-title">
        <div><span>DIAGNÓSTICO</span><h2 id="diagnostic-title">Transforme o problema em escopo.</h2><p>Ao gerar o briefing, o Nexus registra os dados autorizados no CRM para organizar o retorno comercial. Você revisa a mensagem antes de qualquer envio externo.</p></div>
        <form onSubmit={buildBriefing}>
          <label>Seu nome<input name="name" required autoComplete="name" /></label>
          <label>Negócio ou projeto<input name="business" required placeholder="Ex.: loja, assistência, agência" /></label>
          <label>Área prioritária<select name="solution" defaultValue="CRM"><option>ERP</option><option>CRM</option><option>RH</option><option>Automação</option><option>Integração completa</option></select></label>
          <label className={styles.full}>Principal gargalo<textarea name="bottleneck" rows={4} required placeholder="Descreva onde há perda de tempo, leads, controle ou dados." /></label>
          <label className={styles.full}>WhatsApp ou e-mail<input name="contact" required /></label>
          <label className={`${styles.full} ${styles.consent}`}><input name="consent" type="checkbox" required /> Autorizo o Nexus a armazenar estes dados para responder a este pedido e acompanhar a oportunidade.</label>
          <button className={styles.full} type="submit" disabled={captureState === "saving"}>{captureState === "saving" ? "REGISTRANDO..." : "GERAR BRIEFING"}</button>
        </form>
        {briefing && <div className={styles.result} role="status"><pre>{briefing}</pre><div><a href={`https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(briefing)}`} target="_blank" rel="noreferrer">CONTINUAR NO WHATSAPP</a><button type="button" onClick={copyBriefing}>{copied ? "COPIADO" : "COPIAR"}</button></div><small>{captureState === "saved" ? `Pedido registrado no CRM. Código: ${leadCode}.` : captureState === "error" ? "O briefing foi gerado, mas o CRM não conseguiu registrar este pedido. Você ainda pode continuar pelo WhatsApp." : "Registrando o pedido no CRM..."}</small></div>}
      </section>

      <p className={styles.disclaimer}>Este módulo apresenta capacidades e diagnóstico. A disponibilidade de integrações específicas, prazo, preço e suporte depende do escopo confirmado antes da implementação.</p>
    </ModuleShell>
  );
}
