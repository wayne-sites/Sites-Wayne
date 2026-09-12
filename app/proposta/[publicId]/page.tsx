import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalDecision } from "@/components/proposal-decision";
import { isUuid } from "@/lib/validation";
import { getCrmProposalByPublicId } from "@/lib/server/crm-proposals";
import { log } from "@/lib/server/logger";
import styles from "./proposal.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Proposta Comercial — Nexus Brasil",
  description: "Revisão privada de proposta comercial.",
  robots: { index: false, follow: false },
};

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function supabaseProjectRef() {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname.split(".")[0] || "unknown"; }
  catch { return "invalid"; }
}

const labels: Record<string, string> = {
  ready: "Aguardando aprovação",
  approved: "Aprovada",
  payment_pending: "Pagamento pendente",
  paid: "Paga",
  expired: "Expirada",
  rejected: "Recusada",
  canceled: "Cancelada",
  refunded: "Estornada",
};

export default async function ProposalPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!isUuid(publicId)) notFound();
  let proposal;
  try { proposal = await getCrmProposalByPublicId(publicId); }
  catch (error) {
    log("error", "crm-proposal-page", "proposal_lookup_failed", { publicId, supabaseProjectRef: supabaseProjectRef(), error });
    notFound();
  }
  if (!proposal || !proposal.lead) {
    log("warn", "crm-proposal-page", "proposal_not_found", { publicId, supabaseProjectRef: supabaseProjectRef() });
    notFound();
  }
  const items = [...(proposal.items || [])].sort((a, b) => a.position - b.position);
  const expired = proposal.status === "expired";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">NEXUS BRASIL</Link>
        <span>PROPOSTA COMERCIAL</span>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}>WAYNE CORPORATION • NEXUS</span>
          <h1>Proposta para {proposal.lead.business}</h1>
          <p>Revise escopo, valor e validade antes de aprovar. O pagamento ocorre no ambiente seguro do Mercado Pago.</p>
        </div>
        <div className={styles.status}><small>STATUS</small><strong>{labels[proposal.status] || proposal.status}</strong></div>
      </section>

      <section className={styles.meta}>
        <article><span>Cliente</span><strong>{proposal.lead.name}</strong></article>
        <article><span>Validade</span><strong>{date(proposal.valid_until)}</strong></article>
        <article><span>Proposta</span><strong>{proposal.public_id.slice(0, 8).toUpperCase()}</strong></article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><h2>Itens e valores</h2><span>{items.length} {items.length === 1 ? "item" : "itens"}</span></div>
        <div className={styles.items}>
          {items.map((item) => (
            <article key={item.id}>
              <div><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</div>
              <span>{item.quantity} × {brl(item.unit_price_cents)}</span>
              <b>{brl(item.quantity * item.unit_price_cents)}</b>
            </article>
          ))}
        </div>
        <div className={styles.total}><span>TOTAL</span><strong>{brl(proposal.total_cents)}</strong></div>
        {proposal.notes && <div className={styles.notes}><b>Observações</b><p>{proposal.notes}</p></div>}
      </section>

      <section className={styles.decision}>
        <h2>Aprovação</h2>
        <ProposalDecision publicId={proposal.public_id} initialStatus={proposal.status} checkoutUrl={proposal.checkout_url} expired={expired} />
      </section>

      <footer className={styles.footer}>O Nexus só marca esta proposta como paga depois que o servidor confirma o pagamento junto ao Mercado Pago.</footer>
    </main>
  );
}
