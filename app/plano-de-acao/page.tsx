import Link from "next/link";
import { ModuleShell } from "@/components/module-shell";
import styles from "./plano-de-acao.module.css";

const goals = [
  { rank: 1, goal: "Dropshipping", target: "5–10k", priority: "Alta", rationale: "Receita rápida e operação sem estoque próprio" },
  { rank: 2, goal: "Programação", target: "10–35k", priority: "Alta", rationale: "Habilidade reutilizável para produtos e serviços" },
  { rank: 3, goal: "Automação", target: "500–600", priority: "Média", rationale: "Reduz trabalho manual e custo operacional" },
  { rank: 4, goal: "Game Dev (empresa)", target: "100–500M", priority: "Baixa", rationale: "Projeto de longo prazo, dependente de capital e equipe" },
  { rank: 5, goal: "Sociologia, liderança e mecânica", target: "—", priority: "Baixa", rationale: "Habilidades complementares" },
  { rank: 6, goal: "Criação de produtos e venda", target: "1,5–3k", priority: "Média", rationale: "Fluxo de caixa adicional" },
  { rank: 7, goal: "Primeiros serviços: automação e sites", target: "—", priority: "Alta", rationale: "Gera receita, prova real e portfólio" },
  { rank: 8, goal: "Venda de usados", target: "—", priority: "Média", rationale: "Monetização de ativos existentes" },
  { rank: 9, goal: "Renda agressiva sem gastar", target: "—", priority: "Média", rationale: "Testes de aquisição e monetização sem capital inicial" },
  { rank: 10, goal: "Bots de automação", target: "—", priority: "Média", rationale: "Automação de processos repetitivos" },
] as const;

const tracks = [
  { title: "Dropshipping", text: "Validar oferta, fornecedor, margem e aquisição antes de escalar. Conectar com a operação Velsoren quando os gates comerciais estiverem aprovados." },
  { title: "Programação", text: "Transformar estudo em ativos vendáveis: sites, automações, integrações e ferramentas publicadas no ecossistema Wayne." },
  { title: "Automação", text: "Priorizar rotinas que removem cliques, registram evidências e possuem rollback ou confirmação antes de ações externas." },
  { title: "Game Dev", text: "Usar protótipos pequenos para validar mecânica, retenção e distribuição antes de qualquer estrutura empresarial maior." },
  { title: "Produtos digitais", text: "Criar templates, utilitários e materiais reutilizáveis; medir demanda antes de ampliar catálogo." },
  { title: "Primeiros serviços", text: "Usar Sites Wayne e automações como oferta inicial para gerar caixa e casos reais de portfólio." },
  { title: "Venda de usados", text: "Catalogar itens, padronizar anúncios e registrar preço mínimo aceitável para evitar venda abaixo do valor definido." },
  { title: "Afiliados", text: "Testar somente canais e programas compatíveis com as regras das plataformas, sem promessas de retorno." },
  { title: "Bots", text: "Começar por automações internas e tarefas de baixa criticidade; elevar autonomia apenas após logs e testes confiáveis." },
] as const;

export default function PlanoDeAcaoPage() {
  return (
    <ModuleShell
      active="/plano-de-acao"
      eyebrow="NEXUS • EXECUÇÃO"
      title="Plano de Ação — Metas de Alto Impacto"
      description="Painel integrado ao Nexus para transformar metas em prioridades, experimentos e próximos passos mensuráveis — com foco em baixo custo e execução verificável."
      action={<div className={styles.heroActions}><Link className="primary-button" href="/automacoes">Abrir Automações <span>→</span></Link><Link href="/servicos">Monetizar com serviços</Link></div>}
    >
      <section className={styles.summary} aria-label="Foco do plano">
        <article><span>FOCO 01</span><strong>Gerar caixa</strong><p>Serviços, produtos e operações que podem ser validados com recursos já disponíveis.</p></article>
        <article><span>FOCO 02</span><strong>Construir ativos</strong><p>Código, automações, portfólio e distribuição que continuam gerando valor após o primeiro trabalho.</p></article>
        <article><span>FOCO 03</span><strong>Escalar com gates</strong><p>Automatizar somente depois de validar qualidade, margem, segurança e rastreabilidade.</p></article>
      </section>

      <section className={styles.section} aria-labelledby="prioridades-title">
        <header><span>PRIORIZAÇÃO</span><h2 id="prioridades-title">Fila de execução</h2><p>Os valores abaixo são metas de referência importadas do plano original; não representam faturamento garantido.</p></header>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>#</th><th>Meta</th><th>Referência</th><th>Prioridade</th><th>Racional</th></tr></thead>
            <tbody>{goals.map((item) => <tr key={item.rank}><td>{String(item.rank).padStart(2, "0")}</td><td><strong>{item.goal}</strong></td><td>{item.target}</td><td><span className={`${styles.priority} ${styles[item.priority.toLowerCase() as "alta" | "média" | "baixa"]}`}>{item.priority}</span></td><td>{item.rationale}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="trilhas-title">
        <header><span>TRILHAS</span><h2 id="trilhas-title">Estratégia por área</h2><p>Cada trilha foi convertida em uma orientação operacional compatível com o ecossistema Nexus/Wayne.</p></header>
        <div className={styles.grid}>{tracks.map((track, index) => <article key={track.title}><em>{String(index + 1).padStart(2, "0")}</em><h3>{track.title}</h3><p>{track.text}</p></article>)}</div>
      </section>

      <section className={styles.execution} aria-labelledby="execucao-title">
        <div><span>PRÓXIMA AÇÃO</span><h2 id="execucao-title">Converta prioridade em experimento.</h2><p>Escolha uma meta de prioridade alta, defina uma entrega pequena, publique ou teste, registre o resultado e só então aumente automação ou investimento.</p></div>
        <ol><li><b>01</b><span>Escolher uma hipótese de receita</span></li><li><b>02</b><span>Construir a menor oferta funcional</span></li><li><b>03</b><span>Obter evidência real de demanda</span></li><li><b>04</b><span>Automatizar o que já funciona</span></li></ol>
      </section>

      <p className={styles.disclaimer}>Este módulo organiza metas e estratégias. Resultados financeiros dependem de execução, demanda, custos, regras das plataformas e condições de mercado.</p>
    </ModuleShell>
  );
}
