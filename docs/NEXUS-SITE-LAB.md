# Laboratório privado de sites

Rota: `/studio/wayne/SiteLab`. Exige sessão Nexus e papel `owner` consultado no servidor em `crm_admins`. O mesmo controle protege o Manager, a API de templates e o Vault. Ocultar links é apenas apresentação; páginas e APIs verificam a autorização.

## Funcionamento

Uma geração concluída em `/api/builder` pode registrar uma cópia do manifesto original e uma revisão separada. Projetos do owner entram automaticamente. Outros criadores precisam marcar a autorização opcional no Builder, desmarcada por padrão. Podem consultar e remover suas cópias internas no próprio Builder. A autorização não transfere propriedade nem permite publicação ou revenda.

O motor local determinístico preenche idioma PT-BR, título, descrição e viewport quando ausentes, além de isolar links em nova aba sem `rel`. Preserva os arquivos originais e as informações existentes. Idioma, textos alternativos e resultados comerciais exigem revisão humana. Não há chamada adicional a IA na revisão; a geração original continua usando a configuração existente do Builder.

O painel compara original e revisão, apresenta verificações objetivas, permite copiar arquivos e baixar o manifesto JSON. O preview remove código ativo, navegação e recursos externos e usa CSP e iframe sandbox. Por isso não representa o funcionamento completo do site. Não há publicação automática.

Somente novas gerações autorizadas desse endpoint entram no laboratório. Não há coleta de sites externos, importação retroativa, clonagem de contas, credenciais ou bases de clientes. Outros fluxos de geração precisam de integração explícita.

## Persistência e acesso

Migration aplicada: `20260913213812_nexus_site_lab_v1.sql`. A tabela `nexus_site_reviews` usa RLS e não concede leitura, exclusão ou execução da RPC a `anon` ou `authenticated`. As rotas usam a service role somente no servidor. A RPC valida autorização e deduplica por criador, hash do original e versão do motor. A service role não pode atualizar snapshots existentes.

A remoção filtra pelo criador autenticado e pelo ID; conhecer o ID de outra conta não permite apagar a cópia. A listagem retorna os 100 registros mais recentes. Uma falha de persistência informa que a cópia não foi salva e preserva o site gerado.

Essa privacidade cobre os dados do laboratório e o acesso às funções no aplicativo. Código já publicado em um repositório público continua público. Uma cópia já baixada pelo owner não pode ser retirada remotamente do computador dele.

## Validação

- `npm run verify`: 139 testes aprovados, TypeScript e build aprovados; ESLint sem erros, com dez avisos preexistentes.
- `tests/site-lab.test.mjs`: preservação do original, revisão idempotente, estrutura incompleta, preview isolado e presença das barreiras de acesso.
- `scripts/verify-site-lab-sql.mjs`: autorização, deduplicação, imutabilidade, remoção por criador e bloqueio de acesso direto. Executar com `PGLITE_MODULE_PATH` apontando para `@electric-sql/pglite/dist/index.js`.
- Banco remoto: RLS e permissões verificadas; teste transacional revertido sem resíduo.
- Fluxo autenticado no navegador pendente: a proteção Vercel do preview impediu acesso. Build aprovado não substitui esse teste nem declara o site pronto para o público.
