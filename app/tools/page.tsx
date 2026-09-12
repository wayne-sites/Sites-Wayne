import type { Metadata } from "next";
import { ModuleShell } from "@/components/module-shell";
import { NEXUS_DEFAULT_RUNTIME, NEXUS_TOOL_CATALOG } from "@/lib/nexus-tool-network";

export const metadata: Metadata = {
  title: "Nexus Tools — Universal Tool Network",
  description: "Catálogo capability-first de ferramentas nativas, workers e connectors do Nexus Brasil.",
};

function runtimeLabel(toolId: string) {
  const state = NEXUS_DEFAULT_RUNTIME.find((item) => item.toolId === toolId);
  if (state?.healthy && state.availability === "native") return "NATIVE • ONLINE";
  return "ADAPTER SEED • NÃO CONECTADO";
}

export default function NexusToolsPage() {
  const capabilityCount = new Set(NEXUS_TOOL_CATALOG.flatMap((tool) => tool.capabilities)).size;
  const nativeCount = NEXUS_TOOL_CATALOG.filter((tool) => tool.execution === "native").length;
  const workerCount = NEXUS_TOOL_CATALOG.filter((tool) => tool.execution === "worker").length;

  return (
    <ModuleShell
      active="/tools"
      eyebrow="NEXUS UNIVERSAL TOOL NETWORK"
      title="Uma interface. Ferramentas substituíveis por capability."
      description="O Nexus seleciona providers por capacidade, custo, disponibilidade e risco. Seeds externos só executam depois de instalação/conexão, health check e gates adequados."
      action={<div className="usage-pill"><span>⚙</span><p><strong>{NEXUS_TOOL_CATALOG.length} manifests</strong><small>{capabilityCount} capabilities registradas</small></p></div>}
    >
      <div style={{ display: "grid", gap: 20 }}>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <article className="module-card"><small>POLÍTICA</small><strong style={{ display: "block", fontSize: 22 }}>FREE-FIRST</strong><p>ZERO COST MODE ativo por padrão.</p></article>
          <article className="module-card"><small>NATIVE</small><strong style={{ display: "block", fontSize: 22 }}>{nativeCount}</strong><p>Executáveis no runtime Nexus atual.</p></article>
          <article className="module-card"><small>WORKER SEEDS</small><strong style={{ display: "block", fontSize: 22 }}>{workerCount}</strong><p>Exigem worker/instalação verificada.</p></article>
          <article className="module-card"><small>CAPABILITIES</small><strong style={{ display: "block", fontSize: 22 }}>{capabilityCount}</strong><p>O consumidor pede capacidade, não ferramenta.</p></article>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14 }}>
          {NEXUS_TOOL_CATALOG.map((tool) => (
            <article className="module-card" key={tool.id} style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div><small>{tool.category.join(" • ").toUpperCase()}</small><h2 style={{ margin: "4px 0" }}>{tool.name}</h2></div>
                <span className="section-kicker">{tool.execution.toUpperCase()}</span>
              </div>
              <p>{tool.description}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span className="section-kicker">{tool.pricingModel.toUpperCase()}</span>
                <span className="section-kicker">RISK {tool.riskLevel.toUpperCase()}</span>
                <span className="section-kicker">{runtimeLabel(tool.id)}</span>
              </div>
              <div><small>CAPABILITIES</small><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{tool.capabilities.map((capability) => <code key={capability}>{capability}</code>)}</div></div>
              <footer style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><small>license: {tool.license}</small><small>{tool.sandboxRequired ? "sandbox obrigatório" : "sandbox opcional"}</small></footer>
            </article>
          ))}
        </section>
      </div>
    </ModuleShell>
  );
}
