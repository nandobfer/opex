# Ambientes (`environments`)

## O que é

Página **Ambientes** (`/ambientes`, no grupo **Configurações** do menu, junto de Integrações) para gerenciar ambientes **Docker Compose** no **servidor** e no **PC** (pela conexão
do Builder Machine, nativo), com build e execução em máquinas diferentes por um **registry local**.

### Tela

- **Builder do servidor** (OPE-186): card fixo **acima** dos grupos Servidor/PC (`components/builder/`), para o
  builder do buildx do Docker do servidor (o `buildx_buildkit_<nome>0` do `docker stats`). Ver "Builder do
  servidor" abaixo.
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
- **Novo/Editar** (react-hook-form; `environmentCreateSchema` no Novo, `environmentInputSchema` no Editar): nome e slug
  (sugerido pelo nome); seletor **Origem** (`OptionTabs`) com **Central**, **Compose gerenciado** e **Projeto adotado**
  (desabilitado no Novo: vem de **Adotar**; o seletor inteiro fica travado no Editar e o servidor recusa trocar a origem,
  422 `ENVIRONMENT_SOURCE_LOCKED`). Central: central, ref, arquivo compose, serviços, nome do projeto. Compose
  gerenciado: nome do projeto, serviços e, só no Novo, o editor do `docker-compose.yml` (ver "Compose gerenciado").
  Adotado: só leitura + "git pull no redeploy" quando há git; variáveis extras **cifradas**, com os valores à
  vista (ver "Variáveis extras no formulário"); portas; URL de saúde; **Build em** / **Executar em** (`OptionTabs`; PC
  desabilitado com o motivo quando o túnel está fechado).
- **Variáveis extras no formulário** (OPE-175):
  - Em **Editar**, os valores salvos são lidos à parte (`GET /api/environments/[id]/env`, só o dono,
    `readEnvValues`: decifra um a um; o que falhar volta `null`) e aparecem legíveis no campo **Valor**
    (`useEnvironmentEnvValues`: lidos a cada abertura e tirados do cache ao fechar, fora do prefixo
    que o tempo real invalida). Enquanto carrega, skeleton no lugar das linhas; com erro, aviso com
    "Tentar novamente" e **Salvar** bloqueado (nunca grava vazio por cima do salvo). Variável cujo valor
    não pôde ser lido vai com `keep: true` (mantém o salvo) até o dono digitar outro valor.
  - Pela tela (`PUT`, `emptyKeepsSaved: false`), apagar o valor e salvar grava **vazio**; remover a
    linha remove a variável. Em **Novo ambiente** os campos começam vazios.
  - **Importar** (ao lado de **+ Variável**): menu com **Importar .env** (seletor de arquivos, sem filtro
    de extensão, até 1 MB, lido como texto; o campo é zerado para o mesmo arquivo poder ser importado de
    novo) e **Importar texto** (diálogo com campo grande, sem `<form>` próprio). Mesma leitura nos dois
    (`parseEnvText`, `env-import.ts`): um `CHAVE=VALOR` por linha; linhas em branco e as que começam
    com `#` (com ou sem espaços antes) são ignoradas sem contar; `#` no meio do valor é conteúdo; o
    valor é tudo depois do primeiro `=`, sem os espaços das pontas, e um par de aspas (`"` ou `'`) que
    envolve o valor inteiro sai (o miolo fica literal, sem escapes nem `${}`); linha sem `=` ou com
    nome fora do formato do campo **Nome** conta como ignorada.
  - O resultado é *upsert* na lista do formulário (`upsertEnvVars`): a que existe é atualizada (chave
    repetida no conteúdo: vale a última, conta como atualizada), a nova entra no fim, nenhuma sai; toast
    "N variável(is) adicionada(s), M atualizada(s), K linha(s) ignorada(s)". Sem linha aproveitável:
    aviso "Nenhuma variável encontrada" e a lista intacta. Nada é gravado antes de **Salvar**; **Cancelar**
    descarta o importado.
  - Portal do cliente e ferramentas do Agente Opex não mudam: sem valores (ver "Agente Opex").
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
  fora o `.env.opex`, o override e os arquivos de variáveis do compose **vazios e não rastreados** de
  dentro da pasta, que são os que o app cria) — com alterações não commitadas o HEAD não descreve o
  código e o build é refeito ("Há alterações não commitadas na pasta"). Um arquivo de variáveis com
  conteúdo, ou rastreado e alterado, continua contando como alteração.
