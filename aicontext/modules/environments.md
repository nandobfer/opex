# Ambientes (`environments`)

## O que é

Página **Ambientes** (`/ambientes`, no grupo **Configurações** do menu, junto de Integrações) para gerenciar ambientes **Docker Compose** no **servidor** e no **PC** (pela conexão
do Builder Machine, nativo), com build e execução em máquinas diferentes por um **registry local**.

### Tela

- **Builder do servidor** (OPE-186): card fixo **acima** dos grupos Servidor/PC (`components/builder/`), para o
  builder do buildx do Docker do servidor (o `buildx_buildkit_<nome>0` do `docker stats`). Ver "Builder do
  servidor" abaixo.
- **Lista em cards** (OPE-211, `EnvironmentCard`; peças compartilhadas com o portal em `components/card/`), agrupada em
  **Servidor** e **PC** (máquina de execução, com a contagem). Um card largo por ambiente, um embaixo do outro
  (`ENV_CARD_LIST_CLASS`), consultada a cada 10 s e em tempo real:
  - **Cabeçalho**: ponto de estado (`EnvironmentStateDot`: verde pulsando No ar, amarelo Parcial, cinza Parado, vazado
    Nunca implantado, primário Implantando; pulso parado com movimento reduzido), o nome (`ItemNameLink` para o Editar) e o
    slug, e os selos de origem (Central / Gerenciado vN / Adotado / Adotado (sem git)), onde está (`placementLabel`) e a
    versão. À direita, **Deploy/Redeploy** (`DeployMenu`), **Logs** (botão com rótulo) e o menu **⋯**
    (`EnvironmentActionsMenu`): Levantar, Derrubar, Reiniciar | Compose (só gerenciado), Histórico de deploys, Editar,
    Mover | Apagar (vermelho, depois de um separador). Item desligado mostra o motivo abaixo do rótulo (PC indisponível,
    ainda não implantado, ação em andamento, adotado do PC no Mover, deploy em andamento no Editar).
  - **Faixa de aviso** (`PendingDeployNotice`, `pendingDeployItems`), só com algo salvo e não implantado: uma linha
    "Mudanças salvas ainda não implantadas: limites, ajustes dos serviços e compose v4 (implantado: v3)." com **Fazer
    deploy** (a mesma ação do Deploy, a ref salva); o detalhe do que está salvo fica no `title`.
  - **Containers** (`ContainerList`), um por linha, em colunas no `md` (Serviço · Situação · Portas · Recursos) e
    empilhados com rótulos abaixo: ponto e nome do serviço (o container no `title`), o `status` do Docker, as **portas**
    (ver "Portas de cada container") e CPU/RAM em uso com o limite aplicado. Sem containers: "Nunca implantado: faça o
    deploy…" ou "Nenhum container encontrado…".
  - **Rodapé**: o último deploy (ícone por status, "há 2 horas", ref @ commit; link para a página do log), "2/3 no ar"
    e, executando no PC, "Portas liberadas: 4100" (as repassadas ao servidor).
  - Skeleton `EnvironmentCardSkeleton` com as mesmas classes (`environment-card-layout.ts`).
- **Portas de cada container** (OPE-211, `container-ports.ts`, puro): o snapshot junta o `{{.Ports}}` do `docker ps`
  (só no ar) com `{{json .Config.ExposedPorts}}` e `{{json .HostConfig.PortBindings}}` do `docker inspect` que já lia os
  limites (vale também parado; nenhum comando novo). `parseContainerPorts` tira as repetições (`0.0.0.0` e `::` da mesma
  porta; a exposta some quando a mesma porta está publicada), expande faixas (até 64) e ordena pela porta do container.
  Cada porta vai no DTO (`ServiceStatusDto.listen`) com o alcance (`portReach`): `link` (publicada; no PC, só se estiver
  em Portas, repassada ao servidor), `pc` (publicada só no PC), `local` (só em `127.0.0.1`), `udp` e `internal` (sem
  publicação). O chip (`PortChip`) mostra "3000/tcp → :4100"; com `link`, o publicado é link para
  `http://<host>:<porta>` em aba nova, com o botão de copiar o link (`CopyButton`, toast "Link copiado."); os outros
  alcances ficam em texto com a dica no `title`. App que escuta numa porta fora do `EXPOSE` e do `ports` do compose
  aparece como "sem porta declarada" (o Docker não sabe dela).
