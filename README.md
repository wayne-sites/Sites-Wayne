# Sites Wayne — NEXUS BRASIL

Mega portal digital brasileiro construído com Next.js, TypeScript e Tailwind CSS. O projeto reúne descoberta, vídeos, inteligência artificial, comunidades, marketplace, educação e jogos em uma experiência única.

## O que já está implementado

- homepage premium e totalmente responsiva;
- área comercial Sites Wayne com pacotes, recorrência e briefing local;
- configurador Autopilot com três modelos fixos e prévia ao vivo;
- checkout Mercado Pago, confirmação por webhook e publicação automática;
- página de acompanhamento do pedido e monitoramento técnico diário;
- busca global, tema claro/escuro e notificações;
- Nexus Watch com catálogo, busca, detalhes e provedores do TMDB pelo servidor;
- autenticação Supabase por senha, recuperação, OAuth opcional e cookies HttpOnly;
- marketplace com produtos publicados no banco, carrinho e preço recalculado no PostgreSQL;
- relay StarkIA por conexão de saída, pareamento com token de uso único e fila auditável;
- páginas de explorar, Nexus IA, comunidades, cursos, jogos e planos;
- API server-side preparada para um provedor de IA configurável;
- PWA instalável, metadados, sitemap, robots e páginas legais;
- schema PostgreSQL/Supabase com relacionamentos, índices e políticas RLS;
- layout estabilizado, sem animações que causem tremor no celular.

Cada integração fica desligada por feature flag até credenciais, migrations e homologação estarem completas. A ausência de uma credencial isola somente o módulo correspondente; não existe resposta de sucesso fictícia. Realtime, uploads e analytics ainda não foram ativados.

O botão direto da área de serviços usa o contato comercial público do Sites Wayne. A variável `NEXT_PUBLIC_WHATSAPP_NUMBER`, somente com números e código do país, pode substituir esse contato em outro ambiente. O diagnóstico gera código do lead, referência de investimento, prazo, origem e mensagem pronta sem armazenar dados no servidor.

## Rodar no computador

Requisitos: Node.js 22.13 ou superior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

## Verificações

```bash
npm run lint
npm run typecheck
npm test
npm run build
# ou execute tudo:
npm run verify
```

O GitHub Actions executa esse conjunto em cada pull request e também verifica possíveis segredos e vulnerabilidades críticas de dependências.

## Publicar na Vercel

1. Entre na Vercel e escolha **Add New → Project**.
2. Importe o repositório `wayne-sites/Sites-Wayne`.
3. O framework será identificado automaticamente como Next.js.
4. Copie as variáveis necessárias de `.env.example` para as configurações do projeto.
5. Publique primeiro com todas as feature flags em `false`.
6. Configure e teste cada integração em ambiente Preview antes de ativar a flag em produção.

## Supabase

A migration inicial está em `supabase/migrations/202608100001_initial_nexus_schema.sql`. O Autopilot usa `202608170001_wayne_autopilot.sql`; o hardening usa `202608170002_security_hardening.sql`; Watch, pedido transacional do marketplace e relay StarkIA usam `202608170003_integrations.sql`. Aplique-as na ordem. Cadastre administradores pelo painel seguro do Supabase; não existe senha administrativa fixa no código.

## Ativar os módulos Nexus

1. Aplique as quatro migrations no Supabase e configure URL, anon key e service role na Vercel.
2. Teste cadastro, confirmação de e-mail, login, recuperação e RLS; depois defina `AUTH_ENABLED=true`.
3. Para um portal de renda, obtenha a autorização/licença comercial aplicável do TMDB, registre `TMDB_COMMERCIAL_APPROVED=true`, configure um logo oficial aprovado e o token Read Access; só então defina `NEXUS_WATCH_ENABLED=true`.
4. Cadastre produtos reais com status `published`, homologue o Checkout Pro e o webhook do Mercado Pago e só então defina `MARKETPLACE_ENABLED=true`.
5. Instale o worker de relay compatível no computador StarkIA, gere `STARKIA_RELAY_SECRET` com alta entropia, pareie um dispositivo em `/automacoes` e só então defina `STARKIA_ENABLED=true`.

Nunca coloque `TMDB_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `STARKIA_RELAY_SECRET` ou token de dispositivo em variáveis `NEXT_PUBLIC_*`.

## Ativar o Wayne Autopilot

1. Execute as quatro migrations no Supabase, na ordem dos nomes.
2. Configure na Vercel `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Crie uma aplicação no Mercado Pago e configure `MERCADO_PAGO_ACCESS_TOKEN`.
4. Cadastre o webhook de pagamentos apontando para `/api/mercado-pago/webhook` e configure `MERCADO_PAGO_WEBHOOK_SECRET` com a assinatura secreta exibida pelo Mercado Pago.
5. Use `MERCADO_PAGO_TEST_MODE=true` durante a homologação; altere para `false` somente após testar o fluxo completo.
6. Configure `CRON_SECRET` para proteger a verificação diária definida em `vercel.json`.

O sistema só publica depois de consultar o pagamento na API do Mercado Pago e validar identificador do pedido, valor e moeda. O nome e o e-mail do comprador não são publicados; somente o conteúdo explicitamente autorizado para o site.

## Operação e saúde

- `GET /api/health`: informa checks e feature flags efetivamente prontas, sem revelar credenciais.
- `GET /api/maintenance`: execução protegida pelo `CRON_SECRET` para verificar sites publicados.
- falhas externas usam timeout; retries são aplicados somente a leituras seguras.
- logs server-side são JSON e removem campos com nomes sensíveis.

A arquitetura verificada está em `docs/ARCHITECTURE.md`; a auditoria P0/P1 está em `docs/AUDIT-2026-08-17.md`.

## Segurança

- chaves secretas ficam somente no servidor;
- pagamentos reais devem usar conta pertencente a alguém legalmente autorizado;
- nunca envie access token, service-role key ou segredo do webhook por chat;
- nunca armazene dados de cartão;
- revise RLS, LGPD e documentos legais antes do lançamento comercial;
- mantenha integrações financeiras no ambiente de testes durante o desenvolvimento;
- o relay StarkIA é uma conexão HTTPS de saída; nunca publique a porta 8765 do bridge local.

## Estrutura

```text
app/                 páginas, API, SEO e PWA
components/          interface e módulos interativos
config/site.ts       nome e identidade centralizados
public/              ícones e service worker
supabase/migrations/ banco PostgreSQL e RLS
docs/                arquitetura e auditoria técnica
.env.example         variáveis necessárias
```
