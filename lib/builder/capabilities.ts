export type BuilderCapabilityCategory =
  | "Estrutura"
  | "Design"
  | "UX"
  | "Acessibilidade"
  | "SEO"
  | "Performance"
  | "Segurança"
  | "Conteúdo"
  | "Conversão"
  | "Qualidade";

export type BuilderCapability = {
  id: string;
  category: BuilderCapabilityCategory;
  label: string;
  description: string;
  instruction: string;
  recommended: boolean;
};

export const BUILDER_CAPABILITY_CATEGORIES: BuilderCapabilityCategory[] = [
  "Estrutura",
  "Design",
  "UX",
  "Acessibilidade",
  "SEO",
  "Performance",
  "Segurança",
  "Conteúdo",
  "Conversão",
  "Qualidade",
];

const rawCapabilities = [
  ["semantic-html","Estrutura","HTML semântico","Use elementos semânticos como header, nav, main, section, article e footer quando fizer sentido.",true],
  ["section-hierarchy","Estrutura","Hierarquia de seções","Organize a página em seções claras, com ordem lógica e separação visual consistente.",true],
  ["responsive-grid","Estrutura","Grid responsivo","Use grid/flex responsivo que se adapte sem overflow a telas pequenas e grandes.",true],
  ["reusable-patterns","Estrutura","Padrões reutilizáveis","Repita padrões de componentes e classes em vez de duplicar estilos desnecessariamente.",false],
  ["anchor-navigation","Estrutura","Navegação por âncoras","Quando houver página longa, use navegação interna por âncoras com destinos válidos.",false],
  ["complete-footer","Estrutura","Rodapé completo","Inclua rodapé útil com identidade, navegação secundária e informações relevantes.",true],
  ["no-dead-links","Estrutura","Sem links mortos","Não gere links internos apontando para destinos inexistentes ou hrefs quebrados.",true],
  ["balanced-density","Estrutura","Densidade equilibrada","Evite blocos vazios demais ou informação espremida; mantenha ritmo visual consistente.",false],
  ["empty-states","Estrutura","Estados vazios","Quando houver listas ou painéis, inclua estado vazio compreensível e acionável.",false],
  ["local-data-model","Estrutura","Modelo de dados local","Para apps estáticos, mantenha dados locais estruturados e fáceis de editar.",false],
  ["premium-visual","Design","Visual premium","Aplique acabamento visual profissional, evitando aparência genérica de template.",true],
  ["visual-hierarchy","Design","Hierarquia visual","Diferencie título, subtítulos, corpo, ações e informações auxiliares com clareza.",true],
  ["typography-scale","Design","Escala tipográfica","Use escala tipográfica consistente e legível em desktop e mobile.",true],
  ["spacing-system","Design","Sistema de espaçamento","Use espaçamentos coerentes baseados em poucos valores recorrentes.",true],
  ["color-contrast","Design","Contraste de cores","Garanta contraste legível entre texto, fundo, bordas e estados interativos.",true],
  ["card-system","Design","Sistema de cards","Quando houver cards, mantenha estrutura, padding, borda e estados consistentes.",false],
  ["button-system","Design","Sistema de botões","Padronize ações primárias, secundárias e discretas com estados hover/focus.",true],
  ["micro-interactions","Design","Microinterações","Use microinterações leves e úteis, sem depender de animações pesadas.",false],
  ["dark-mode-ready","Design","Compatível com dark mode","Estruture variáveis e contrastes para facilitar suporte a tema escuro.",false],
  ["brand-consistency","Design","Consistência de marca","Mantenha cores, voz, formas e tratamento visual coerentes com a identidade solicitada.",true],
  ["mobile-first","UX","Mobile first","Projete primeiro para telas pequenas e expanda progressivamente para telas maiores.",true],
  ["sticky-cta","UX","CTA persistente","Quando adequado, mantenha uma ação principal facilmente acessível durante a navegação.",false],
  ["clear-navigation","UX","Navegação clara","Use rótulos previsíveis, ordem lógica e navegação simples de entender.",true],
  ["progressive-disclosure","UX","Revelação progressiva","Não mostre complexidade desnecessária de uma vez; revele detalhes conforme o contexto.",false],
  ["form-feedback","UX","Feedback de formulário","Forneça validação, instrução e feedback visual para campos e ações de formulário local.",true],
  ["loading-states","UX","Estados de carregamento","Quando houver processamento local perceptível, exiba estado de carregamento claro.",false],
  ["error-states","UX","Estados de erro","Inclua mensagens de erro úteis, específicas e com caminho de recuperação.",true],
  ["success-states","UX","Estados de sucesso","Confirme ações concluídas com feedback visual objetivo.",false],
  ["keyboard-flow","UX","Fluxo por teclado","Mantenha ordem de foco lógica e interações funcionais sem mouse.",true],
  ["touch-targets","UX","Alvos de toque","Garanta botões e links confortáveis para toque em dispositivos móveis.",true],
  ["landmarks","Acessibilidade","Landmarks","Use regiões semânticas para facilitar navegação por tecnologia assistiva.",true],
  ["heading-order","Acessibilidade","Ordem de headings","Mantenha hierarquia de h1 a h6 sem saltos arbitrários.",true],
  ["alt-text","Acessibilidade","Textos alternativos","Toda imagem informativa deve ter alt significativo; decorativas devem ser tratadas como tal.",true],
  ["aria-labels","Acessibilidade","ARIA quando necessário","Adicione nomes acessíveis apenas onde a semântica nativa não for suficiente.",true],
  ["focus-visible","Acessibilidade","Foco visível","Todo controle interativo deve ter foco de teclado claramente visível.",true],
  ["reduced-motion","Acessibilidade","Movimento reduzido","Respeite prefers-reduced-motion e evite movimento essencial à compreensão.",true],
  ["form-labels","Acessibilidade","Labels de formulário","Associe labels reais aos campos e não dependa apenas de placeholder.",true],
  ["skip-link","Acessibilidade","Link pular conteúdo","Em páginas com navegação extensa, ofereça atalho para o conteúdo principal.",false],
  ["color-independent","Acessibilidade","Não dependa só de cor","Estados e significados devem usar texto, ícone ou forma além de cor.",true],
  ["language-attribute","Acessibilidade","Idioma do documento","Defina corretamente o atributo lang no documento HTML.",true],
  ["title-meta","SEO","Título SEO","Inclua title específico, conciso e relevante ao conteúdo.",true],
  ["meta-description","SEO","Meta description","Inclua descrição meta útil, natural e coerente com a proposta da página.",true],
  ["canonical-ready","SEO","Canonical pronto","Estruture o head para receber URL canônica real sem inventar domínio.",false],
  ["open-graph-ready","SEO","Open Graph","Inclua metadados sociais apenas com placeholders seguros quando não houver URL real.",false],
  ["twitter-card-ready","SEO","Twitter Card","Prepare metadados de compartilhamento sem inventar ativos externos inexistentes.",false],
  ["structured-data","SEO","Dados estruturados","Quando aplicável, inclua JSON-LD válido com dados não inventados ou claramente exemplificados.",false],
  ["semantic-content","SEO","Conteúdo semântico","Use títulos, parágrafos, listas e seções que expressem a estrutura real do conteúdo.",true],
  ["internal-links","SEO","Links internos","Conecte seções relevantes com links internos úteis e funcionais.",false],
  ["natural-keywords","SEO","Palavras-chave naturais","Use termos do briefing naturalmente, sem keyword stuffing.",true],
  ["crawlable-content","SEO","Conteúdo rastreável","Mantenha conteúdo principal no HTML, sem depender de JavaScript para existir.",true],
  ["minimal-js","Performance","JavaScript mínimo","Use JavaScript apenas quando acrescentar valor real à experiência.",true],
  ["defer-js","Performance","JS não bloqueante","Evite trabalho síncrono desnecessário no carregamento inicial.",true],
  ["optimized-css","Performance","CSS enxuto","Evite regras redundantes, seletores excessivos e estilos não utilizados óbvios.",true],
  ["system-fonts","Performance","Fontes do sistema","Prefira pilhas de fontes locais/sistema para evitar dependências externas.",true],
  ["no-external-deps","Performance","Sem dependências externas","Não carregue frameworks, bibliotecas, fontes ou scripts de terceiros.",true],
  ["lazy-media","Performance","Mídia preguiçosa","Quando houver mídia não crítica, use loading lazy e dimensões adequadas.",false],
  ["small-dom","Performance","DOM enxuto","Evite wrappers e elementos repetidos sem necessidade.",false],
  ["efficient-events","Performance","Eventos eficientes","Use poucos listeners, evite handlers redundantes e operações caras por evento.",false],
  ["bounded-storage","Performance","Storage limitado","Quando usar localStorage, limite volume e use chaves previsíveis.",true],
  ["animation-budget","Performance","Animação econômica","Prefira transform/opacity e poucas animações simultâneas.",false],
  ["no-secrets","Segurança","Sem segredos","Nunca inclua chaves, tokens, credenciais ou exemplos que pareçam segredos reais.",true],
  ["no-eval","Segurança","Sem eval","Não use eval, Function constructor ou execução dinâmica equivalente.",true],
  ["no-inline-handlers","Segurança","Sem handlers inline","Prefira addEventListener a onclick/onchange inline quando houver JavaScript.",true],
  ["sanitize-input","Segurança","Entrada segura","Trate texto fornecido pelo usuário como texto, evitando inserção HTML não confiável.",true],
  ["no-external-forms","Segurança","Formulários locais","Não envie dados a endpoints externos; simule ou processe localmente quando necessário.",true],
  ["no-third-party-scripts","Segurança","Sem scripts terceiros","Não injete analytics, ads, widgets ou scripts remotos.",true],
  ["safe-external-links","Segurança","Links externos seguros","Quando target=_blank for inevitável, use rel=noopener noreferrer.",true],
  ["local-only-storage","Segurança","Dados só locais","Persistência gerada deve ficar local, salvo se o briefing e backend real existirem explicitamente.",true],
  ["no-dangerous-downloads","Segurança","Sem downloads perigosos","Não gere executáveis, scripts de sistema ou downloads autoexecutáveis.",true],
  ["csp-friendly","Segurança","CSP-friendly","Evite padrões que dificultem uma Content Security Policy restritiva.",false],
  ["clear-copy","Conteúdo","Texto claro","Use frases diretas, específicas e fáceis de escanear.",true],
  ["pt-br-copy","Conteúdo","Português brasileiro","Quando o briefing estiver em português, use pt-BR natural e consistente.",true],
  ["benefit-led-copy","Conteúdo","Benefícios primeiro","Apresente valor e benefícios antes de detalhes secundários.",true],
  ["faq-section","Conteúdo","FAQ útil","Quando fizer sentido comercial, inclua FAQ com dúvidas reais e respostas objetivas.",false],
  ["testimonials-placeholders","Conteúdo","Depoimentos seguros","Se precisar de prova social sem dados reais, identifique claramente como exemplo/placeholders.",true],
  ["pricing-clarity","Conteúdo","Preços claros","Se houver preços no briefing, organize planos e condições sem inventar cobranças.",false],
  ["contact-clarity","Conteúdo","Contato claro","Destaque como entrar em contato sem inventar telefone, e-mail ou endereço.",true],
  ["legal-placeholders","Conteúdo","Campos legais","Use placeholders explícitos para dados legais ausentes em vez de inventá-los.",true],
  ["realistic-content","Conteúdo","Conteúdo plausível","Evite métricas, clientes, certificações e resultados inventados apresentados como fatos.",true],
  ["editable-content","Conteúdo","Conteúdo fácil de editar","Centralize textos e exemplos de forma legível para futuras alterações.",false],
  ["hero-cta","Conversão","CTA no hero","Inclua uma ação principal coerente logo na primeira dobra quando o projeto for comercial.",true],
  ["secondary-cta","Conversão","CTA secundário","Ofereça alternativa de menor compromisso quando fizer sentido.",false],
  ["trust-signals","Conversão","Sinais de confiança","Use sinais de confiança verificáveis ou placeholders claramente marcados.",true],
  ["social-proof","Conversão","Prova social","Estruture espaço para prova social sem fabricar avaliações ou números.",false],
  ["ethical-urgency","Conversão","Urgência ética","Evite contadores falsos e escassez inventada; use urgência apenas se sustentada pelo briefing.",true],
  ["objection-handling","Conversão","Quebra de objeções","Antecipe dúvidas comuns com benefícios, FAQ ou comparações honestas.",false],
  ["pricing-comparison","Conversão","Comparação de planos","Quando houver planos, torne diferenças e escolha recomendada fáceis de entender.",false],
  ["low-friction-contact","Conversão","Contato sem fricção","Reduza etapas desnecessárias para o usuário chegar à ação principal.",true],
  ["mobile-cta","Conversão","CTA mobile","Garanta que a ação principal continue visível e confortável no mobile.",true],
  ["conversion-hierarchy","Conversão","Hierarquia de conversão","Mantenha uma ação primária dominante e evite múltiplos CTAs concorrentes.",true],
  ["readme","Qualidade","README completo","Sempre documente objetivo, arquivos, execução e limitações do projeto.",true],
  ["code-comments","Qualidade","Comentários úteis","Comente apenas trechos não óbvios; evite comentários redundantes.",false],
  ["consistent-naming","Qualidade","Nomes consistentes","Use convenções consistentes para classes, IDs, variáveis e funções.",true],
  ["no-console-errors","Qualidade","Sem erros de console","Evite referências ausentes, seletores inválidos e operações que gerem erros óbvios.",true],
  ["progressive-enhancement","Qualidade","Progressive enhancement","Conteúdo e ações essenciais devem continuar compreensíveis sem JavaScript.",true],
  ["offline-friendly","Qualidade","Amigável offline","Não dependa da rede para layout, fontes ou conteúdo essencial.",true],
  ["print-friendly","Qualidade","Impressão legível","Quando aplicável, evite que estilos tornem o conteúdo ilegível ao imprimir.",false],
  ["no-broken-assets","Qualidade","Sem assets quebrados","Não referencie imagens, fontes ou arquivos que não foram gerados.",true],
  ["browser-compatible","Qualidade","Compatibilidade ampla","Prefira APIs web estáveis e inclua fallback simples quando necessário.",true],
  ["self-audit","Qualidade","Autoauditoria","Inclua no README uma checklist curta de acessibilidade, segurança, performance e conteúdo.",true],
] as const;

export const BUILDER_CAPABILITIES: BuilderCapability[] = rawCapabilities.map(
  ([id, category, label, instruction, recommended]) => ({
    id,
    category,
    label,
    description: instruction.replace(/\.$/, ""),
    instruction,
    recommended,
  }),
);

export const RECOMMENDED_BUILDER_CAPABILITY_IDS = BUILDER_CAPABILITIES
  .filter((item) => item.recommended)
  .map((item) => item.id);

const capabilityById = new Map(BUILDER_CAPABILITIES.map((item) => [item.id, item] as const));

export function normalizeBuilderCapabilities(value: unknown) {
  if (!Array.isArray(value)) return RECOMMENDED_BUILDER_CAPABILITY_IDS;
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && capabilityById.has(item)) unique.add(item);
    if (unique.size >= BUILDER_CAPABILITIES.length) break;
  }
  return [...unique];
}

export function buildBuilderCapabilityPrompt(ids: string[]) {
  return ids
    .map((id) => capabilityById.get(id))
    .filter((item): item is BuilderCapability => Boolean(item))
    .map((item) => `- [${item.category}] ${item.instruction}`)
    .join("\n");
}