- **Host dos links** (`usePortLinkHost`): o **Endereço dos links das portas** das Configurações (`portLinkHost`, vai na
  lista como `EnvironmentsListDto.portLinkHost`) ou, vazio, o endereço com que a tela foi aberta (`window.location.hostname`).
  Abrindo o Opex por um domínio (atrás da Cloudflare), configure o IP ou host do servidor.
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
  reaproveitado** e **Recuperado após reinício** e o erro resumido. Cada linha é o link para a página do log
  (`/ambientes/deploys/<id>`, ver "Página do log do deploy").
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
- **Novo/Editar** (OPE-211: páginas próprias, o modal saiu): `/ambientes/novo` e `/ambientes/[id]/editar`
  (`EnvironmentEditorPage` → `EnvironmentEditorForm`, `components/editor/`). Na lista, **Novo ambiente** e o estado vazio
  levam ao Novo; o **nome** do ambiente (`ItemNameLink`) e **Editar** levam ao Editar (Editar desligado durante um deploy).
  O ambiente, as máquinas e a capacidade vêm da lista (`useEnvironments` + tempo real); ambiente inexistente mostra
  "Ambiente não encontrado" com "Voltar para Ambientes"; erro, `ErrorState`; carregando, `EnvironmentEditorSkeleton`
  (mesmo leiaute, constantes de `environment-editor-layout.ts`).
  - **Leiaute**: cabeçalho `FormPageHeader` (voltar para Ambientes, título, status e as ações Cancelar e Salvar/Criar
    ambiente, repetidas no `FormFooter` do fim; nada fixo na tela) e, no `lg`, o índice das seções preso à lateral
    (`FormSectionNav`: seção visível marcada, ponto nas alteradas, alerta nas com erro; abaixo do `lg`, faixa no topo).
  - **Seções** (cards `FormSection`, âncoras `ambiente-<seção>`, `editor-sections.ts`): **Identificação** (nome e slug;
    no Novo o slug e o nome do projeto do compose acompanham o nome até serem editados), **Origem** (tipo em `OptionTabs`,
    travado no Editar com "A origem não muda depois de criada" e o servidor recusa a troca, 422
    `ENVIRONMENT_SOURCE_LOCKED`; Projeto adotado desabilitado no Novo, vem de **Adotar**. Central: central pelo
    `SearchPicker` (busca por nome e repositório), ref, arquivo do compose, nome do projeto e os **serviços do ambiente**
    em `ChipInput` com os do compose lido como atalho "Do compose: + app" — vazio = todos. Gerenciado: projeto, serviços
    e, no Novo, o editor do `docker-compose.yml`; no Editar, "Compose vN" com **Abrir revisões** (o `ComposeDialog` na
    própria página). Adotado: o resumo e "git pull no redeploy" quando há git), **Execução** (Build em / Executar em em
    `OptionTabs`, PC desligado com o motivo; **Portas** em `ChipInput`: digitar ou colar "4100, 4101", só 1–65535 sem
    repetir; URL de saúde), **Variáveis extras** (ver "Variáveis extras no formulário"), **Recursos** (ver "Limites de
    recursos") e **Serviços do compose** (ver "Serviços do compose").
  - **Status** ao lado do Salvar (`editorStatus`): "Tudo salvo", "Alterações não salvas em Origem e Serviços do
    compose" ou "Erro em …"/"N seções com erro" (clicável: leva à seção). Salvar com erro rola até a primeira seção com
    erro e põe o foco no campo.
  - **Salvar**: Novo volta para `/ambientes` (toast "Ambiente criado"). Editar fica na página ("Tudo salvo") com o aviso
    "Salvo. As mudanças valem no próximo deploy" e o botão **Fazer deploy** (a mesma ação da linha; abre a página do log).
  - **Sair com alterações** (`useUnsavedChangesGuard`): Cancelar, o voltar e qualquer link interno do app pedem
    "Descartar alterações?"; fechar/recarregar a aba usa o `beforeunload`. Os botões voltar/avançar do navegador não
    passam pelo guarda (o App Router não oferece interceptação).
  - **Tempo real**: o formulário é montado uma vez por ambiente (um evento não reseta o que está sendo editado). Versão
    **mais nova** do ambiente no servidor (`updatedAt`) mostra "Este ambiente foi alterado em outro lugar" com
    **Recarregar** (descarta e relê) e **Manter o que estou editando**.
- O card mostra os limites **aplicados** em cada container ("limite: RAM 4 GiB · swap padrão · 2 CPUs") e, com limites
  salvos diferentes dos aplicados, "limites" na faixa de aviso (ver "Limites de recursos").
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
- **Página do log do deploy** (OPE-208, no lugar da gaveta lateral, decisão do dono): `/ambientes/deploys/[deployId]`
  (`deployPath`). Server Component que lê `loadDeployPage` (`server/deploy-page.ts`: o resumo do deploy, sem o log, e o
  nome do ambiente; ambiente apagado aparece como "Ambiente removido"; id inválido ou deploy inexistente → 404) e
  renderiza a `DeployLogPage`: cabeçalho `AgentPageHeader` com a seta **Voltar para os ambientes**, o título "Deploy de
  <ambiente>" ("Mudança de máquina de" / "Remoção de" nos outros tipos) e a linha build → execução · ref @ commit ·
  início; abaixo, o cartão do log (`DeployLog`) com o status animado, a barra de progresso e o terminal ocupando o resto
  da tela (`useFillViewportHeight`, mínimo 320 px). Skeleton com as mesmas classes (`deploy-page-layout.ts`,
  `loading.tsx`). Quem abre a página: o Deploy/Redeploy e o Mover iniciados (`router.push`, como a gaveta abria
  sozinha), o "Último deploy …" da linha e as linhas do Histórico (links). O Voltar do navegador volta para Ambientes;
  sair no meio não interrompe o deploy e reabrir o link mostra o log inteiro de novo (o stream reenvia tudo a cada conexão).
  Regra geral de qual padrão usar: `use-para-atualizar-tema-e-componentes-ui.md`, "Qual padrão usar para cada tipo de
  conteúdo".
- **Log do deploy ao vivo** na página acima, com o xterm (NDJSON, pedaços da saída via
  `HostRunOptions.onOutput`), guardado em `environment_deploys`. Os passos, levantar/derrubar/
  reiniciar, o derrubar de Apagar e o `garbage-collect` rodam pelo **executor desacoplado** do
  Builder Machine (`detached: true`): o OpenCode descartar o shell no meio (diretório reciclado) não
  derruba o deploy. Logs e as leituras da descoberta usam `retryOnLost`. Se a conexão do log cair
  (o servidor reiniciou) ou o stream fechar sem o status final, a página mostra "Reconectando ao
  servidor…" e tenta de novo a cada 3 s por até 3 min **contados desde a queda** (uma conexão que
  volta a entregar eventos zera a contagem), redesenhando o log inteiro ao reconectar. Desistindo, o status vira
  "Falhou: Sem conexão com o servidor … Recarregue a página para tentar de novo."