- **Sem variáveis extras** o deploy apaga o `.env.opex` (`removeEnvFileCommand`): o compose usa o
  arquivo sempre que ele existe, e o de um deploy anterior não pode continuar valendo.
- **Configurações** (engrenagem): pasta base no servidor (`opex-envs`), porta do registry
  (`5050`, só `127.0.0.1`) e tags mantidas por ambiente (`5`). A conexão com o PC é a do Builder
  Machine.

### Compose gerenciado (OPE-191)

Terceira origem (`source.kind: "managed"`), para serviços sem repositório (Soketi, MinIO, um MCP, um banco auxiliar):
o `docker-compose.yml` é escrito no Opex, guardado em **revisões** no banco e gravado na pasta do ambiente no
servidor (`~/opex-envs/<slug>`, como a central) a cada deploy. As variáveis, o deploy e o histórico ficam no Opex.

- **Origem** (`managedSourceSchema`): `projectName`, `services` (vazio = todos), `composeVersion` (revisão vigente,
  ≥ 1) e `composeUpdatedAt`. Os dois últimos são gravados **só pelo serviço de revisões**: criar e editar o ambiente
  ignoram o valor da entrada (um formulário aberto há tempo não volta a versão). Aceita build/execução em qualquer
  máquina (os arquivos estão no servidor; executar no PC segue o bloqueio de bind mount).
- **Compose obrigatório** (decisão do dono): a tela e `create_environment` exigem o YAML; o ambiente nasce com a
  **v1**. A falha "O ambiente não tem compose" do deploy fica só como proteção.
- **Revisões** (`environment_compose_versions`): `environmentId`, `version` (crescente por ambiente; índice único
  `{ environmentId, version }`, duas gravações ao mesmo tempo tentam o número seguinte), `content` (YAML completo),
  `authorId`, `note`, `createdAt` e `deployedAt` (último deploy com sucesso daquela revisão; decisão do dono no
  lugar do `deployedVersion` da especificação, para marcar "Implantada" no histórico). A vigente é a de maior
  `version`. Uma revisão nunca é sobrescrita.
- **Validação** (`composeContentProblem`, `managed-compose.ts`, a mesma na tela e no servidor): recusa vazio, mais de
  256 KB (bytes UTF-8) e YAML inválido (`parseDocument` da lib `yaml`), com a linha: "YAML inválido na linha N: …". O
  servidor responde 422 `ENVIRONMENT_COMPOSE_INVALID` (`details.line`). A validação completa do compose continua no
  deploy (`docker compose config`).
- **Rotas**: `GET /api/environments/[id]/compose` (vigente com o conteúdo + as últimas revisões sem o conteúdo, com
  tamanho e `deployedAt`, e a revisão implantada), `PUT` (`{ content, note? }`: revisão nova), `GET
  /compose/[version]` (conteúdo de uma revisão) e `POST /compose/restore` (`{ version }`: revisão nova com o conteúdo
  da escolhida e a nota "Restaurada da vN"). **Conteúdo igual ao da vigente é recusado** (decisão do dono): 422
  `ENVIRONMENT_COMPOSE_UNCHANGED`, inclusive restaurar a própria vigente. Ambiente de outra origem: 422
  `ENVIRONMENT_NOT_MANAGED`. Auditoria `Ambiente` com a versão e o tamanho (nunca o conteúdo); evento `environments`
  `{ id, change: "compose" }`.
