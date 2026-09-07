import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleShell } from "@/components/module-shell";
import { CrmPipeline } from "@/components/crm-pipeline";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isCrmAdmin, listCrmLeads } from "@/lib/server/crm-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CRM Comercial — Nexus Brasil",
  description: "Pipeline privado de leads e oportunidades do Nexus Brasil.",
  robots: { index: false, follow: false },
};

export default async function ClientsPipelinePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  let admin: { role: "owner" | "admin" } | null = null;
  try { admin = await isCrmAdmin(user.id); }
  catch {
    return (
      <ModuleShell active="/clientes" eyebrow="NEXUS • CRM" title="CRM temporariamente indisponível." description="A camada administrativa não conseguiu validar o acesso ao banco agora.">
        <p>O acesso aos dados comerciais permanece bloqueado por segurança. Tente novamente depois de validar a conexão com o Supabase.</p>
      </ModuleShell>
    );
  }

  if (!admin) {
    return (
      <ModuleShell active="/clientes" eyebrow="NEXUS • CRM" title="Acesso restrito." description="Esta área contém dados comerciais e só pode ser aberta por membros explicitamente autorizados no CRM.">
        <div style={{ display: "grid", gap: 14, maxWidth: 760 }}>
          <p>Sua sessão está autenticada, mas não possui papel <strong>owner</strong> ou <strong>admin</strong> no CRM.</p>
          <p>Nenhuma lista de leads, contato ou valor foi carregada.</p>
          <div><Link className="primary-button" href="/conta">VER MINHA CONTA <span>→</span></Link></div>
        </div>
      </ModuleShell>
    );
  }

  let leads;
  try { leads = await listCrmLeads(200); }
  catch {
    return (
      <ModuleShell active="/clientes" eyebrow="NEXUS • CRM" title="Não foi possível carregar o pipeline." description="Sua autorização foi confirmada, mas a consulta de leads falhou.">
        <p>Os dados permanecem protegidos. Verifique a disponibilidade do Supabase e recarregue esta página.</p>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      active="/clientes"
      eyebrow={`NEXUS • CRM • ${admin.role.toUpperCase()}`}
      title="Pipeline comercial."
      description="Leads reais, estágio, prioridade, valor estimado e follow-up em uma única operação privada. Nenhuma mensagem é enviada automaticamente por este painel."
      action={<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="primary-button" href="/solucoes-corporativas">CAPTAR NOVO LEAD <span>→</span></Link><Link href="/plano-de-acao">Plano de Ação</Link></div>}
    >
      <CrmPipeline initialLeads={leads} />
    </ModuleShell>
  );
}
