# Gate de produção da autenticação — 21/08/2026

Este documento separa o que o repositório consegue provar do que depende de um projeto Supabase, SMTP e deployment reais. Um build `Ready` não comprova entrega de e-mail, políticas do painel, cookies no domínio final nem RLS com usuários reais.

## Decisão sobre a PR #4

A PR #4 (`agent/supabase-auth`) permanece em rascunho, parte do commit antigo `dc5cd93` e conflita com o `main`. Ela contém a versão vulnerável de `safeNextPath()` e o `no-store` global citados na revisão. Essa implementação foi substituída pela autenticação integrada depois na PR #9 e não deve ser mesclada nem ter suas migrations executadas.

O hardening atual foi feito sobre o `main` a partir de `352a15d`:

- `safeNextPath()` decodifica repetidamente, normaliza, rejeita `\\`, controles, fragmentos e hosts externos;
- somente `/conta` é aceito como destino pós-login;
- o `proxy` atua apenas em `/conta` e `/entrar`;
- `private, no-store` fica restrito a `/conta`, às páginas/respostas de autenticação sensíveis à sessão e às APIs privadas;
- páginas públicas não recebem esse header pelo proxy;
- senhas novas exigem de 12 a 128 caracteres no frontend e nas APIs;
- falhas de callback, refresh, login, recuperação e logout geram eventos sem e-mail, senha ou token;
- chamadas do navegador têm timeout e não fingem logout quando a confirmação falha.

## Testes automatizados

```bash
npm ci
npm run verify
```

`verify` executa lint, TypeScript, testes unitários e um E2E com a aplicação Next em produção contra um provedor Supabase simulado. O E2E cobre:

- cadastro e política de senha;
- URL exata de confirmação;
- resposta neutra da recuperação e URL exata de redefinição;
- login e cookies `HttpOnly`, `Secure` e `SameSite=Lax`;
- callback com consentimento;
- renovação de token expirado;
- redefinição, senha antiga recusada e senha nova aceita;
- logout e expiração local dos cookies;
- visitante redirecionado de `/conta`;
- bloqueio de redirects externos e com barra invertida;
- ausência de `private/no-store` na homepage pública.

Esse teste valida o código de ponta a ponta, mas não substitui a homologação com Supabase e SMTP reais.

Depois de criar uma conta confirmada somente para staging, execute o smoke test contra o provedor real. Passe os valores por variáveis locais/secretas do CI; nunca grave a senha no repositório:

```bash
AUTH_STAGING_BASE_URL=https://SEU-STAGING \
AUTH_STAGING_EMAIL=EMAIL-DE-TESTE \
AUTH_STAGING_PASSWORD='SENHA-DE-TESTE' \
npm run test:e2e:auth:staging
```

Esse smoke test real cobre login, sessão, rota protegida, cookies, logout e cache. Cadastro, abertura da confirmação, recebimento da recuperação e troca de senha continuam na homologação manual abaixo porque dependem da caixa de e-mail real.

## Gate protegido no GitHub

O workflow `.github/workflows/auth-staging-smoke.yml` permite executar a parte automatizada da homologação somente por `workflow_dispatch`, depois que o arquivo existir na branch padrão.

Configure um GitHub Environment chamado `auth-staging`:

- variável `AUTH_STAGING_BASE_URL` apontando para a URL HTTPS de staging;
- secrets `AUTH_STAGING_EMAIL` e `AUTH_STAGING_PASSWORD` de uma conta exclusiva de teste;
- aprovação obrigatória e restrição de branches, quando o plano do repositório permitir;
- nenhuma credencial compartilhada com Production.

O workflow falha quando falta configuração e recusa explicitamente `https://sites-wayne.vercel.app`, evitando que o smoke test de staging seja executado contra a produção. Ele não cria conta, não altera migrations e não ativa `AUTH_ENABLED`.

## Data API e privilégios explícitos

Projetos Supabase novos podem criar tabelas em `public` sem exposição automática à Data API. RLS define quais linhas podem ser acessadas, mas não substitui os privilégios SQL de tabela.

Antes de homologar, consulte somente leitura:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Se os privilégios necessários estiverem ausentes:

1. confirme primeiro quais migrations já existem no banco remoto;
2. gere uma migration nova com `supabase migration new expose_required_data_api_tables`;
3. conceda somente `select`, `insert`, `update` ou `delete` realmente exigidos por cada fluxo;
4. não use `grant all` como atalho;
5. repita os testes com usuário A, usuário B e anônimo.