- **Tela**:
  - Novo ambiente › Compose gerenciado: editor monoespaçado (`ComposeEditorField`, o mesmo do diálogo) com o tamanho
    e o erro com a linha em tempo real; Criar fica bloqueado sem o compose válido.
  - Linha: selo **Gerenciado vN** (revisão vigente), aviso "Há compose novo não implantado (implantada: vM)" quando o
    ambiente já implantado tem a vigente diferente da implantada (`composeNotDeployed`), e o botão **Compose**.
  - Diálogo **Compose** (`ComposeDialog`): revisão vigente com data e autor, editor, nota opcional e **Salvar nova
    revisão** (desabilitado sem mudança ou com erro); lista das revisões (`ComposeRevisionList`) com Vigente/
    Implantada, **Ver** (só leitura, no mesmo editor) e **Restaurar** (confirmação; a vigente não oferece). Tudo
    vale a partir do próximo deploy. Skeleton e erro com "Tentar novamente". O editor acompanha a vigente enquanto não
    foi mexido (o tempo real pode trazer uma revisão nova).
  - Histórico de deploys: "Compose vN" em cada deploy de gerenciado.
- **Deploy** (`server/deploy.ts`):
  1. Sem git nem código: passo "Pasta do ambiente" (`mkdir -p`), "Compose gerenciado: sem código-fonte nem git." e
     `commit = null` (tag de horário, sem build reaproveitado). Outra `ref` é ignorada (só a central implanta outra
     ref; o registro do deploy fica sem ref).
  2. Antes do `.env.opex`: a revisão vigente é gravada como `docker-compose.yml` (`MANAGED_COMPOSE_FILE`) no passo
     "Compose gerenciado vN", com o debug "gravar docker-compose.yml (compose gerenciado vN, conteúdo omitido)"; o
     conteúdo nunca vai para o log. O deploy registra `composeVersion`.
  3. Depois do `config`: serviço escolhido com `build` falha **antes de qualquer build** com "Compose gerenciado não
     tem código-fonte: use `image:` nos serviços ou a origem central"; senão o log mostra "Compose gerenciado vN (K
     serviço(s)): …" no lugar de "Compose lido". O resto é o pipeline de sempre (`.env.opex`, arquivos de variáveis
     ausentes, override, `up -d`, saúde, portas).
  4. O ponto de retomada leva `composeVersion`: o deploy retomado termina gravando a mesma revisão.
  5. Só no sucesso: `environments.deployedComposeVersion` e o `deployedAt` da revisão.
- **Levantar/Reiniciar/Derrubar/Logs** usam o arquivo que está na pasta, ou seja, a revisão **implantada**.
- **Apagar**: derruba, remove a **pasta do ambiente inteira** (`rm -rf`, inclusive dados de volumes montados por
  caminho relativo, que moram nela) e todas as revisões do compose.
- **Portal do cliente**: nunca aparece (o portal só lista origem central).

### Builder do servidor (OPE-186)

- **O que é**: o builder do buildx do host do OpenCode usado pelos deploys com build no servidor (e, quando é o
  builder atual do host, pelas prévias das mesas). O builder do PC (`opex-local-builder`) continua em
  Integrações › Builder Machine; a linha só traz um link para lá.
- **Linha** (`BuilderCard` → `BuilderRow`, `GET /api/environments/builder` a cada 10 s e pelo tempo real):
  nome, container, driver, selos (No ar / Parado / Não existe / Sem container / Não gerenciado / Padrão do
  host / Recriação pendente), limites **aplicados** no container (RAM, swap além da RAM, CPUs, lidos do
  `docker inspect`), uso de CPU/RAM (`docker stats --no-stream`), CPUs e memória do servidor e os avisos:
  falha da última ação ou do Docker, limites salvos diferentes dos aplicados ("use Recriar"), recriação
  pendente, flags do BuildKit que o Opex não recria e instância no buildx sem o container (removido por fora:
  Levantar usaria as opções antigas; salvar ou Recriar recriam com os limites salvos). Com o Docker do
  servidor fora do ar (`docker info` falha, marcador `docker-exit`), a linha fica em "Sem resposta" com o
  erro, nunca em "Não existe", e salvar responde 502 `BUILDER_DOCKER_FAILED` sem gravar. Skeleton com a
  estrutura da linha e erro com "Tentar novamente".
