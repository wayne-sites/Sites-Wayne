# WAYNE Manager no Nexus Studio

Acesso: `/studio/wayne/CodeGenerator`, usando o mesmo login Nexus. O Studio contém um acesso direto ao Manager. As outras rotas são `/studio/wayne`, `/studio/wayne/GameDetail?id=RNG_Brainrot`, `/studio/wayne/JarvisOS`, `/studio/wayne/WayneMarketing`, `/studio/wayne/AIArsenal` e `/studio/wayne/AR-Future`.

## Integração

- Sete gêneros Luau originais e configuração validada no servidor. Gerar persiste um projeto Nexus por gênero, arquivos versionados em `nexus_artifacts`, execução em `nexus_tool_runs`, audit e registro Markdown no Vault.
- Estado e Vault privados por usuário, aproveitando a autenticação Supabase existente. A RPC é acessível somente pelo servidor. Escritas são transacionais e revisões concorrentes retornam conflito, sem perder alterações.
- Cinco skills determinísticas: gerar Roblox, métricas, inbox, plano e Vault. Marketing gera seis rascunhos, sem enviar mensagens nem chamar API paga.
- Exportação Markdown dos últimos 50 registros para uso no Obsidian. O Vault do Nexus fica na conta; não sincroniza automaticamente o disco do Bodhi.
- Dashboard, Config Editor, planejamento de Gamepasses, players e logs preparados; nenhum número de receita é inventado. Métricas são informadas pelo usuário.
- Arsenal com 120 referências e seleção Wayne Stack. Nenhum segredo é armazenado no catálogo; conexões com provedores não são declaradas ativas.
- Voz exige reconhecimento comprovadamente local no navegador. Permissão de microfone limitada à rota JarvisOS; demais rotas preservam a política existente.

## Banco

Migration `20260912035949_nexus_wayne_manager_v1.sql`, registrada e aplicada no Supabase `sites-wayne-production`. O timestamp do arquivo corresponde à versão registrada pela plataforma. Requer Nexus Core já existente. Acrescenta `nexus_wayne_state`, `nexus_wayne_vault` e RPC, reutilizando projetos e artefatos existentes.

RLS habilitado; leitura limitada ao proprietário; clientes não podem gravar diretamente nem invocar a RPC. A service role permanece somente no servidor. Não há credenciais novas exigidas para a geração.

## Verificação

- Build e TypeScript aprovados. 128 testes aprovados, incluindo seis grupos de testes Wayne.
- ESLint sem erros; dez avisos anteriores nos componentes de autenticação e home.
- `scripts/verify-wayne-sql.mjs` valida no PGlite: geração atômica, versões, rejeição de revisão antiga, rollback, isolamento entre donos e bloqueio de anon/browser. Executar com `PGLITE_MODULE_PATH` apontando para uma instalação de `@electric-sql/pglite`.
- Banco remoto: RPC executada como service_role em transação de teste, com Vault e arquivos Luau verificados e rollback integral. RLS e permissões confirmados.
- Não executado: Roblox Studio, voz em hardware real, APIs de provedores, sincronização automática do Vault local, ingestão de players/logs Roblox, compras de Gamepass e publicação de jogos.
- Verificação visual automatizada indisponível neste ambiente: inicialização do agent-browser falhou e o download do Chromium expirou. Nenhuma captura visual de sucesso é alegada.

## Uso

1. Entre no Nexus e abra Studio → WAYNE Manager.
2. Escolha RNG Brainrot e clique em Gerar e salvar no Vault.
3. Abra Jarvis OS para conferir o registro. Volte ao Studio para ver o projeto persistido.
4. Use Config Editor para alterações e gere novamente para registrar uma nova versão.

Uma geração salva não publica um jogo e não transfere os dados já existentes no computador para a nuvem.
