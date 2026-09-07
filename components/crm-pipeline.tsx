"use client";

import { useMemo, useState } from "react";
import type { CrmLead } from "@/lib/server/crm-store";
import { crmPriorities, crmStages, type CrmPriority, type CrmStage } from "@/lib/crm";
import styles from "./crm-pipeline.module.css";

const stageLabels: Record<CrmStage, string> = {
  novo: "Novos",
  qualificado: "Qualificados",
  proposta: "Proposta",
  negociacao: "Negociação",
  ganho: "Ganhos",
  perdido: "Perdidos",
};

const priorityLabels: Record<CrmPriority, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta" };

function brl(cents: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}

function localDate(value: string | null) {
  if (!value) return "Sem follow-up";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function contactHref(lead: CrmLead) {
  if (lead.contact_kind === "email") return `mailto:${lead.contact}`;
  if (lead.contact_kind === "whatsapp") {
    const digits = lead.contact.replace(/\D/g, "");
    return `https://wa.me/${digits}`;
  }
  return null;
}

export function CrmPipeline({ initialLeads }: { initialLeads: CrmLead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const metrics = useMemo(() => {
    const active = leads.filter((lead) => !["ganho", "perdido"].includes(lead.stage));
    const won = leads.filter((lead) => lead.stage === "ganho");
    const negotiating = leads.filter((lead) => ["proposta", "negociacao"].includes(lead.stage));
    return {
      total: leads.length,
      active: active.length,
      negotiating: negotiating.length,
      wonValue: won.reduce((sum, lead) => sum + (lead.estimated_value_cents || 0), 0),
    };
  }, [leads]);

  async function updateLead(id: string, patch: Record<string, unknown>) {
    setSavingId(id);
    setError("");
    try {
      const response = await fetch("/api/crm/leads", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const body = await response.json() as { lead?: CrmLead; error?: string };
      if (!response.ok || !body.lead) throw new Error(body.error || "Falha ao atualizar o lead.");
      setLeads((current) => current.map((lead) => lead.id === id ? body.lead! : lead));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o lead.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.metrics} aria-label="Indicadores do CRM">
        <article><span>LEADS</span><strong>{metrics.total}</strong><small>Total capturado</small></article>
        <article><span>ATIVOS</span><strong>{metrics.active}</strong><small>Em andamento</small></article>
        <article><span>PIPELINE</span><strong>{metrics.negotiating}</strong><small>Proposta + negociação</small></article>
        <article><span>GANHO</span><strong>{brl(metrics.wonValue)}</strong><small>Valor estimado ganho</small></article>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <section className={styles.board} aria-label="Pipeline comercial">
        {crmStages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage === stage);
          return (
            <div className={styles.column} key={stage}>
              <header><div><span>{stageLabels[stage]}</span><b>{stageLeads.length}</b></div></header>
              <div className={styles.stack}>
                {stageLeads.length === 0 && <div className={styles.empty}>Nenhum lead nesta etapa.</div>}
                {stageLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} saving={savingId === lead.id} onUpdate={updateLead} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function LeadCard({ lead, saving, onUpdate }: { lead: CrmLead; saving: boolean; onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void> }) {
  const [priority, setPriority] = useState<CrmPriority>(lead.priority);
  const [value, setValue] = useState(lead.estimated_value_cents === null ? "" : String(lead.estimated_value_cents / 100));
  const [followup, setFollowup] = useState(toLocalInput(lead.next_followup_at));
  const [notes, setNotes] = useState(lead.notes || "");
  const href = contactHref(lead);

  async function saveDetails() {
    const normalized = value.trim().replace(",", ".");
    const reais = normalized === "" ? null : Number(normalized);
    if (reais !== null && (!Number.isFinite(reais) || reais < 0)) return;
    await onUpdate(lead.id, {
      priority,
      estimated_value_cents: reais === null ? null : Math.round(reais * 100),
      next_followup_at: followup ? new Date(followup).toISOString() : null,
      notes,
    });
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <div><small>{lead.solution || "Oportunidade"}</small><h3>{lead.business}</h3><p>{lead.name}</p></div>
        <span className={`${styles.priority} ${styles[lead.priority]}`}>{priorityLabels[lead.priority]}</span>
      </div>

      {lead.bottleneck && <p className={styles.problem}>{lead.bottleneck}</p>}

      <div className={styles.meta}>
        <span><b>Origem</b>{lead.utm_source || lead.source}</span>
        <span><b>Valor</b>{brl(lead.estimated_value_cents)}</span>
        <span><b>Follow-up</b>{localDate(lead.next_followup_at)}</span>
      </div>

      <div className={styles.actions}>
        {href ? <a href={href} target={lead.contact_kind === "whatsapp" ? "_blank" : undefined} rel="noreferrer">CONTATAR</a> : <span className={styles.contactText}>{lead.contact}</span>}
        <button type="button" disabled={saving} onClick={() => onUpdate(lead.id, { last_contacted_at: new Date().toISOString() })}>MARCAR CONTATO</button>
      </div>

      <div className={styles.controls}>
        <label>Etapa<select value={lead.stage} disabled={saving} onChange={(event) => onUpdate(lead.id, { stage: event.target.value })}>{crmStages.map((stage) => <option value={stage} key={stage}>{stageLabels[stage]}</option>)}</select></label>
        <label>Prioridade<select value={priority} disabled={saving} onChange={(event) => setPriority(event.target.value as CrmPriority)}>{crmPriorities.map((item) => <option value={item} key={item}>{priorityLabels[item]}</option>)}</select></label>
        <label>Valor estimado (R$)<input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" /></label>
        <label>Próximo follow-up<input type="datetime-local" value={followup} onChange={(event) => setFollowup(event.target.value)} /></label>
        <label className={styles.full}>Notas<textarea rows={3} value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className={styles.save} type="button" disabled={saving} onClick={saveDetails}>{saving ? "SALVANDO..." : "SALVAR DETALHES"}</button>
      </div>
    </article>
  );
}
