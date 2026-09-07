"use client";

import { useState } from "react";
import styles from "./proposal-decision.module.css";

type Props = {
  publicId: string;
  initialStatus: string;
  checkoutUrl: string | null;
  expired: boolean;
};

export function ProposalDecision({ publicId, initialStatus, checkoutUrl, expired }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: "approve" | "reject") {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/crm/proposals/public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ public_id: publicId, action, approver_name: name, accept }),
      });
      const body = await response.json() as { status?: string; checkoutUrl?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir a ação.");
      setStatus(body.status || status);
      if (body.checkoutUrl) window.location.assign(body.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
    } finally {
      setSaving(false);
    }
  }

  if (expired || status === "expired") return <div className={styles.state}>Esta proposta expirou e não pode mais ser aprovada.</div>;
  if (status === "paid") return <div className={styles.success}>Pagamento confirmado. A oportunidade foi marcada como ganha no CRM.</div>;
  if (status === "rejected") return <div className={styles.state}>Proposta recusada. Nenhuma cobrança foi iniciada.</div>;
  if (status === "refunded") return <div className={styles.state}>Pagamento estornado. O CRM reabriu a oportunidade para negociação.</div>;
  if (status === "canceled") return <div className={styles.state}>Esta proposta foi cancelada.</div>;

  if ((status === "payment_pending" || status === "approved") && checkoutUrl) {
    return <div className={styles.panel}><p>A proposta já foi aprovada. O pagamento ainda não foi confirmado.</p><a className={styles.primary} href={checkoutUrl}>IR PARA O PAGAMENTO</a></div>;
  }

  return (
    <div className={styles.panel}>
      <label>Nome de quem aprova<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" /></label>
      <label className={styles.check}><input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} /><span>Li a proposta, concordo com os itens, valor e validade e autorizo iniciar o pagamento.</span></label>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.actions}>
        <button className={styles.primary} type="button" disabled={saving || !accept || name.trim().length < 2} onClick={() => decide("approve")}>{saving ? "PROCESSANDO..." : "APROVAR E IR PARA PAGAMENTO"}</button>
        <button className={styles.secondary} type="button" disabled={saving} onClick={() => decide("reject")}>RECUSAR PROPOSTA</button>
      </div>
      <small>A aprovação não marca a proposta como paga. O status “pago” só é aplicado após confirmação do Mercado Pago pelo webhook do servidor.</small>
    </div>
  );
}
