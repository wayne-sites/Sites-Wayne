# Nexus Worker

Runtime portátil e low-risk do Nexus Brasil para Windows, Linux e macOS.

## Requisitos

- Node.js 22.13 ou superior.
- Uma credencial `nxw1_...` ou um código temporário `nxp1_...` gerado no Nexus Studio.
- Gateway HTTPS do Nexus Worker. HTTP só é aceito em loopback local para desenvolvimento.

## Verificar o pacote

Antes de instalar ou iniciar, execute:

```bash
node verify.mjs
```

O comando confere `SHA256SUMS`, o manifest, a lista de ferramentas e as capabilities allowlisted. Se qualquer arquivo distribuído tiver sido alterado, a verificação falha fechada.

## Instalar e iniciar

O instalador verifica o pacote antes da cópia, instala apenas no perfil do usuário, salva somente o endereço do gateway em `gateway.url`, verifica novamente o destino e pode iniciar o worker imediatamente. Nenhuma credencial é salva.

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

O launcher solicita interativamente um token `nxw1_` ou um código temporário `nxp1_`. Quando recebe `nxp1_`, troca o código no gateway por um token final somente em memória, apaga a variável de pareamento e então executa o Nexus Doctor.

## Provar o primeiro worker físico

A versão `0.3.2-preview` inclui um fluxo de prova sanitizado e verificável pelo backend. Ele verifica a integridade, solicita o segredo sem colocá-lo no histórico, executa o Doctor, envia um heartbeat real e imprime apenas metadados seguros. O token e o código de pareamento não são exibidos.

### Windows

```powershell
.\prove.ps1
```

### Linux / macOS

```bash
./prove.sh
```

Saída esperada:

```text
[NEXUS PROOF] OK proof=<uuid>
[NEXUS PROOF] protocol=1 node=<versao> platform=<plataforma> transport=supabase-edge
[NEXUS PROOF] runtime=json:ok markdown:ok shell:blocked
[NEXUS PROOF] heartbeat=200 backend=verifiable credential=redacted
```

O launcher gera um `proofId` UUID não secreto por sessão. Esse marcador é acrescentado ao `reported_name` enviado nos heartbeats e, portanto, pode ser confirmado depois no backend sem armazenar ou revelar a credencial. Enquanto o worker permanecer nessa sessão, heartbeats posteriores preservam o mesmo `proofId`.

Depois da prova, o mesmo processo inicia o worker normal mantendo a credencial apenas em memória. O `prove` não faz `claim` automaticamente, para não retirar jobs reais da fila sem intenção explícita. Para executar somente a prova e sair, defina `NEXUS_WORKER_PROVE_ONLY=1` antes de chamar o launcher.

## Pairing v1

O backend de Pairing v1 está ativo no Nexus Worker Gateway. O código `nxp1_` tem 96 bits de aleatoriedade, validade máxima de 10 minutos e uso único. O banco guarda somente SHA-256 do código; na troca, o gateway gera o token final `nxw1_`, persiste apenas o SHA-256 desse token e devolve o segredo bruto uma única vez ao processo do worker.

A interface de Pairing está habilitada no Preview da PR atual; a UI de Production continua dependente da publicação controlada da versão correspondente do Nexus.

## Autostart

Autostart desassistido permanece bloqueado nesta versão. Ativá-lo exigiria persistir a credencial do worker; isso só será liberado quando houver integração explícita com armazenamento seguro do sistema operacional. `-EnableAutostart` / `--enable-autostart` falham fechados.

## Configuração local

`gateway.url` é criado durante a instalação e contém somente o endpoint HTTPS, não a credencial. Ele é configuração local mutável e, por isso, não faz parte do `SHA256SUMS` do pacote.

## Runtime permitido

Ferramentas: `nexus-json`, `nexus-markdown`.

Capabilities: `data.json.validate`, `data.json.format`, `document.markdown.normalize`, `document.markdown.inspect`.

Shell, `child_process`, `eval`, Docker e browser automation permanecem bloqueados. O worker não instala ferramentas externas e não executa tarefas pagas implicitamente.
