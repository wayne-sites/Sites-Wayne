# Sites Wayne / Nexus Brasil

Repositório principal do ecossistema Sites Wayne / Nexus Brasil.

## Estado atual do Nexus Worker

O Nexus Worker possui um runtime portátil e low-risk para Windows, Linux e macOS, com allowlist explícita para operações JSON/Markdown. Shell arbitrário, `child_process`, `eval`, Docker, browser automation e execução paga implícita permanecem bloqueados.

### Pairing v1

O backend do Pairing v1 está ativo no Supabase de produção:

- migration `nexus_worker_pairing_v1` aplicada;
- `nexus-worker-gateway` v2 ACTIVE;
- códigos `nxp1_...` são de uso único, expiram em até 10 minutos e têm somente SHA-256 persistido;
- o redeem gera um token `nxw1_...` novo e persiste somente o SHA-256 da credencial final;
- `anon` e `authenticated` não possuem EXECUTE direto nas RPCs de pairing;
- `service_role` é o executor das RPCs;
- o gateway mantém autenticação própria para heartbeat/claim/finish e só aceita `pair` sem bearer quando o código temporário é válido.

Na aplicação Next.js, Pairing fica disponível automaticamente apenas em deployments Vercel Preview (`VERCEL_ENV=preview`). Em Production, a criação via Studio continua fechada até `NEXUS_WORKER_PAIRING_V1=1` estar configurado e o runtime correspondente ser publicado. Isso permite E2E físico em Preview sem transformar a PR em release.

### Gates ainda pendentes

- primeiro worker físico real online;
- E2E real Studio → pairing → heartbeat → enqueue → artifact → audit;
- rollout coordenado do Builder RPC hardening;
- sandbox e revisão explícita antes de habilitar ferramentas de maior risco;
- merge/release somente após aprovação explícita.

Consulte `workers/nexus-worker/README.md` para instalação, verificação de integridade e execução local.