Referência: [Tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Banco Supabase

Não cole todas as migrations no SQL Editor sem antes descobrir o estado do banco.

1. Crie um backup verificável se o projeto já tiver dados.
2. Use a mesma referência de projeto prevista para staging e consulte o histórico:

```bash
supabase migration list --linked
supabase db dump --linked --schema public --file supabase-before-auth-schema.sql
supabase db dump --linked --schema public --data-only --use-copy --file supabase-before-auth-data.sql
```

3. Compare os registros remotos com `supabase/migrations/`. Se o banco não nasceu desse histórico, faça `db pull`/diff numa branch e revise o SQL antes de reparar qualquer versão.
4. Somente num projeto realmente vazio, aplique na ordem:

```text
202608100001_initial_nexus_schema.sql
202608170001_wayne_autopilot.sql
202608170002_security_hardening.sql
202608170003_integrations.sql
```

5. A migration `202608100002_auth_hardening.sql` pertence à PR #4 obsoleta e não faz parte do `main`; não a execute separadamente.
6. Confirme o trigger com uma consulta somente leitura:

```sql
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_statement
from information_schema.triggers
where trigger_name = 'on_auth_user_created';
```

7. Em staging, crie dois usuários comuns e confirme:

- cada cadastro cria exatamente um registro em `public.profiles`;
- `role = 'user'` e `is_suspended = false`;
- um usuário não altera `role`, reputação, suspensão, pagamentos ou pedidos;
- um usuário não lê dados privados do outro;
- service role nunca é usada no navegador.

## Supabase Auth e e-mail

Mantenha `AUTH_ENABLED=false` até todos os itens abaixo passarem:

- confirmação obrigatória de e-mail ativada;
- `Site URL`: `https://sites-wayne.vercel.app`;
- redirects de produção exatos:
  - `https://sites-wayne.vercel.app/auth/callback`
  - `https://sites-wayne.vercel.app/redefinir-senha`
- redirects locais exatos:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/redefinir-senha`
- staging cadastrado com URLs exatas e separado de produção;
- curingas `/**` removidos quando não forem indispensáveis;
- expiração de OTP/link revisada;
- senha mínima configurada como 12 também no painel;
- requisitos de caracteres e proteção contra senhas vazadas ativados conforme o plano;
- SMTP próprio configurado com remetente do domínio;
- SPF, DKIM e DMARC verificados;
- templates de confirmação e recuperação revisados em português;
- limites de envio e proteção contra abuso revisados.

Referências oficiais: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Password security](https://supabase.com/docs/guides/auth/password-security) e [Password-based Auth/SMTP](https://supabase.com/docs/guides/auth/passwords).

## Vercel

- Node fixado na linha 22 por `package.json` e `.nvmrc`;
- `NEXT_PUBLIC_APP_URL` definida com a origem HTTPS exata do ambiente;
- `NEXT_PUBLIC_SUPABASE_URL` configurada;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configurada (a anon legada continua aceita por compatibilidade);
- `SUPABASE_SERVICE_ROLE_KEY` ausente do escopo de autenticação e nunca exposta como `NEXT_PUBLIC_*`;
- projeto/chaves de Preview separados de Production quando possível;
- `AUTH_ENABLED=true` primeiro em staging/Preview;
- redeploy feito depois de salvar variáveis;
- bundle e logs inspecionados para confirmar ausência de segredos.

A Vercel disponibiliza apenas versões principais do Node; o range `>=22.13.0 <23` mantém o projeto na linha 22. Referência: [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Homologação real obrigatória

Use um e-mail de teste controlado e nunca envie senha ou token pelo chat.

- [ ] criar conta em staging;
- [ ] receber e abrir a confirmação;
- [ ] confirmar o perfil criado e o papel `user`;
- [ ] entrar e abrir `/conta`;
- [ ] atualizar a página e abrir uma nova aba;
- [ ] aguardar/forçar expiração e confirmar refresh;
- [ ] solicitar recuperação;
- [ ] definir uma senha nova;
- [ ] confirmar que a senha antiga falha;
- [ ] fazer logout e confirmar que `/conta` volta a redirecionar;
- [ ] testar link inválido e expirado;
- [ ] testar desktop e celular;
- [ ] testar Chrome, Edge e Firefox;
- [ ] verificar eventos da Vercel e logs/auditoria do Supabase sem dados sensíveis;
- [ ] confirmar homepage e páginas públicas cacheáveis;
- [ ] registrar o deployment anterior para rollback.

Somente após a lista inteira passar, ative `AUTH_ENABLED=true` em Production. Até lá, o módulo deve continuar fechado e não pode ser descrito como autenticação de produção validada.
