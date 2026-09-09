# Nexus Worker

Runtime portátil e low-risk do Nexus Brasil para Windows, Linux e macOS.

## Requisitos

- Node.js 22.13 ou superior.
- Uma credencial `nxw1_...` gerada no Nexus Studio.
- Gateway HTTPS do Nexus Worker. HTTP só é aceito em loopback local para desenvolvimento.

## Verificar o pacote

Antes de instalar ou iniciar, execute:

```bash
node verify.mjs
```

O comando confere `SHA256SUMS`, o manifest, a lista de ferramentas e as capabilities allowlisted. Se qualquer arquivo distribuído tiver sido alterado, a verificação falha fechada.

## Instalar e iniciar

O instalador verifica o pacote antes da cópia, instala apenas no perfil do usuário, salva somente o endereço do gateway em `gateway.url`, verifica novamente o destino e pode iniciar o worker imediatamente. O token `nxw1_` não é salvo.

### Windows PowerShell

```powershell
.\install.ps1 -GatewayUrl "https://SEU-PROJETO.supabase.co/functions/v1/nexus-worker-gateway" -Start
```

Destino padrão: `%LOCALAPPDATA%\NexusWorker`.

### Linux / macOS

```bash
bash ./install.sh --gateway 'https://SEU-PROJETO.supabase.co/functions/v1/nexus-worker-gateway' --start
```

Destino padrão no Linux: `${XDG_DATA_HOME:-~/.local/share}/nexus-worker`. No macOS: `~/Library/Application Support/NexusWorker`.

O launcher solicita o token de forma interativa, executa o Nexus Doctor e só então inicia o worker.

## Autostart

Autostart desassistido permanece bloqueado nesta versão. Ativá-lo exigiria persistir a credencial do worker; isso só será liberado quando houver integração explícita com armazenamento seguro do sistema operacional. `-EnableAutostart` / `--enable-autostart` falham fechados.

## Configuração local

`gateway.url` é criado durante a instalação e contém somente o endpoint HTTPS, não a credencial. Ele é configuração local mutável e, por isso, não faz parte do `SHA256SUMS` do pacote.

## Runtime permitido

Ferramentas: `nexus-json`, `nexus-markdown`.

Capabilities: `data.json.validate`, `data.json.format`, `document.markdown.normalize`, `document.markdown.inspect`.

Shell, `child_process`, `eval`, Docker e browser automation permanecem bloqueados. O worker não instala ferramentas externas e não executa tarefas pagas implicitamente.
