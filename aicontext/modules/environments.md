# Ambientes (`environments`)

## O que é

Página **Ambientes** (`/ambientes`, item do menu logo abaixo de "Agente Revisor") para gerenciar ambientes **Docker Compose** no **servidor** e no **PC** (pela conexão
do Builder Machine, nativo), com build e execução em máquinas diferentes por um **registry local**.

### Tela

- Lista (kit `src/components/list`) agrupada em **Servidor** e **PC** (máquina de execução). Cada
  ambiente mostra o estado (No ar / Parcial / Parado / Nunca implantado / Implantando), portas,
  serviços no ar, CPU/RAM (a lista é consultada a cada 10 s), onde foi o build e o último deploy
  (ref @ commit; clique abre o log).
- **Versão do app** em cada ambiente: lida do `package.json` do `WORKDIR` de cada container no ar
  (`docker exec <id> head -c 200000 package.json`, `containerVersionsCommand`/`parseContainerVersions`),
  com cache em memória **pelo id do container** (`{{.ID}}` no snapshot) — só roda de novo quando o
  compose recria o container. Uma versão só → `v1.44.0`; serviços com versões diferentes → por serviço
  (`app v1.44.0 · worker v1.40.0`); sem versão ao vivo (parado, imagem sem `package.json`), a do
  código do último deploy com sucesso, marcada "(implantada)" (`versionLabel`). Cada deploy também
  lê o `package.json` da pasta do ambiente depois de atualizar o código (`packageVersionCommand`;
  falha só deixa sem versão) e grava em `environment_deploys.version` e `environments.deployedVersion`.
- **Histórico de deploys** (botão **Histórico** em cada item, sempre disponível, inclusive durante um
  deploy): diálogo com os 30 últimos (`GET /api/environments/[id]/deploys`, guardados 90 dias), cada
  um com data/hora e "há X", duração (`formatDuration`; "em andamento" sem fim), tipo (Deploy/Mover),
  build → execução (PC ou servidor), resultado, ref @ commit, versão implantada, as marcas **Build
  reaproveitado** e **Recuperado após reinício** e o erro resumido. Clicar abre o log no drawer.
  Skeleton, vazio e erro com "Tentar novamente"; atualiza pelo tempo real e a cada 10 s.
- **Não gerenciados**: projetos do compose descobertos pelos labels
  (`com.docker.compose.project`, `…project.working_dir`, `…project.config_files`) nos dois Dockers,
  com **Adotar** (vale para pastas sem git: o redeploy só refaz o build). Ficam de fora: projetos
  dos ambientes, prévias das mesas (`AgenticWorkbench.composeProject`, `local_docker_previews`) e o
  registry. Apelidos e o builder não são projetos do compose.
- Ações: **Deploy/Redeploy** (central: "Última de <ref>" ou outra ref), **Levantar**, **Derrubar**,
  **Reiniciar** (otimistas, com reversão e toast), **Logs** (últimas 200 linhas no xterm),
  **Editar**, **Mover** (troca build/execução; aviso de volumes e de tempo fora do ar), **Apagar**
  (confirmação, opção de apagar os volumes; otimista).
- **Novo/Editar** (react-hook-form + `environmentInputSchema`): nome e slug (sugerido pelo nome);
  origem **central** (central, ref, arquivo compose, serviços, nome do projeto) ou adotado (só
  leitura + "git pull no redeploy" quando há git); variáveis extras **cifradas** (na edição o valor
  vazio mantém o salvo); portas; URL de saúde; **Build em** / **Executar em** (`OptionTabs`; PC
  desabilitado com o motivo quando o túnel está fechado).
- **Log do deploy ao vivo** num drawer com o xterm (NDJSON, pedaços da saída via
  `HostRunOptions.onOutput`), guardado em `environment_deploys`. Os passos, levantar/derrubar/
  reiniciar, o derrubar de Apagar e o `garbage-collect` rodam pelo **executor desacoplado** do
  Builder Machine (`detached: true`): o OpenCode descartar o shell no meio (diretório reciclado) não
  derruba o deploy. Logs e as leituras da descoberta usam `retryOnLost`. Se a conexão do log cair
  (o servidor reiniciou) ou o stream fechar sem o status final, o drawer mostra "Reconectando ao
  servidor…" e tenta de novo a cada 3 s por até 3 min **contados desde a queda** (uma conexão que
  volta a entregar eventos zera a contagem), redesenhando o log inteiro ao reconectar.
