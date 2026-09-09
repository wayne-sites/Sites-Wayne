# Nexus Worker

Runtime portátil e low-risk do Nexus Brasil para Windows, Linux e macOS.

## Requisitos

- Node.js 22.13 ou superior.
- Uma credencial `nxw1_...` gerada no Nexus Studio.
- `NEXUS_WORKER_GATEWAY_URL` HTTPS ou `NEXUS_BASE_URL` HTTPS. HTTP só é aceito em loopback local para desenvolvimento.

## Verificar o pacote

Antes de iniciar, execute:

```bash
node verify.mjs
```

O comando confere `SHA256SUMS`, o manifest, a lista de ferramentas e as capabilities allowlisted. Se qualquer arquivo do pacote tiver sido alterado, a verificação falha fechada.

## Iniciar

### Windows PowerShell

```powershell
$env:NEXUS_WORKER_GATEWAY_URL="https://SEU-PROJETO.supabase.co/functions/v1/nexus-worker-gateway"
.\start.ps1
```

### Linux / macOS

```bash
export NEXUS_WORKER_GATEWAY_URL='https://SEU-PROJETO.supabase.co/functions/v1/nexus-worker-gateway'
./start.sh
```

O launcher solicita o token de forma interativa quando `NEXUS_WORKER_TOKEN` não está definido, executa o doctor e só então inicia o worker.

## Runtime permitido

Ferramentas: `nexus-json`, `nexus-markdown`.

Capabilities: `data.json.validate`, `data.json.format`, `document.markdown.normalize`, `document.markdown.inspect`.

Shell, `child_process`, `eval`, Docker e browser automation permanecem bloqueados neste pacote. O worker não instala ferramentas externas e não executa tarefas pagas implicitamente.