- **Barra de progresso do deploy** (OPE-202), entre o status e o terminal da página do log, só enquanto o deploy está
  em andamento:
  - Vem do evento `meta` (`DeployMetaEvent`: `startedAt`, `serverNow`, `estimateMs`, `sampleSize`, `initial`), a primeira linha
    do NDJSON de um deploy `running` (inclusive quando outro processo conduz o deploy e o stream fecha sem status).
    Deploy já encerrado (aberto pelo Histórico) não recebe `meta`: só o resultado e o log, sem barra. O `meta` chega
    de novo a cada reconexão, e o tempo continua do `startedAt` absoluto.
  - **Estimativa** (`estimateDeployDuration`, `deploy-estimate.ts`; consulta em `server/estimate.ts`): mediana das
    durações dos 10 deploys mais recentes **com sucesso do próprio ambiente** (nunca de outros) e do mesmo tipo
    (Deploy/Mover/Apagar) quando há pelo menos 3; senão, dos 10 mais recentes de qualquer tipo do ambiente. Com 1 ou
    2 amostras a estimativa é "inicial" (o texto avisa "(estimativa inicial)"); sem nenhuma, `estimateMs: null`.
    Deploys retomados e com build reaproveitado entram na conta. Falha ao ler o histórico vai para o log e o `meta`
    sai sem estimativa (o stream não cai).
  - **Tela** (`DeployProgress` sobre a `UsageBar` compartilhada, `tone="primary"`: cor primária fixa, sem faixas de
    consumo nem pulso): rótulo "Deploy", detalhe "há 01:12 · restam ~02:05" e % = decorrido sobre a estimativa
    (`deployProgress`, `deploy-progress.ts`; tempo em `mm:ss`, `h:mm:ss` a partir de 1 h). Passou do previsto: o %
    trava em 99% e o detalhe vira "há 05:12 · mais que o previsto (~04:00)". Sem estimativa: barra indeterminada
    (segmento correndo; parado com movimento reduzido), sem % nem `aria-valuenow`, só "há 01:12".
  - O relógio é o `useTickingNow` (`src/hooks/`, `useSyncExternalStore`, tick de 250 ms, `null` no servidor): o
    decorrido é sempre `agora − diferença − startedAt`, nunca somado por tick, e segue contando durante "Reconectando…".
    A diferença entre o relógio do navegador e o do servidor (`clockSkewMs`, pelo `serverNow` do `meta`) é medida a
    cada `meta` recebido (inclusive nas reconexões): um dispositivo com o relógio adiantado ou atrasado vê o mesmo
    decorrido e o mesmo % que o servidor.
  - Ao chegar o status final (Concluído, Falhou ou a desistência por falta de conexão) a barra sai com fade e
    recolhe a altura (Framer Motion); nunca fica parada num % alto. `role="progressbar"` com `aria-label` explicando
    que é tempo decorrido sobre a duração prevista e `aria-valuetext` com o tempo.
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
    manda o log gravado e fecha sem status, e a página do log reconecta.
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
  (`5050`, só `127.0.0.1`), tags mantidas por ambiente (`5`) e o **Endereço dos links das portas** (`portLinkHost`,
  só o host; vazio = o endereço da tela; OPE-211). A conexão com o PC é a do Builder Machine.

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
### Limites de recursos (OPE-193)

