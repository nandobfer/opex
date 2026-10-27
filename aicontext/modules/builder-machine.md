# Módulo: Builder Machine (prévias no Docker do PC por túnel SSH)

Tira o build e o container das prévias do servidor de desenvolvimento e os leva para o Docker do PC
do dono (WSL, Docker Engine). Com o **túnel aberto** a prévia vai para o PC; com ele **fechado**,
tudo continua no servidor como antes. Na interface chama-se **Builder Machine** (integração
`builder_machine`); os ids internos (pasta `src/features/local-docker/`, coleções `local_docker_*`,
rotas `/api/local-docker/*`, evento `local-docker-updated`) seguem `local-docker`. Portado do beta
`local-docker` do My Tasks (OPE-87, bloco 7), sem sistema de betas: a ativação é da própria integração.

## ⚠️ Exceção arquitetural (regra de Ambientes)

No desenvolvimento agêntico, tudo o que mexe no ambiente da prévia (docker compose, portas, limpeza)
é feito **pelos agentes**, em turnos da sessão da mesa. A Builder Machine é a exceção: o **túnel SSH**
e a infraestrutura do PC vivem **fora dos agentes**. O app dispara comandos `ssh`/`docker` no **host do
OpenCode** pelo shell do OpenCode (`client.shell.create` sem diretório, `server/shell.ts` — `runOnHost`),
com debug na integração (comandos com segredo aparecem mascarados por `redactedAs`). Os comandos vêm
só de `src/features/local-docker/commands.ts` (funções puras; valores variáveis validados pelo schema
ou passados por `quote`), nunca de texto livre. O **build** continua sendo do agente Build: ele roda
no host com o prefixo `DOCKER_CONTEXT=opex-local BUILDX_BUILDER=<builder>` em todo comando docker da
prévia; o `docker` do servidor lê o worktree e envia o contexto ao BuildKit do PC.

## Ativação

- Campo público **"Integração ativa"** (`active`, `boolean`, padrão `false`) da integração
  `builder_machine` (`src/lib/integrations/catalog.ts`). Sem `env`. Segredo `sshPrivateKey`
  (`group: "card"`, só pela aba Preparo do PC).
- `src/features/local-docker/server/active.ts`: `isBuilderMachineActive()` (`getIntegrationConfig`
  → `active === true`; erro → `false`) e `assertBuilderMachineActive()` (404
  `BUILDER_MACHINE_INACTIVE`, pt-BR). Desativada: todas as rotas `/api/local-docker/*` respondem 404,
  a rotina de limpeza e a conferência do túnel não fazem nada, o build das mesas fica no servidor, o
  teste periódico de status **pula** a integração e o "Testar conexão" devolve aviso "Integração
  desativada".
- A integração **aparece sempre** na lista e em `/integracoes/builder_machine` (para poder ativá-la).
  Desativada, a página mostra só **Geral** + card **Ativação** ("Integração ativa") e as abas
  bloqueadas ("Ative a integração e salve…"); a configuração do PC nem é carregada.
- **Ativar** (transição desligada → ligada, `updateIntegration`) roda o gancho de ativação
  (`src/features/integrations/services/enable-hooks.ts`, `INTEGRATION_ENABLE_HOOKS`, depois de gravar
  e auditar; falha só é logada e não desfaz): `onBuilderMachineEnabled` liga a rotina
  `builder-machine-cleanup` em Integrações › Crons.
- **Desativar com prévias no PC deixa os containers lá** (o código não alcança mais o PC): a tela
  avisa ao desligar; apague-as antes na aba Túnel.

## Como funciona

- O servidor não alcança o PC pela VPN. Por isso, no modo **Túnel de controle** (padrão), o PC
  mantém o serviço `opex-control-tunnel` (autossh no WSL) que publica o SSH do PC numa porta do
  servidor (`-R 2222:localhost:22`). No modo **Direto** (rede sem VPN, WSL com rede espelhada) o
  servidor entra pelo IP do PC.
- **Chave do servidor** (`~/.ssh/opex_local_ed25519` no host do OpenCode): **gerar** cria uma nova no
  host (a privada nunca sai de lá); **inserir existente** recebe uma chave privada OpenSSH sem senha,
  grava no host por base64 (comando com o debug mascarado) e guarda a privada **cifrada** no segredo
  `sshPrivateKey`, de onde é regravada se o host for refeito (`ensureKeyOnHost`, antes de abrir o
  túnel e de testar). Gerar apaga esse segredo. O banco guarda a pública (vai no script do WSL), a
  origem e a impressão digital; a tela **nunca** recebe a chave, só "Chave configurada" e a impressão
  digital. Trocar pede confirmação.