- **Sem configuração** (estado inicial): a linha mostra o builder **atual do host** (`docker buildx inspect`
  sem nome) como "Não gerenciado" com **Gerenciar**: o formulário vem com o nome, os limites lidos do
  container (inclusive os aplicados por `docker update`), a flag de `network.host` e "padrão do host" ligado
  quando ele é o atual. Salvar com os mesmos valores não recria nada. Se o atual usa o driver `docker` (sem
  container nem limites), a sugestão é um builder novo `opex-builder`.
- **Configuração** (`environmentsBuilderSchema`, em `environments_state.builder`): nome, RAM (GiB), CPUs
  (fração; até as CPUs do servidor), swap **além da RAM** (vazio = padrão do Docker, 0 = sem swap; exige a
  RAM; vai como `memory-swap` = RAM + swap), **Builder padrão do host** (`--use`/`docker buildx use`) e
  **Permitir network=host** (`--buildkitd-flags --allow-insecure-entitlement=network.host`). Limite vazio =
  sem limite. `PUT /api/environments/builder` (`saveBuilderConfig`):
  1. builder inexistente: só salva ("use Criar");
  2. limites e flag iguais aos aplicados: só salva (e marca como padrão do host, se pedido);
  3. sem build em andamento: recria com `docker buildx rm --keep-state` + `create` com os `--driver-opt`
     (`default-load=true`, `memory`, `memory-swap`, `cpu-period`/`cpu-quota`) + `--bootstrap`, **na vez da
     fila global do build** (`runExclusiveBuild`: nenhum build começa no meio);
  4. com build em andamento (`isBuildActive` da fila global): `docker update` no container na hora (RAM,
     swap e CPU no modo que o container já usa — `--cpus` ou quota) e a recriação fica **pendente**
     (`builderPending`).
- **Aplicar limites — alternativas avaliadas**: (a) recriar com `--keep-state` é o padrão: os limites ficam
  gravados no buildx (valem em toda recriação) e o cache é mantido, com alguns segundos fora do ar; (b)
  `docker update` só serve de ponte durante um build: não grava no buildx (uma recriação perde os limites) e
  não consegue tirar um limite de RAM. A recriação pendente corrige depois.
- **Recriação pendente** (`runPendingBuilderRecreate`): roda quando nenhum build está em andamento, no tick
  do agendador (`runEnvironmentsTick`) e no motor da fila do build (`runBuildPump`, **antes** de iniciar a
  próxima mesa, senão seria sempre passada para trás), na vez da fila. A pendência é **reivindicada de forma
  atômica** antes de recriar (`findOneAndUpdate` com `builderPending != null` → `null`): com o tick e o motor
  da fila chamando juntos, só um recria; numa falha ela não volta (a falha fica na linha) e audita como `system`. Não roda nas prévias das mesas (`isPreviewInstance`).