- **Campos** (seção **Recursos** da página Novo/Editar, `ResourcesSection`; no modo "Por serviço", o grupo Recursos do
  painel de cada serviço, `ServiceLimitsGroup`, OPE-211): RAM (GiB), swap
  **além da RAM** (GiB) e CPUs (fração), com a mesma semântica, validação e textos do builder do servidor: vazio =
  sem limite; swap vazio = padrão do Docker; swap 0 = sem swap; swap sem RAM é erro ("Defina a RAM para limitar o
  swap"). Os três campos são o componente compartilhado `ResourceLimitsFields` (o mesmo do formulário do builder), e
  a ajuda mostra a RAM e as CPUs da máquina de execução (`EnvironmentsListDto.hosts`, do `docker info` do snapshot).
- **Modos** (`OptionTabs`): **Mesmos para todos** (`{ mode: "shared", memoryGb, cpus, swapGb }`: cada
  container do ambiente recebe esses limites) ou **Por serviço** (`{ mode: "service", services: [{ service, … }] }`:
  uma linha por serviço; serviço sem linha fica sem limite; nomes repetidos são erro). Trocar para "Por serviço" copia
  os valores do modo único para os serviços conhecidos (os do compose lido ou, antes da leitura, os do host); voltar ao
  modo único usa os valores quando são iguais em todas as linhas (`switchLimitMode`, `limits-form.ts`). No modo "Por
  serviço", a seção Recursos mostra o resumo de cada serviço ("RAM 2 GiB · …", "Sem limite" ou "Corrija os limites") e
  cada linha leva ao painel do serviço, no grupo Recursos: "Definir limites de <serviço>" / "Sem limite para
  <serviço>", com o declarado no compose e o aplicado no host.
- **Leitura do compose** (`POST /api/environments/compose-services` `{ source }`, só o dono, `readComposeServices`): os
  serviços do compose da origem e os limites declarados neles (`mem_limit`, `memswap_limit`, `cpus` ou
  `deploy.resources.limits`, em bytes ou com unidade), sem o override do app, com `config --no-env-resolution
  --no-interpolate` (valor com `${VAR}` volta vazio). Central: `git fetch` + a ref resolvida e uma pasta temporária
  com só o arquivo do compose e os `*.yml`/`*.yaml` da ref (`git archive`), apagada no fim — o worktree do ambiente
  no ar não é tocado; os serviços escolhidos na origem filtram a lista. Adotado: a pasta do projeto (servidor ou PC).
  Compose gerenciado: a **revisão vigente** guardada no Opex, lida do YAML (`parseComposeYaml`, sem Docker); no Novo
  ainda não há revisão: a página lê o YAML do editor no navegador (`parseComposeYaml`) e, sem `environmentId`, a rota
  responde 422 `ENVIRONMENT_COMPOSE_READ_UNAVAILABLE`.
  Na página Novo/Editar (OPE-211, `ComposeReadProvider`/`useComposeRead`, `hooks/useFormComposeRead.tsx`) a leitura é
  **automática e única para a página toda** (sugestões da Origem, Recursos e Serviços): sai na hora ao abrir (ou quando a
  origem fica completa) e de novo quando a origem muda, depois de 800 ms parada (`COMPOSE_READ_DEBOUNCE_MS`); pede sempre
  **todos** os serviços (`services: []`: a lista marca os que ficam fora do ambiente). "Ler de novo" no cabeçalho dos
  Serviços do compose. A leitura não preenche limites nem mostra toast. Falha: 502 `ENVIRONMENT_COMPOSE_READ_FAILED`
  com a última linha do erro (nunca o JSON) e o aviso com "Tentar novamente" na seção Serviços. Com a origem
  incompleta (ex.: Novo sem a central), nada é lido (`composeServicesInputSchema`) e a seção diz "Escolha a origem
  para ver os serviços". O DTO traz também o `limitStyle` de cada serviço (para a prévia do override).
- **Editar abre com o que vale**: os limites **configurados**, mesmo vazios ("sem limite" salvo reabre vazio); nunca
  configurados (`limits` ausente/`null`: ambiente antigo, adotado, criado pela ferramenta sem `limits`), os
  **aplicados** hoje nos containers (`docker inspect` no snapshot: `HostConfig.Memory`/`MemorySwap`/`NanoCpus`/
  `CpuQuota`, `appliedEnvironmentLimits`: modo único quando todos os serviços têm os mesmos, por serviço quando
  diferem); sem nenhum, vazio ("Sem limite"). O campo mostra "No host hoje: …".
- **Aplicação: só no deploy** (inclui Mover): o override `docker-compose.opex.yml` ganha os limites de cada serviço
  (`limitLines`) e o `up -d` recria os containers cuja configuração mudou. Reiniciar (`compose restart`) e Levantar
  (o override do último deploy) **não** aplicam limites novos. Chaves: RAM em `deploy.resources.limits.memory` (ou
  `mem_limit` quando o compose do projeto usa `mem_limit`), CPUs em `deploy.resources.limits.cpus` (ou `cpus` no
  serviço, idem) — o compose recusa as duas formas com valores diferentes no mesmo serviço ("can't set distinct
  values on 'cpus' and 'deploy.resources.limits.cpus'"), então o override segue a forma do compose base; swap em
  `memswap_limit` = RAM + swap (0 = igual à RAM; vazio = sem a chave). Com swap vazio e um `memswap_limit` declarado
  no compose, a chave é reescrita como RAM nova + o swap declarado (o total antigo poderia ficar abaixo da RAM nova e
  o Docker recusaria o container). Valor vazio não escreve chave. O log do deploy diz "Limites: app RAM 4 GiB · swap
  padrão · 2 CPUs; db sem limite" e, por serviço, "Limite do serviço X ignorado: o serviço não está no compose."
  (não bloqueia). O deploy com sucesso grava em `environments.deployedLimits` os limites que aplicou (vindos do ponto
  de retomada, `checkpoint.limits`).
- **Divergência** (`limitsPendingDeploy`): selo "Limites salvos diferem dos aplicados: faça Deploy" na linha e
  `limites.diferem` em `get_environment`, só em ambiente implantado, quando (a) os limites configurados diferem dos
  do último deploy (`sameEnvironmentLimits` com `deployedLimits`; inclui tirar um limite: salvo vazio × deploy com
  limite) ou (b) algum serviço **com limite salvo** tem outro aplicado no container (`environmentLimitsDiffer`, mesma
  regra do builder para o swap padrão). Serviço sem limite salvo não conta no (b): o que o próprio compose declara
  segue valendo.
- **Dados**: `environments.limits` (`Mixed`; `null`/ausente = nunca configurado, lido como sem limite por
  `environmentLimitsOf`, sem migração) e `environments.deployedLimits`; `EnvironmentDto.limits` (salvos),
  `limitsConfigured`, `deployedLimits` e `ServiceStatusDto.limits` (aplicados no container). `environmentInputSchema`
  aceita `limits: null` (as ferramentas sem `limits` mantêm o que está salvo, inclusive o `null`); a tela sempre
  envia o objeto. O portal do cliente não recebe limites. Auditoria: `limites` (texto) no antes/depois.

### Serviços do compose (OPE-211)

Ajustes dos dados de cada serviço do compose pela tela, sem mexer no repositório (nas três origens, inclusive no
compose gerenciado, por cima da revisão vigente). Entram no override `docker-compose.opex.yml` do próximo **Deploy**.

- **Dados** (`composeOverridesSchema`, `schemas.ts`): `environments.composeOverrides = { services: ServiceOverride[], yaml }`
  (`null`/ausente = nunca configurado, igual a sem ajustes) e `environments.deployedComposeOverrides` (os do último deploy
  com sucesso, vindos do ponto de retomada `checkpoint.overrides`). Sem migração. **Texto simples** (decisão do dono: nada
  é cifrado), mas o log do deploy e a auditoria mostram só as **chaves** do `environment`.
- **Por serviço** (`ServiceOverride`; em cada campo `null` = o valor do compose, "Personalizar" desligado; um valor
  substitui o do compose **por inteiro**, inclusive lista vazia):

| Campo | Formato | No override |
|---|---|---|
| `image` | referência sem espaços/aspas | `image: X` + `build: !reset null` |
| `command`, `entrypoint` | lista (um argumento por item) | lista; vazia = `!reset null` (o padrão da imagem) |
| `environment`, `labels` | `{ key, value }[]` (labels `com.docker.compose.*` recusados) | mapa com `!override` |
| `ports` | `{ target, published ("8080", "8000-8010" ou ""), protocol, hostIp }[]` | forma longa com `!override` |
| `volumes` | `{ type: bind\|volume\|tmpfs, source, target, readOnly }[]` | forma longa com `!override`; volume nomeado declarado no topo (`volumes: { nome: {} }`) |
| `restart` | `no`, `always`, `on-failure`, `unless-stopped` | `restart: X` |
| `healthcheck` | `{ mode: "disable" }` ou `{ mode: shell\|exec, test, interval, timeout, startPeriod, retries }` | `!override` (`CMD-SHELL`/`CMD`; duração vazia = padrão) |
| `dependsOn` | `{ service, condition, restart }[]` | `depends_on` com `!override` |

  Os valores vão como estão, com a semântica do compose: `${VAR}` é interpolado (`$$` = literal), diferente das
  Variáveis extras. O `environment` do serviço **vence** as Variáveis extras (`env_file`) com o mesmo nome (a tela avisa).
- **YAML avançado** (`yaml`, `override-yaml.ts`): o conteúdo do bloco `services:` (serviço → chaves), até 64 KB, com as
  tags `!reset`/`!override`. A validação (`overrideYamlProblem`, a mesma na tela e no servidor) recusa YAML inválido (com a
  linha), conteúdo que não seja mapa de serviços, as chaves que o Opex controla (`env_file`, `build`, `deploy`, `mem_limit`,
  `memswap_limit`, `cpus`) e a mesma chave personalizada no bloco guiado do mesmo serviço ("app.image está no bloco guiado e
  no YAML avançado: deixe em um só"). `image` no YAML avançado com uma referência (texto não vazio) também conta como
  imagem própria; `image: !reset null` (ou vazia) só tira a imagem e o build do compose continua.
- **Deploy** (`server/deploy.ts`, `overrideYaml`, `serviceOverrideLines`):
  1. Ordem no serviço: imagem do registry ou nenhuma (imagem própria), `env_file`, limites, campos guiados, `build: !reset
     null` (imagem própria) e, por último, as chaves do YAML avançado.
  2. **Imagem própria** (`ownImageServices`): o serviço sai de `buildServices` (não builda, não vai ao registry, não recebe
     `localhost:<porta>/opex-env/...`). No compose gerenciado, a recusa de `build` ignora esses serviços. Com build e execução
     na mesma máquina entra o passo **"Pull das imagens prontas"** (`compose pull <serviços>`, antes de subir; a tag nova de
     um `latest` vem a cada deploy); em máquinas diferentes, o `Pull` de sempre já os busca. Os serviços do pull vão no ponto
     de retomada (`checkpoint.pullServices`).
  3. Serviço dos ajustes que não está no compose: "Ajustes do serviço X ignorados: o serviço não está no compose." (não
     bloqueia).
  4. Executar no PC: os bind mounts dos ajustes entram no bloqueio (`withOverrideMounts`; volumes personalizados no bloco
     guiado e `volumes: !override`/`!reset` do YAML avançado substituem os do compose; `volumes` sem tag no YAML soma).
  5. Log: "Serviços: app imagem nginx:1.27, ports (2); db environment (3: A, B, C)" e "YAML avançado: serviços app,
     worker". O override é gravado com o debug "gravar docker-compose.opex.yml (conteúdo omitido)".
  6. **Conferência do override** (só com ajustes): passo "Conferindo o override" (`docker compose … -f
     docker-compose.opex.yml config --quiet`) antes de qualquer build. YAML avançado ruim ou um Compose sem as
     tags (exigem v2.24.4 ou mais nova; o servidor tem a v5) falham aqui. A saída da conferência **nunca vai para o log**:
     o erro do deploy leva só a última linha, com os valores do environment, dos labels e do YAML avançado trocados por
     `[valor oculto]`. Na falha, o override é regravado **sem os ajustes** (passo "Override sem os ajustes (a
     conferência falhou)") e, em seguida, a regra do item 8 o volta ao do último deploy concluído, quando existe.
  7. **Cópias dos arquivos gerados** (o override e o `.env.opex`), numa pasta só do Opex, **fora da pasta do projeto**:
     `$HOME/.opex/environments-deployed/<id do ambiente>/` na máquina dos arquivos (`deployedStore`, `DEPLOYED_STORE`), com
     `current` (o último deploy concluído) e `pending` (o deploy em andamento). Antes de subir, o passo "Cópia dos arquivos
     deste deploy" prepara a `pending`; no sucesso, ela vira a `current` (a anterior só sai depois da troca). Se a troca
     falhar, o deploy **conclui assim mesmo** (containers, arquivos e `deployedComposeOverrides` ficam na configuração
     nova), as cópias saem e o log avisa "Não foi possível guardar a cópia…". Apagar o ambiente apaga só essa pasta do
     Opex, nunca nada da pasta do projeto. Reiniciar e Levantar usam o override do último deploy (não aplicam ajustes novos).
  8. **Deploy que falha antes de subir os containers** (antes do passo "Sobe no …", inclusive na retomada; no mesmo lugar
     do último deploy, não no mover): o override e o `.env.opex` voltam aos da `current` ("Override e variáveis extras
     voltaram aos do último deploy concluído"), para Derrubar, Levantar e Reiniciar seguirem com a configuração implantada.
     **O passo que sobe terminou e um passo seguinte falhou** (ex.: a saúde): os containers estão com a configuração
     nova, então os arquivos ficam os deste deploy, a `pending` vira a `current` e o estado implantado (`deployedOn`, ref,
     commit, versão, limites, `deployedComposeOverrides`, revisão do compose) passa a ser o deste deploy, mesmo com o deploy
     falho; o log registra "Os containers subiram com a configuração deste deploy e um passo seguinte falhou…".
     **O próprio passo que sobe falhou** (estado dos containers indeterminado): os arquivos voltam aos da `current` (no
     mesmo lugar), o estado implantado continua o do último deploy concluído e o log registra a deriva possível ("O passo
     que sobe os containers falhou: alguns podem ter ficado com a configuração deste deploy… faça um novo deploy…").
     Na retomada vale o mesmo, pelo passo gravado no ponto de retomada.
     Ambiente implantado antes das cópias existirem ganha a `current` no começo do deploy seguinte (passo "Cópia do último
     deploy", antes de regravar os arquivos). Sem cópia (nunca implantado), nada é restaurado.
- **"Ler compose"** (`POST /api/environments/compose-services`) passa a devolver também `values` por serviço
  (`normalizeServiceValues`, `service-overrides.ts`): do JSON do `config --no-env-resolution --no-interpolate` (central e
  adotado; `${VAR}` volta como escrito) ou do YAML bruto da revisão vigente (gerenciado; formas curtas de portas com IP e
  intervalo, volumes `:ro`, `environment` em lista, `command` em texto, `depends_on` em lista). `${VAR:-padrão}` fica inteiro
  ao separar por `:` (porta publicada e destino do volume aceitam `${VAR}`). Porta ou volume que não dá para ler na forma da
  tela (ex.: alvo `${VAR}`) vem em `unreadable` e o campo avisa "Não foi possível ler este item do compose: …" (ao
  personalizar, ele sai do serviço), em vez de sumir calado.
- **Tela** (seção **Serviços do compose** da página Novo/Editar, `ServicesSection`, OPE-211 v2): **lista e painel**.
  - **Lista** (`ServiceList`, à esquerda no `lg`; abaixo, um `SearchPicker` "Serviço: app" acima do painel): os serviços do
    compose lido, na ordem do compose, e depois os que têm ajuste ou limite salvo mas não estão no compose
    (`serviceListItems`, `services-form.ts`). Selos: "build" ou a imagem do compose, "imagem própria", "N ajustes", "fora do
    ambiente" (não está entre os escolhidos na Origem) e "não está no compose". Escolha por clique ou ↑/↓; o escolhido vai
    na URL (`?servico=`) e o primeiro vem escolhido. Lendo: skeleton das linhas; sem serviços, estado vazio.
  - **Painel** (`ServicePanel`): nome, resumo dos ajustes e "Desfazer os ajustes deste serviço" (com confirmação). Campos
    em grupos (`SERVICE_FIELD_GROUPS`): **Imagem e comando** (imagem, command, entrypoint), **Rede** (portas publicadas,
    depende de), **Armazenamento** (volumes), **Saúde e ciclo** (healthcheck, restart), **Variáveis e labels**
    (environment, labels) e **Recursos** (ver "Limites de recursos"). Cada campo (`ServiceFieldRow`) mostra o valor do
    compose com o selo "do compose" e **Editar**, que abre o editor no lugar já com o valor do compose (ou vazio, sem
    leitura); personalizado, mostra o editor, "No compose: …" e **Voltar ao do compose** (grava `null`, com "Desfazer" no
    toast). O serviço entra nos ajustes no primeiro campo editado e sai quando nenhum campo fica personalizado
    (`setOverrideField`). Editores: imagem (`Input`); command/entrypoint como **Linha de comando** (dividida como o
    compose faz, `splitCommandLine`) ou **Um argumento por linha**; environment e labels (`KeyValueRows`, compartilhado com
    as Variáveis extras); portas, volumes e dependências em tabelas com cabeçalho de coluna (`TableHeader`; abaixo do `sm`
    as linhas empilham), "Adicionar …" no fim, `OptionTabs` para protocolo, tipo e condição e o serviço da dependência por
    `SearchPicker`; restart em `OptionTabs` (Nunca, Sempre, Se falhar, Até ser parado); healthcheck Shell/Exec/Desligado
    com as durações. Avisos no campo: item do compose não lido, chave do environment também nas Variáveis extras e,
    executando no PC, porta publicada fora de Execução › Portas. As chaves do YAML avançado do serviço aparecem como chips
    no fim do painel, com "Abrir o YAML avançado".
  - **YAML avançado** (bloco recolhível, aberto quando há YAML salvo): o `ComposeEditorField` (limite de 64 KB, exemplo e
    ajuda próprios) com o erro em tempo real.
  - **O que muda no deploy** (bloco recolhível, `DeployPreview`): o `docker-compose.opex.yml` que o próximo deploy vai
    gerar com o que está na tela, pela mesma função do deploy (`deployPreview` → `overrideYaml`, `editor-sections.ts`):
    valores do environment como `[valor oculto]`, só os serviços escolhidos na Origem, `env_file` só com Variáveis extras e
    a imagem do registry com marcadores (`localhost:<porta>/opex-env/<slug>-<serviço>:<commit>`). No Editar de ambiente
    implantado, o selo "Difere do implantado"/"Igual ao implantado" e o resumo do implantado.
  - Falha da leitura: aviso com "Tentar novamente"; os ajustes salvos continuam na lista e Salvar fica livre.
- **Linha**: "serviços: app imagem nginx:1.27 · 3 ajustes" (os implantados) e o selo **"Ajustes dos serviços salvos diferem
  dos implantados: faça Deploy"** (`composeOverridesPendingDeploy`: salvo × `deployedComposeOverrides`, só em ambiente
  implantado; serviço sem campo personalizado, ordem e espaços nas pontas do YAML não contam).
- **Auditoria**: `servicos` (resumo em texto, do environment só as chaves) no antes/depois. O portal do cliente não recebe
  nada disso.

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
  deploy com `compose: vN`, limites aplicados), `get_environment` (origem, máquinas, só os **nomes** das variáveis, URL de saúde,
  `limites: { salvos, configuracao, aplicados, diferem }`, serviços com os limites de cada container),
  `get_environment_logs` (últimas linhas, até 200, sem ANSI), `list_environment_deploys`
  (30 últimos), `get_environment_deploy` (resumo + fim do log, o ao vivo do processo quando em
  andamento), `list_unmanaged_projects`, `get_environments_settings` (com o estado do registry),
  `get_environments_builder` (builder do servidor: estado, limites aplicados e salvos, uso, avisos e, sem
  configuração, a sugestão para gerenciar).
- Escrita sem confirmação: `create_environment` (campo `kind`: `central`, o padrão, com `centralId` obrigatório e ref
  `main`; ou `managed`, com o YAML em `compose` obrigatório, que vira a v1, e sem central/ref/arquivo. A origem vai
  num campo achatado `kind`, no formato que a ferramenta já usava. Slug sugerido pelo nome, projeto = slug). O compose
  em si só se edita pela tela (não há ferramenta de revisões); `start_environment`, `create_environments_builder`, `start_environments_builder`.
- `create_environment` e `update_environment` aceitam `limits` (o mesmo `environmentLimitsSchema` da tela; substitui os
  limites salvos inteiros, `null` num campo = sem limite).
- `create_environment` e `update_environment` aceitam `composeOverrides` (OPE-211, o mesmo `composeOverridesSchema` da tela;
  substitui os ajustes salvos inteiros; ausente mantém; `null` no editar = sem ajustes). `get_environment` traz
  `ajustesDosServicos: { salvos, configuracao, implantados, diferem }` e `list_environments`, `ajustesImplantados` e
  `ajustesNaoImplantados`. Os valores do `environment`, dos `labels` e do YAML avançado nunca vão para o modelo, o card
  nem o histórico (`redactComposeOverrides`, `opex-format.ts`): a `configuracao` do `get_environment` e o `redact` das
  ferramentas de criar/editar levam as chaves (e, no YAML, as chaves e as tags) com os valores como `[valor oculto]`.
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
- **Limites** (OPE-193): no override, por serviço (ver "Limites de recursos").
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
  incluem quando existe — um adotado ainda não implantado pelo app derruba/reinicia/apaga sem ele): `env_file`, os limites de
  recursos preenchidos, os ajustes dos serviços (OPE-211, ver "Serviços do compose") e, com build e execução em máquinas
  diferentes, `image: localhost:<porta>/opex-env/<slug>-<serviço>:<commit>` (menos nos serviços com imagem própria).
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

- Limites dos ambientes: campo vazio não escreve chave no override, então um limite declarado no próprio compose do
  projeto continua valendo (aparece em "No host hoje" no Editar); tirá-lo exige editar o compose. Limites novos só
  entram com Deploy (Reiniciar/Levantar não). "Ler compose" de uma central só traz os YAML da ref: `include`/`extends` de arquivos com outra extensão falham.

- Serviços do compose: as tags `!reset`/`!override` exigem Docker Compose v2.24.4 ou mais nova na máquina dos arquivos (a
  conferência do override falha cedo). `depends_on` para um serviço fora dos serviços escolhidos na origem sobe a
  dependência mesmo assim (regra do compose). Pasta (bind) relativa é a partir da pasta do primeiro arquivo do compose. O
  YAML avançado não declara `networks`/`volumes` de topo. Valores em texto simples no banco e nas ferramentas do Agente Opex.

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
  (`ClienteAmbientesPage`) lista os ambientes **no mesmo card do dono** (OPE-211, `PortalEnvironmentCard` com as peças de
  `components/card/`): estado ("No ar", "Parcial", "Parado", "Nunca implantado", "Implantando"), nome (sem link), slug,
  ref e versão em execução (ou a implantada); os containers com serviço, situação e **portas** (link e copiar, com o
  host das Configurações do dono, `PortalEnvironmentDto.portLinkHost`, ou o da página), sem CPU/RAM nem limites; no
  rodapé, o último deploy (texto) e "N/M no ar". Admin: **Implantar** visível e Levantar/Reiniciar no menu ⋯. Skeleton
  `EnvironmentCardSkeleton variant="portal"`. Atualiza a cada 15 s e em tempo real.
- **Vínculo**: o cliente vê só ambientes de origem **central** cuja central (`AgenticCentral.projectId`)
  está em `client.projectIds`, conferido em **toda** requisição (`server/portal.ts`). Projetos
  **adotados**, **compose gerenciado** e ambientes de outro cliente nunca aparecem e respondem 404 nas ações.
- **Visão reduzida** (`PortalEnvironmentDto`, `toPortalEnvironment`): sem variáveis, máquinas, portas liberadas do
  ambiente, caminhos, nome dos containers, CPU/RAM, limites, commit, erro nem log do deploy. Por serviço vai só o estado,
  a situação, a versão e as portas que ele escuta (`listen`, OPE-211, decisão do dono; o Agente Opex do portal também as
  vê, por ler o mesmo DTO).
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
  gerenciado), `service-overrides.ts`, `override-yaml.ts` e `services-form.ts` (serviços do compose, puros),
  `hooks/useFormComposeRead.tsx`, `hooks/useEnvironmentEditor.ts`, `editor-sections.ts`, `environment-editor-layout.ts`,
  `components/editor/` (página Novo/Editar, OPE-211) e `components/services/` (editores dos campos), `server/compose-revisions.ts`, `hooks/useEnvironmentCompose.ts`, `components/` (tela do dono;
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
  `compose-revisions`, `compose-ui`, `service-overrides`, `editor-sections`, `environment-editor-ui`,
  `opex-tools`, `portal`, `portal-ui`, `builder-commands`, `builder`, `builder-ui`),
  `__tests__/features/agentic/build-queue.test.ts` (`runExclusiveBuild` e a recriação pendente antes da
  próxima mesa), `__tests__/features/opex-agent/client-tools.test.ts` (grupo do portal).