- **Abrir túnel**: conexão mestra SSH iniciada pelo servidor (`ssh -f -N -M -S ~/.ssh/opex-local.ctl`)
  que traz o socket do Docker do PC para `~/.opex-local-docker.sock` e o contexto do Docker
  `opex-local`. **Fechar**: `ssh -O exit`. Fechar com prévias no ar no PC responde 409
  `LOCAL_DOCKER_PREVIEWS_RUNNING` e a tela pede confirmação (`confirm: true`).
- **Porta da prévia**: reservada na faixa da central como sempre, pulando as portas ocupadas no PC
  (`ss -Htln` pela conexão mestra) e no servidor (`allocatePreviewPort(..., target.portCheck)`). Ao
  subir, o servidor repassa a porta (`ssh -O forward -L 0.0.0.0:<porta>:localhost:<porta>`): o teste
  de saúde e o "Abrir prévia" continuam em `<host da prévia>:<porta>`. O aviso da mesa ganha o sufixo
  "(prévia na máquina local)".
- **Troca de máquina entre builds**: a prévia anterior sai antes (no servidor por label do compose;
  no PC pelo registro em `local_docker_previews`).
- **Prévia no GitHub Action** (`previewMethod: "github"`): sempre no servidor; se a prévia anterior da
  mesa estava no PC, ela é derrubada (`resolveBuildTarget({ forceServer: true })`). O card da
  central fica oculto nesse método.
- **Limpeza** (merge, exclusão, tentar a limpeza de novo): a prévia que está no PC é derrubada pela
  Builder Machine e o agente pula o `docker compose down`. Com o túnel fechado ela fica **pendente**
  e sai quando o túnel reabrir.
- **Rotina do túnel** (fim de cada tick do agendador, no máximo 1×/min): se o dono deixou o túnel
  aberto e ele caiu (PC reiniciado, VPN), tenta reabrir; publica a mudança no Pusher.
- **Preparar o Docker do PC** (reconciliação **por diferença**, só nos containers de ambiente — nunca
  nas prévias): rede externa dos compose (`docker_default`); **apelidos de rede** (`alpine/socat` com o
  alias `devteam-mongo` etc. repassando para `<endereço do servidor>:<porta>`, nome
  `<prefixo><nome>` — prefixo padrão `opex-alias-` — e os labels `opex.builder-machine=env`, `.role`,
  `.alias`, `.target`, `.network`): igual e rodando = mantém, parado = levanta, novo/alterado/sem label
  = (re)cria, fora da lista = remove; **builder dedicado** (`docker-container`, `default-load=true`,
  limites opcionais de memória e CPU): recriado com `--keep-state` (mantém o cache) só quando os
  limites mudam (`builderApplied`). Resultado passo a passo em `lastPrepare`.
- **Salvar a configuração** com o túnel aberto e o PC já preparado aplica a diferença sozinho
  (`reconcileAfterSave`): um apelido novo sobe sem mexer nos demais.
- **Containers do PC** (aba Túnel): prévias (projetos registrados em `local_docker_previews`) e os de
  ambiente (apelidos e `buildx_buildkit_<builder>0`), com CPU/RAM do `docker stats --no-stream`
  atualizados a cada 10 s; outros containers não aparecem nem podem ser tocados. Ações: levantar e
  derrubar (otimistas, com reversão e toast), recriar (prévia: `up -d --force-recreate --no-build
  <serviço>` no worktree da mesa) e **apagar com o ambiente** (confirmação; prévia = containers,
  volumes, redes e imagens + cancela o repasse + tira o registro; apelido = container e imagem do
  socat; builder = `buildx rm`, apaga o cache).
- **Rotina de limpeza** `builder-machine-cleanup` (Integrações › Crons, diária às 03:00, nasce
  desligada; ligada pela ativação): `docker image prune -f` e `docker buildx prune --builder
  <builder> -f --max-used-space <teto>gb` (teto padrão 20 GB). Integração desativada ou túnel fechado:
  não faz nada. Com a integração desativada a rotina some da aba Rotinas (`INTEGRATION_CRON_JOBS` +
  `hiddenJobIds`; continua salva).
- **Fila do build** continua única (um build local por vez em todo o app).
- **Forks não usam a Builder Machine**: só o build **da mesa** passa por ela (o marcador de nova
  prévia do fork do My Tasks não foi portado); um `docker compose` rodado por um fork vai para o
  Docker do servidor.

## Tela

