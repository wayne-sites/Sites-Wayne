"use client";

import { useMemo, useState } from "react";
import type { CrmLead } from "@/lib/server/crm-store";
import type { CrmProposal } from "@/lib/server/crm-proposals";
import styles from "./crm-proposals.module.css";

type DraftItem = { key: string; title: string; description: string; quantity: string; price: string };

const statusLabel: Record<string, string> = {
  ready: "Aguardando aprovação",
  approved: "Aprovada",
  payment_pending: "Pagamento pendente",
  paid: "Paga",
  expired: "Expirada",
  rejected: "Recusada",
  canceled: "Cancelada",
  refunded: "Estornada",
};

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function defaultValidity() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function newItem(): DraftItem {
  return { key: crypto.randomUUID(), title: "", description: "", quantity: "1", price: "" };
}

export function CrmProposalPanel({ leads, initialProposals, onLeadProposed }: {
  leads: CrmLead[];
  initialProposals: CrmProposal[];
  onLeadProposed: (leadId: string, totalCents: number) => void;
}) {
  const [proposals, setProposals] = useState(initialProposals);
  const eligible = leads.filter((lead) => ["qualificado", "proposta", "negociacao"].includes(lead.stage));
  const [leadId, setLeadId] = useState(eligible[0]?.id || "");
  const [validUntil, setValidUntil] = useState(defaultValidity());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([newItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");

  const totalCents = useMemo(() => items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const price = Number(item.price.replace(",", "."));
    return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? Math.round(quantity * price * 100) : 0);
  }, 0), [items]);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function createProposal() {
    setSaving(true);
    setError("");
    setCreatedUrl("");
    try {
      if (!leadId) throw new Error("Selecione um lead qualificado.");
      const parsedItems = items.map((item) => ({
        title: item.title,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price_cents: Math.round(Number(item.price.replace(",", ".")) * 100),
      }));
      const response = await fetch("/api/crm/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          valid_until: new Date(`${validUntil}T23:59:59`).toISOString(),
          notes,
          items: parsedItems,
        }),
      });
      const body = await response.json() as { proposal?: CrmProposal; reviewUrl?: string; error?: string };
      if (!response.ok || !body.proposal) throw new Error(body.error || "Não foi possível criar a proposta.");
      setProposals((current) => [body.proposal!, ...current]);
      setCreatedUrl(body.reviewUrl || `/proposta/${body.proposal.public_id}`);
      onLeadProposed(body.proposal.lead_id, body.proposal.total_cents);
      setItems([newItem()]);
      setNotes("");
      setValidUntil(defaultValidity());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a proposta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.wrapper} aria-label="Motor de propostas">
      <header className={styles.header}>
        <div><span>PROPOSAL ENGINE</span><h2>Propostas, aprovação e pagamento</h2><p>O envio do link continua manual. Pagamento só vira ganho após confirmação do webhook.</p></div>
        <strong>{proposals.length} propostas</strong>
      </header>

      <div className={styles.grid}>
        <div className={styles.builder}>
          <label>Lead qualificado<select value={leadId} onChange={(event) => setLeadId(event.target.value)}><option value="">Selecione</option>{eligible.map((lead) => <option value={lead.id} key={lead.id}>{lead.business} — {lead.name}</option>)}</select></label>
          <label>Validade<input type="date" min={new Date().toISOString().slice(0, 10)} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>

          <div className={styles.items}>
            {items.map((item, index) => (
              <div className={styles.item} key={item.key}>
                <div className={styles.itemHead}><b>ITEM {index + 1}</b>{items.length > 1 && <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}>REMOVER</button>}</div>
                <label>Descrição<input value={item.title} maxLength={160} onChange={(event) => updateItem(item.key, { title: event.target.value })} placeholder="Ex.: Implantação do CRM" /></label>
                <label>Detalhes<textarea rows={2} value={item.description} maxLength={1200} onChange={(event) => updateItem(item.key, { description: event.target.value })} /></label>
                <div className={styles.inline}><label>Qtd.<input inputMode="numeric" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} /></label><label>Valor unitário (R$)<input inputMode="decimal" value={item.price} onChange={(event) => updateItem(item.key, { price: event.target.value })} placeholder="0,00" /></label></div>
              </div>
            ))}
            <button className={styles.add} type="button" disabled={items.length >= 20} onClick={() => setItems((current) => [...current, newItem()])}>+ ADICIONAR ITEM</button>
          </div>

          <label>Observações<textarea rows={3} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className={styles.total}><span>TOTAL</span><strong>{brl(totalCents)}</strong></div>
          {error && <div className={styles.error} role="alert">{error}</div>}
          {createdUrl && <div className={styles.success}>Proposta criada. <a href={createdUrl} target="_blank" rel="noreferrer">ABRIR LINK DE REVISÃO</a></div>}
          <button className={styles.create} type="button" disabled={saving || !leadId || totalCents <= 0} onClick={createProposal}>{saving ? "CRIANDO..." : "CRIAR PROPOSTA"}</button>
        </div>

        <div className={styles.history}>
          <h3>Histórico</h3>
          {proposals.length === 0 && <p className={styles.empty}>Nenhuma proposta criada.</p>}
          {proposals.map((proposal) => {
            const lead = leads.find((entry) => entry.id === proposal.lead_id);
            return <article key={proposal.id}>
              <div><span className={styles.badge}>{statusLabel[proposal.status] || proposal.status}</span><h4>{lead?.business || "Lead"}</h4><small>{proposal.public_id.slice(0, 8).toUpperCase()} • válida até {new Date(proposal.valid_until).toLocaleDateString("pt-BR")}</small></div>
              <strong>{brl(proposal.total_cents)}</strong>
              <a href={`/proposta/${proposal.public_id}`} target="_blank" rel="noreferrer">ABRIR</a>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}