- **Ações** (`POST /api/environments/builder/actions` `{ action, confirm?, force? }`, `runBuilderAction`; exigem
  a configuração salva): **Criar** (só quando não existe; cria com os limites salvos), **Levantar**
  (`--bootstrap`), **Derrubar** (`buildx stop`, o cache continua), **Recriar** (`--keep-state`; com build em
  andamento fica pendente) e **Apagar** (`buildx rm`: remove o builder **e o cache**; confirmação explícita,
  que avisa quando ele é o builder do host). Derrubar e Apagar com um build em andamento respondem 409
  `BUILDER_BUILD_RUNNING` sem `force`; a tela pede confirmação dizendo que o build em curso falha.
  Levantar/Derrubar são otimistas (estado na hora, reversão e toast na falha); salvar e as ações mostram
  no toast a mensagem do servidor (aplicado, recriado ou pendente). Falha de comando: 502 `BUILDER_FAILED`
  com a última linha da saída, gravada em `builderLastAction` e mostrada na linha; o estado é sempre relido
  do host. Uma recriação que falha depois do `rm` deixa a linha em "Não existe" (Criar).
- **Deploys**: com o builder configurado, o build no servidor vai com `BUILDX_BUILDER=<nome>` (`dockerPrefix`,
  só em `build`/`up --build`) e o passo de build começa criando o builder quando ele sumiu ("Builder X não
  existia: criando com os limites salvos.", mesmo passo, dentro da trava). O log do passo diz o builder:
  "Build com o builder do buildx "X" (BUILDX_BUILDER)." ou, sem configuração, "Build com o builder padrão do
  host." (comando igual ao de antes). `machineAccess` lê a configuração (`loadBuilderConfig`); falha na leitura
  cai no padrão do host com aviso no log do servidor.
- **Auditoria e tempo real**: entidade `Ambiente`, `entidadeId: "builder"` (configurar, criar, levantar,
  derrubar, recriar, apagar, `forcado` quando houve build em andamento); evento `environments`
  `{ id: null, change: "builder" }` (não avisa o portal).

### Consumidores

- **Engramind** (`modules/engramind.md`): a integração aponta para um Ambiente (adotado em
  `/home/engramind`) e lê/grava o `.env` e recria o serviço `api` no host com o mesmo executor
  (`createHostRunner`/`runDetached`), usando `resolveEnvironmentRef` + `composePlanOf`. Trocar
  `APP_PORT` no Engramind atualiza o `source.projectName` do Ambiente adotado (`engramind-<porta>`).

### Agente Opex

Grupo de ferramentas **Ambientes** do Agente Opex **do dono** (`src/features/opex-agent/server/tools/environments.ts`, formatação pura em
`src/features/environments/opex-format.ts`), montado no registro do agente (`OPEX_TOOLS`). As ferramentas chamam os mesmos
serviços das rotas (`listEnvironments`, `createEnvironment`, `updateEnvironment`, `deleteEnvironment`,
`runEnvironmentAction`, `listDeploys`, `getDeploy`, `adoptProject`, configuração e registry), com a
mesma validação, auditoria, Pusher e erros.

- O ambiente é indicado por **id ou slug** (`resolveEnvironmentRef`).
- Leitura: `list_environments` (Servidor/PC, estado, portas, serviços no ar, versão, origem — `central (ref main)`,
  `gerenciado (v3)` ou `adotado (PC)` —, `composeImplantado` e `composeNaoImplantado` no gerenciado, build, último
  deploy com `compose: vN`), `get_environment` (origem, máquinas, só os **nomes** das variáveis, URL de saúde,
  serviços), `get_environment_logs` (últimas linhas, até 200, sem ANSI), `list_environment_deploys`
  (30 últimos), `get_environment_deploy` (resumo + fim do log, o ao vivo do processo quando em
  andamento), `list_unmanaged_projects`, `get_environments_settings` (com o estado do registry),
  `get_environments_builder` (builder do servidor: estado, limites aplicados e salvos, uso, avisos e, sem
  configuração, a sugestão para gerenciar).
- Escrita sem confirmação: `create_environment` (campo `kind`: `central`, o padrão, com `centralId` obrigatório e ref
  `main`; ou `managed`, com o YAML em `compose` obrigatório, que vira a v1, e sem central/ref/arquivo. A origem vai
  num campo achatado `kind`, no formato que a ferramenta já usava. Slug sugerido pelo nome, projeto = slug). O compose
  em si só se edita pela tela (não há ferramenta de revisões); `start_environment`, `create_environments_builder`, `start_environments_builder`.
- Com confirmação por padrão (`confirmByDefault`): `update_environment` (só os campos enviados; no gerenciado,
  `projectName` e `services`; `env`
  é a lista completa, valor vazio mantém o salvo — só nas ferramentas, que nunca veem os valores; pela
  tela, vazio grava vazio), `restart_environment`, `adopt_project`,
  `update_environments_settings`, `clean_environments_registry`, `configure_environments_builder` (patch
  sobre a configuração salva ou, sem ela, sobre a sugestão do host; `null` tira um limite).
- Destrutivas (confirmação): `deploy_environment` (sem `ref` = a ref salva; outra ref só na origem
  central; o gerenciado implanta a revisão vigente), `move_environment` (a descrição manda avisar dos volumes e do tempo fora do ar; a saída
  traz `moveWarning`), `stop_environment`, `delete_environment` (`removeVolumes`),
  `stop_environments_builder`, `recreate_environments_builder` e `delete_environments_builder` (com
  `force` quando há um build em andamento, depois de avisar que ele falha).
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
- **Compose gerenciado**: pasta do ambiente no servidor, com a revisão vigente gravada a cada deploy (ver "Compose
  gerenciado").
- **Adotado**: usa o `working_dir` do label (no servidor ou no PC, pela conexão mestra). Com git,
  `git pull --ff-only` opcional; sem git, só o build. Adotado do PC fica no PC (build e execução).
- **Variáveis**: `.env.opex` gravado em base64 na pasta do ambiente (o debug mostra só "valores
  ocultos"), com `$` escapado como `$$` (o valor chega literal), passado por `--env-file` e
  `env_file` no override — caminho relativo à pasta do primeiro arquivo do compose (ex.:
  `deploy/docker-compose.yml` → `../.env.opex`).
- **Arquivos de variáveis do compose** (OPE-175, `server/env-files.ts` → `ensureComposeEnvFiles`): antes
  de toda ação que roda o compose (deploy/redeploy/mover, levantar, reiniciar, derrubar, logs e o
  derrubar de Apagar), em central ou adotado, no servidor ou no PC, o app lê os `env_file`
  declarados com `docker compose config --no-env-resolution --no-interpolate` (não falha com arquivo
  ou variável faltando; a saída nunca vai para o log) e cria **vazio** (com a pasta, `umask 077`) cada
  obrigatório que não existe — em qualquer caminho que o compose declare, na máquina dos arquivos.
  Nunca toca um arquivo que existe (`[ -e ]` + `: >>`), nunca cria `required: false`, caminho ainda
  com `$` nem o `.env.opex`. No deploy, o log mostra "Arquivo de variáveis do compose ausente: .env
  (criado vazio)" (relativo à pasta do ambiente quando está dentro dela); nas outras ações, só no log
  do servidor. Falha nessa preparação não bloqueia a ação (o compose mostra o erro real); no deploy, o
  log diz "Não foi possível verificar os arquivos de variáveis do compose: um arquivo ausente não foi
  criado." (leitura) ou "Não foi possível criar os arquivos de variáveis do compose ausentes." (criação). O Apagar
  continua igual (o worktree da central sai inteiro; no adotado só o override e o `.env.opex`).
  Compose sem `env_file` continua como antes.
- **Variável obrigatória faltando** (`${X:?…}`): a falha de "Lendo o compose" diz qual variável faltou e
  lembra de cadastrá-la em **Variáveis extras**.
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

- Builder do servidor: só os builds conhecidos pela fila global do build deste processo contam como "build
  em andamento"; um `docker build` manual no host não é detectado (recriar/derrubar/apagar o derrubaria).
  Recriar pode baixar uma imagem mais nova do BuildKit (`buildx-stable-1`); o estado `--keep-state`
  costuma ser compatível. Um `buildx rm` feito fora do Opex tira o builder do padrão do host (o `--use`
  só vale nas criações do Opex). Flags do BuildKit além de `network.host` se perdem ao recriar (a linha
  avisa).

- O arquivo de variáveis que o app cria vazio só é desconsiderado na checagem de pasta limpa do
  próprio app: por decisão do dono, nada é gravado no repositório (nem `.git/info/exclude`, que nos
  ambientes de central é compartilhado com o repositório da central). Num `git status` manual ele
  aparece como `??` quando o projeto não o ignora no `.gitignore` — central ou **adotado**.
- Commit novo que passa a **rastrear** um arquivo que o app criou vazio: na central, o `checkout --detach`
  recusa sobrescrever o arquivo não rastreado (erro no passo "Código da ref"); no adotado, o mesmo vale
  para o `git pull` ("git pull no redeploy") e para um `pull`/`checkout` manual. Apague o arquivo vazio
  da pasta e implante (ou atualize) de novo.
- Compose gerenciado: sem suporte a `build` (não há código-fonte na pasta), sem editor no portal do cliente e sem
  ferramenta do Agente Opex para editar o compose. Apagar remove a pasta inteira, com os dados de volumes montados
  por caminho relativo.
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
  **adotados**, **compose gerenciado** e ambientes de outro cliente nunca aparecem e respondem 404 nas ações.
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
  `builder-commands.ts` e `builder-view.ts` (builder do servidor, puros), `server/builder.ts`,
  `hooks/useEnvironmentsBuilder.ts`, `components/builder/` (`BuilderCard`, `BuilderRow`, `BuilderFormDialog`,
  `BuilderConfirmDialog`),
  `compose-config.ts`, `pipeline.ts`, `view.ts`, `opex-format.ts`, `managed-compose.ts` (regras puras do compose
  gerenciado), `server/compose-revisions.ts`, `hooks/useEnvironmentCompose.ts`, `components/` (tela do dono;
  `EnvironmentStatus.tsx` com o botão e os selos compartilhados com o portal), `hooks/`,
  `portal/` (página, linha e hooks do portal) e `server/` (`models`, `service`, `deploy`, `resume`,
  `hub`, `stream`, `forwards`, `registry`, `settings`, `opex-notice`, `portal`).
- Rotas: `src/app/api/environments/**` (dono; builder do servidor em `builder/` e `builder/actions/`), `src/app/api/cliente/ambientes/**` (portal); páginas
  `src/app/(app)/ambientes/` e `src/app/cliente/(portal)/ambientes/`.
- Integração: item em `APP_NAV`, tick no `runSchedulerTick` (`runEnvironmentsTick`), rotina
  `environments-registry-cleanup` (`catalog.ts` + `registerBuiltInJobs`), `runExclusiveBuild` na fila
  global do build (`agentic/server/build-queue.ts`), ferramentas no registro do Agente Opex do dono e do
  portal, `kind: "notice"` nas mensagens do Agente Opex (avisos de fim de deploy) e `readNdjson`
  (`src/lib/ndjson-client.ts`, log ao vivo do deploy).
- Dados: `environments`, `environment_deploys` (TTL de 90 dias), `environment_compose_versions` (revisões do compose
  gerenciado, sem TTL; saem ao apagar o ambiente), `environments_state`; auditoria
  `entidade: "Ambiente"`.
- Testes: `__tests__/features/environments/` (`commands`, `deploy`, `resume`, `environments-ui`, `managed-compose`,
  `compose-revisions`, `compose-ui`,
  `opex-tools`, `portal`, `portal-ui`, `builder-commands`, `builder`, `builder-ui`),
  `__tests__/features/agentic/build-queue.test.ts` (`runExclusiveBuild` e a recriação pendente antes da
  próxima mesa), `__tests__/features/opex-agent/client-tools.test.ts` (grupo do portal).