- **Deploy retomado depois de o app reiniciar** (ex.: o redeploy do próprio my-tasks, em que o
  `up -d` recria o container do app no meio do deploy):
  - Durante o deploy, a cada 5 s, o log e o sinal de vida (`heartbeatAt`, `runnerId` do processo) vão
    para o banco.
  - A fase de execução (`executionSteps`: derrubar a origem antes, os passos do deploy, derrubar a
    origem depois) grava um **ponto de retomada** (`checkpoint`: índice do passo, falha anterior,
    ref, commit, tag, versão, serviços com build, build reaproveitado, origem); cada passo roda num
    job desacoplado de **id fixo** (`envdeploy-<deployId>-<índice>`).
  - Deploy `running` com o sinal de vida vencido (> 60 s) ou sem ele é **reivindicado** de forma
    atômica (`findOneAndUpdate`; só um processo ganha) e retomado (`server/resume.ts` →
    `resumeDeploy`): com o ponto de retomada, o mesmo job é reencontrado no host (`jobId`), o deploy
    segue do passo salvo e termina normalmente (estado, `deployedOn`/commit/versão, log, Pusher), com
    `resumed: true`; falha real no passo continua falha, com a mensagem. Sem o ponto de retomada (o app
    reiniciou antes da fase de execução) ou com o PC indisponível, encerra como falha ("O deploy foi
    interrompido antes de subir (o app reiniciou). Tente de novo."). Nunca fica em "Implantando".
  - A retomada roda no tick do agendador (`runEnvironmentsTick`), na lista (no máximo a cada 10 s por
    processo, em segundo plano) e ao abrir o log de um deploy órfão (o stream passa a seguir o
    deploy retomado). Deploy com o sinal de vida recente (outro processo vivo) não é tocado: o stream
    manda o log gravado e fecha sem status, e o drawer reconecta.
  - Se a pasta do job sumiu entre o fim do passo e a gravação do índice seguinte, o passo roda de novo
    (`up -d`, saúde e repasses são idempotentes; um build repetido só custa tempo).
- **Lendo o compose**: a saída do `docker compose config` traz as variáveis já resolvidas (segredos)
  e **nunca vai para o log** nem para o debug; o log mostra só "Compose lido: N serviço(s): …" (na
  falha, só a última linha do erro, nunca o JSON).
- **Build reaproveitado**: com build e execução em máquinas diferentes e tag de commit, se todas as
  imagens `…:<commit>` já existem no Docker da máquina do build (`imagesExistCommand`), o passo de
  build é pulado (`skipBuild` em `deploySteps`) — uma nova tentativa depois de falha não refaz o
  build. Pastas sem git (tag de horário) sempre fazem o build; projeto **adotado** só reaproveita com
  a árvore limpa (`cleanTreeCommand`: `git status --porcelain`, inclusive arquivos não rastreados,
  fora o `.env.opex` e o override) — com alterações não commitadas o HEAD não descreve o código e
  o build é refeito ("Há alterações não commitadas na pasta").
- **Sem variáveis extras** o deploy apaga o `.env.opex` (`removeEnvFileCommand`): o compose usa o
  arquivo sempre que ele existe, e o de um deploy anterior não pode continuar valendo.
- **Configurações** (engrenagem): pasta base no servidor (`opex-envs`), porta do registry
  (`5050`, só `127.0.0.1`) e tags mantidas por ambiente (`5`). A conexão com o PC é a do Builder
  Machine.

### Agente Opex

Grupo de ferramentas **Ambientes** do Agente Opex **do dono** (`src/features/opex-agent/server/tools/environments.ts`, formatação pura em
`src/features/environments/opex-format.ts`), montado no registro do agente (`OPEX_TOOLS`). As ferramentas chamam os mesmos
serviços das rotas (`listEnvironments`, `createEnvironment`, `updateEnvironment`, `deleteEnvironment`,
`runEnvironmentAction`, `listDeploys`, `getDeploy`, `adoptProject`, configuração e registry), com a
mesma validação, auditoria, Pusher e erros.

- O ambiente é indicado por **id ou slug** (`resolveEnvironmentRef`).
- Leitura: `list_environments` (Servidor/PC, estado, portas, serviços no ar, versão, build, último
  deploy), `get_environment` (origem, máquinas, só os **nomes** das variáveis, URL de saúde,
  serviços), `get_environment_logs` (últimas linhas, até 200, sem ANSI), `list_environment_deploys`
  (30 últimos), `get_environment_deploy` (resumo + fim do log, o ao vivo do processo quando em
  andamento), `list_unmanaged_projects`, `get_environments_settings` (com o estado do registry).
- Escrita sem confirmação: `create_environment` (origem central; slug sugerido pelo nome, projeto =
  slug, ref `main`), `start_environment`.
- Com confirmação por padrão (`confirmByDefault`): `update_environment` (só os campos enviados; `env`
  é a lista completa, valor vazio mantém o salvo), `restart_environment`, `adopt_project`,
  `update_environments_settings`, `clean_environments_registry`.
- Destrutivas (confirmação): `deploy_environment` (sem `ref` = a ref salva; outra ref só na origem
  central), `move_environment` (a descrição manda avisar dos volumes e do tempo fora do ar; a saída
  traz `moveWarning`), `stop_environment`, `delete_environment` (`removeVolumes`).
- **Deploy/mover em segundo plano**: a ferramenta volta na hora com o `deployId`; o deploy grava
  `notifyOpexSessionId` e, no fim (`finishDeploy`, também no deploy retomado), `server/opex-notice.ts`
  manda à sessão um aviso `kind: "notice"` (resultado, duração, ref @ commit, versão, erro). Falha ao
  avisar só vai para o log. A limpeza do registry também roda em segundo plano e avisa no fim.
- **Segredos**: valores das variáveis nunca saem (só `envKeys`); em criar/editar o `redact` troca os
  valores por `[valor oculto]` no card e no histórico, o resumo da confirmação cita só as chaves e a
  entrada pendente fica cifrada. Os logs dos containers saem como na tela.

### Servidor

- **Origem central**: `git fetch origin --prune --tags` no repositório da central
  (`config.sessionDirectory`); a ref é resolvida para um commit nesta ordem: branch remota
  (`origin/<ref>`), tag (`refs/tags/<ref>`) ou commit; `git worktree add --detach
  ~/opex-envs/<slug> <sha>` na 1ª vez, depois `checkout --detach <sha>`.
- **Adotado**: usa o `working_dir` do label (no servidor ou no PC, pela conexão mestra). Com git,
  `git pull --ff-only` opcional; sem git, só o build. Adotado do PC fica no PC (build e execução).
- **Variáveis**: `.env.opex` gravado em base64 na pasta do ambiente (o debug mostra só "valores
  ocultos"), com `$` escapado como `$$` (o valor chega literal), passado por `--env-file` e
  `env_file` no override — caminho relativo à pasta do primeiro arquivo do compose (ex.:
  `deploy/docker-compose.yml` → `../.env.opex`).
- **Override** `docker-compose.opex.yml` (regravado a cada deploy; os comandos do compose só o
  incluem quando existe — um adotado ainda não implantado pelo app derruba/reinicia/apaga sem ele): `env_file` e, com build e
  execução em máquinas diferentes, `image: localhost:<porta>/opex-env/<slug>-<serviço>:<commit>`.
- Combinações (`pipeline.ts`, `deploySteps`):

| Build → Execução | Passos |
|---|---|
| Servidor → Servidor | build (fila global do build, `runExclusiveBuild`) → `up -d --no-build` |
| PC → PC | build com o contexto/builder do Builder Machine (trava própria do PC) → `up -d --no-build` → repasse das portas |
| PC → Servidor | build no PC → registry → `ssh -O forward -R` da porta do registry → `push` no PC → fecha o repasse → `pull` + `up` no servidor |
| Servidor → PC | build → registry → `push` → repasse `-R` → `pull` no PC → fecha o repasse → `up` no PC → repasse das portas |

  Sem serviço com `build`, não há registry. URL de saúde, quando informada, é esperada no fim.
- **Mover / trocar Executar em**: as máquinas novas só são gravadas depois de o deploy ser aceito
  (ambiente livre e PC alcançável); sem portas, implanta no destino e só então derruba a origem; com
  portas, derruba antes (aviso de tempo fora do ar). Volumes não migram.
- **Executar no PC** com os arquivos no servidor: `docker compose config` bloqueia bind mount e
  `develop.watch`, com a explicação.
- **Tick do agendador** (`runEnvironmentsTick`): com o túnel de volta (fechado → aberto, ou o 1º tick
  do processo), reabre os repasses das portas dos ambientes no PC.
- **Rotina** `environments-registry-cleanup` (diária às 04:00, nasce desligada): mantém as N últimas tags por ambiente (pelos deploys com sucesso) e roda o
  `garbage-collect` do registry. A tag da imagem implantada (`deployedCommit` e a do último deploy) e as
  dos deploys em andamento nunca são apagadas, e um ambiente sem nenhum deploy de sucesso conhecido
  (ex.: expirados pelo TTL de 90 dias) não perde nenhuma tag. O dono de cada repositório vem do registro exato dos deploys
  (`environment_deploys.repositories`, gravado nos deploys entre máquinas); sem registro, pelo
  prefixo `<slug>-` só quando um único slug casa (`repositoryOwner`) — com slugs de prefixo comum
  (`crm`/`crm-hml`) o repositório ambíguo fica de fora, nunca apaga tags de outro ambiente.
- Tempo real: evento `environments` no `private-app` com `{ id, change }`
  (`useEnvironmentsRealtime`). Auditoria: entidade `Ambiente` (sem valores de variáveis).
- Segurança: todo comando sai de `commands.ts` (puro) a partir de campos validados (slug, ref, caminho
  do compose relativo sem `..`, serviços, nome do projeto) ou passa por `quote`.

### Limitações

- O deploy só pode ser retomado a partir da fase de execução: reiniciar o app durante a preparação
  (código, variáveis, compose, build reaproveitado) encerra o deploy como falha, e é preciso
  implantar de novo.
- Volumes não migram ao mover. O registry não tem autenticação (só `127.0.0.1`).
- O repasse `-R` da porta do registry pela conexão mestra precisa estar liberado no SSH do servidor
  (padrão do OpenSSH).

### Portal do cliente (`/cliente/ambientes`)

- Item **Ambientes** no menu do portal (`clienteNav`), para **todos** os usuários do cliente; a página
  (`ClienteAmbientesPage`) lista os ambientes com estado ("No ar", "Parcial", "Parado", "Nunca
  implantado", "Implantando"), versão em execução (ou a implantada), ref, serviços no ar e quando foi o
  último deploy. Atualiza a cada 15 s e em tempo real.
- **Vínculo**: o cliente vê só ambientes de origem **central** cuja central (`AgenticCentral.projectId`)
  está em `client.projectIds`, conferido em **toda** requisição (`server/portal.ts`). Projetos
  **adotados** e ambientes de outro cliente nunca aparecem e respondem 404 nas ações.
- **Visão reduzida** (`PortalEnvironmentDto`, `toPortalEnvironment`): sem variáveis, máquinas,
  portas, caminhos, containers, CPU/RAM, commit, erro nem log do deploy.
- **Ações só do admin do cliente** (`assertClientAdmin`, 403 para os demais): **Implantar** (sempre a
  ref salva, sem trocar de ref nem de máquina), **Levantar** e **Reiniciar** — `POST
  /api/cliente/ambientes/[id]/actions` `{ action: "deploy" | "up" | "restart" }`, chamando
  `runEnvironmentAction` do dono (mesma fila global do build, bloqueio de deploy em andamento,
  auditoria `Ambiente` com o usuário do portal). Implantar e Reiniciar pedem confirmação; Levantar e
  Reiniciar ficam bloqueados em ambiente nunca implantado; tudo bloqueia durante um deploy. Resposta
  otimista no deploy (a linha vai para "Implantando") com reversão e toast em falha.
- **Tempo real**: cada `publishEnvironment` também publica `cliente-environments-updated` `{ id, change }`
  nos canais `private-client-{clientId}` dos clientes ativos vinculados ao repositório
  (`publishPortalEnvironment`; na exclusão a central vem do registro apagado). Adotados não avisam o
  portal. O portal invalida a lista (`usePortalEnvironmentsRealtime`).
- **Agente Opex do portal**: grupo **Ambientes** (`client-tools/environments.ts`):
  `list_environments` (todos) e `deploy_environment`*, `start_environment`, `restart_environment`*
  (admin; * = destrutiva, pede confirmação), pelos mesmos serviços do portal.

## Código

- `src/features/environments/`: `constants.ts`, `schemas.ts`, `types.ts`, `commands.ts`,
  `compose-config.ts`, `pipeline.ts`, `view.ts`, `opex-format.ts`, `components/` (tela do dono;
  `EnvironmentStatus.tsx` com o botão e os selos compartilhados com o portal), `hooks/`,
  `portal/` (página, linha e hooks do portal) e `server/` (`models`, `service`, `deploy`, `resume`,
  `hub`, `stream`, `forwards`, `registry`, `settings`, `opex-notice`, `portal`).
- Rotas: `src/app/api/environments/**` (dono), `src/app/api/cliente/ambientes/**` (portal); páginas
  `src/app/(app)/ambientes/` e `src/app/cliente/(portal)/ambientes/`.
- Integração: item em `APP_NAV`, tick no `runSchedulerTick` (`runEnvironmentsTick`), rotina
  `environments-registry-cleanup` (`catalog.ts` + `registerBuiltInJobs`), `runExclusiveBuild` na fila
  global do build (`agentic/server/build-queue.ts`), ferramentas no registro do Agente Opex do dono e do
  portal, `kind: "notice"` nas mensagens do Agente Opex (avisos de fim de deploy) e `readNdjson`
  (`src/lib/ndjson-client.ts`, log ao vivo do deploy).
- Dados: `environments`, `environment_deploys` (TTL de 90 dias), `environments_state`; auditoria
  `entidade: "Ambiente"`.
- Testes: `__tests__/features/environments/` (`commands`, `deploy`, `resume`, `environments-ui`,
  `opex-tools`, `portal`, `portal-ui`), `__tests__/features/agentic/build-queue.test.ts`
  (`runExclusiveBuild`), `__tests__/features/opex-agent/client-tools.test.ts` (grupo do portal).