- **`/integracoes/builder_machine`**: status, **Testar conexão** (SSH do PC, túnel e Docker do PC) e
  **Debug** (cada comando no host com o resultado). Ativa, página em abas (`?aba=`):
  1. **Túnel do Docker do PC** (`tunel`, padrão): situação (abrir/fechar, conferir), passos pendentes
     com atalho, **Containers de prévia** e **Containers de ambiente** com as ações acima.
  2. **Conexão com o PC** (`conexao`): Geral (ambiente, debug), **Ativação**, a chave global "Usar o PC
     quando o túnel estiver aberto" e o modo (`OptionTabs` com tooltip por opção: Túnel de controle /
     Direto pelo IP); só os campos do modo aparecem.
  3. **Docker do PC** (`docker`): builder dedicado (contexto, nome, memória, CPUs, teto do cache), rede
     e apelidos.
  4. **Preparo do PC** (`preparo`): chave (gerar nova / inserir existente), preparo do WSL (passo a
     passo recolhido ou **Gerar o script** com **Copiar**/**Baixar** `opex-pc.sh`; rede espelhada só
     no modo Direto) e Docker do PC (testar, preparar, último preparo).
  Salvar grava a configuração do PC e o Geral da integração. Obrigatórios: usuário do WSL; no modo
  túnel, como o PC acessa o servidor; no direto, o IP; com apelidos, o endereço do servidor.
- Central › aba **Ambiente**: card **Builder Machine** (`OptionTabs` Padrão global / Sempre que aberto
  / Nunca, salva na hora, otimista), oculto com a integração desativada ou com a prévia no GitHub
  Action.

## APIs (só o dono; sem OpenAPI; todas 404 com a integração desativada)

| Rota | Descrição |
|---|---|
| `GET/PUT /api/local-docker/settings` | Configuração, situação da chave e último preparo |
| `POST /api/local-docker/key` | `{action: "generate"}` ou `{action: "import", privateKey}`; nunca devolve a chave |
| `GET /api/local-docker/bootstrap?mirrored=1` | Script único do WSL (`opex-pc.sh`) |
| `GET /api/local-docker/manual?mirrored=1` | Passo a passo manual do preparo |
| `GET /api/local-docker/status` | Confere o PC, o túnel e o Docker; prévias no PC |
| `POST /api/local-docker/tunnel` | `{action: "open" \| "close", confirm?}` (409 `LOCAL_DOCKER_PREVIEWS_RUNNING`) |
| `POST /api/local-docker/machine` | `{action: "test" \| "prepare"}` |
| `GET /api/local-docker/containers` | Containers de prévia e de ambiente com CPU/RAM |
| `POST /api/local-docker/containers/[name]` | `{action: start \| stop \| recreate \| delete, confirm?}` |
| `GET/PUT /api/local-docker/centrals/[id]` | Sobrescrita da central `{mode: inherit \| on \| off}` |

Tempo real: `local-docker-updated` (`{ kind }`) em `private-app`. Auditoria: entidade `MaquinaLocal`.

## Dados

- `local_docker_state` (documento `key: "default"`: `settings`, `publicKey`, `keySource`,
  `keyFingerprint`, `builderApplied`, `lastPrepare`, `wantOpen`, `lastSeenOpen`, `lastCheckAt`,
  `updatedAt`, `updatedBy`); `local_docker_central_overrides` (`centralId`, `mode`);
  `local_docker_previews` (`workbenchId`, `centralId`, `composeProject`, `port`, `pendingTeardown`,
  `createdAt`). Índices garantidos no primeiro uso (`localDockerDb`).
- Integração `builder_machine` (`active`, segredo `sshPrivateKey`) e a rotina `builder-machine-cleanup`.
- Host do OpenCode: `~/.ssh/opex_local_ed25519` (+ `.pub`), `~/.ssh/opex_local_known_hosts`,
  `~/.ssh/opex-local.ctl`, `~/.opex-local-docker.sock`, contexto `opex-local`, builder
  `opex-local-builder` (nomes padrão).
- PC (WSL): `openssh-server`/`autossh`, a chave em `~/.ssh/authorized_keys`,
  `/etc/systemd/system/opex-control-tunnel.service`, `systemd=true` em `/etc/wsl.conf`,
  `vmIdleTimeout=-1` (e `networkingMode=mirrored`) no `%USERPROFILE%\.wslconfig`, a rede, os apelidos,
  o BuildKit e as imagens das prévias.

## Limitações

- Compose que monta arquivos do worktree (bind mount, `develop.watch`) não funciona no PC.
- Host key do PC trocada (WSL reinstalado): apague a linha em `~/.ssh/opex_local_known_hosts` no host.
- Desativar com prévias no PC deixa os containers lá.
- A chave inserida passa uma vez pelo shell do OpenCode (base64) ao ser gravada no host.

## Testes

`__tests__/features/local-docker/{commands,tunnel,builder-machine,local-docker-ui}.test.ts(x)`;
ativação e health em `__tests__/features/integrations/{integration-service,health-check-queue}.test.ts`;
build na Builder Machine em `__tests__/features/agentic/{workflow-preview-backup,prompts,environment-section}.test.ts(x)`.
