export const prompts = [
  [
    "Achar nicho Roblox",
    "Liste hipóteses de nichos Roblox, público, dor, concorrência e plano de validação. Não invente demanda, saturação ou estatísticas. Separe hipóteses de evidências.",
  ],
  [
    "Criar oferta",
    "Crie nome, promessa limitada ao que entregamos, mecanismo, diferenciais e justificativa de preço. Use Promessa → Mecanismo → Prova. Não invente prova social nem garantia financeira.",
  ],
  [
    "Bio que converte",
    "Escreva três bios com público, benefício concreto e chamada para ação. Use linguagem simples e nenhuma prova social inventada.",
  ],
  [
    "Semana de conteúdo",
    "Crie cinco posts: dor, desejo, objeção, mecanismo e prova disponível. Inclua título, conteúdo e CTA. Planeje o ciclo descobrir → experimentar → voltar → indicar.",
  ],
  [
    "Copy WhatsApp",
    "Escreva uma mensagem curta para contato que consentiu, usando dor, proposta, objeção e convite sem pressão. Não envie a mensagem.",
  ],
  [
    "Landing Page",
    "Crie título, problema, mecanismo, entrega, evidências disponíveis, objeções e CTA. Não invente escassez, depoimentos, preço ou resultados.",
  ],
] as const;
export function marketingDraft(index: number, brief: string) {
  if (!prompts[index]) throw Error("Prompt inválido");
  return `# ${prompts[index][0]}\n\n## Contexto\n${brief}\n\n## Instrução pronta para o motor de IA\n${prompts[index][1]}\n\n## Rascunho local\nPúblico: criadores Roblox que precisam validar um protótipo.\nDor: retrabalho e falta de métricas confiáveis.\nProposta: um gênero, uma entrega testável, um registro de resultado.\nMecanismo: Wayne Tree + validação no servidor + Vault.\nProva: inserir somente testes e resultados reais.\nPróxima ação: escolher uma hipótese e medir uma sessão de teste.\n\nRascunho determinístico, sem chamada a LLM.`;
}
