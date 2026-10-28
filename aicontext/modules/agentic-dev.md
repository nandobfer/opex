# Módulo: Desenvolvimento agêntico (`/desenvolvimento` + `/integracoes/ia`)

Agentes do **OpenCode** (só ele) trabalham numa tarefa dO Opex do plano ao merge. Cada
uma tarefa tem uma **mesa de trabalho**; cada **projeto** (repositório vinculado no GitHub) tem uma
**central** que aponta o repositório na máquina do OpenCode. OpenCode, Docker das prévias e o Opex
rodam na mesma máquina.

Código: `src/features/agentic/` (domínio), `src/lib/ai/opencode-client.ts` (cliente oficial
`@opencode/client`), `src/lib/ai/opencode-events.ts` (eventos normalizados, puro) e
`src/lib/ai/opencode-run.ts` (runner genérico de um turno — compartilhado com o refinamento de
tarefas, ver `modules/refinement.md`). Modelos em `src/lib/db/models/Agentic.ts`; a saída gravada
(`agentic_events`) também é usada pelo refinamento. O backup do MongoDB da prévia (OPE-54) tem
caminhos puros em `src/features/agentic/preview-backup.ts` e reserva/conferência em
`src/features/agentic/server/preview-backup.ts`; se ele roda ou não é uma opção da central
(`environment.backupDatabase`, OPE-72 — ver “Backup do MongoDB da prévia”).

## Configuração (Integrações › Provedores de IA › aba "Desenvolvimento agêntico")

- Configuração geral em `ai_feature_settings` (`feature: "agentic-dev"`,
  `agenticSettingsSchema`): **ativa**, o **agente padrão** (agente, modelo `provedor/modelo`,
  variante, com os **modelos de fallback** — ver "Modelos de fallback") de cada etapa — **Planejamento**, **Implementação**, **Build e ambiente** (também faz a
  limpeza) e **Pull Request** — e as **colunas globais** (`columns`, OPE-79): a coluna da **fila** e
  os destinos da **movimentação** (ao abrir a mesa, ao abrir o PR e ao concluir), todos "nenhuma/não
  mover" por padrão — e a **correção de CI padrão** (`ci`, OPE-81: `fixCi` ligada e `ciFixLimit`
  vazio = sem limite; configuração antiga sem `ci` cai nesse padrão via `withDefaultAgents`) — e o
  **chat durante a execução** (`liveChat`, desligado por padrão; ver "Chat durante a execução"). Agentes/modelos (inclusive os de fallback) são conferidos no OpenCode ao salvar (com a feature ativa, exige
  o OpenCode conectado).
- Disponível = ativa + OpenCode configurado e conectado (`agenticAvailability`).
- A aba tem duas **abas internas** (estado local, não vão à URL; padrão **Agentes**):
  - **Agentes**: card que liga a feature (ativa) + os **agentes padrão** de cada etapa + os dois
    cards de **colunas globais** — **Fila da central de desenvolvimento** (OPE-79) e
    **Movimentação das colunas** — e o card **Corrigir CI falho** (padrão global, OPE-81) e o card **Chat durante a execução**
    (`settings.liveChat`), com os botões **Salvar**/**Desfazer** (mesma configuração geral
    acima). Salvar reavalia as filas das centrais que herdam a coluna global.
  - **Centrais de desenvolvimento**: card com a lista das centrais (abaixo). Endereçável por
    `?aba=desenvolvimento-agentico&abaAgentic=centrais`; a troca preserva os demais parâmetros e
    mantém a confirmação de descarte. A subaba padrão continua Agentes.
  Trocar de aba com alterações não salvas pede *"Descartar alterações?"* e restaura os valores
  salvos (mesmo efeito do Desfazer). `AGENTIC_SETTINGS_HREF` (voltar da central, após excluir e
  atalho do `/desenvolvimento`) leva a esta aba na aba interna padrão (Agentes).
- Card **Centrais de desenvolvimento**: **busca** + lista (projeto, diretório, repositório, mesas,
  bolinha do último teste) e **Nova central** (projeto — repositório vinculado, um por central — e
  diretório das sessões, caminho absoluto, já sugerido como `<raiz dos repositórios>/<repositório>`).
  Criar leva às configurações da central.
  - A busca (**Buscar centrais**) casa o **projeto**, o **repositório** e o **diretório das sessões**,
    sem acento nem caixa, com todos os termos digitados; sem nenhum trecho que case, tolera erro de
    digitação (fuse.js). A ordem da lista é preservada (regra pura em
    `src/features/agentic/central-filters.ts`, `filterCentrals`).
  - O texto aparece na hora e vai para a **URL** (`?buscaCentrais=…`, preservando `?aba=…` e os
    demais parâmetros) com o atraso padrão das buscas do projeto (500 ms) — `useCentralSearch`
    (`src/features/agentic/hooks/useCentralSearch.ts`). Limpar (X do campo ou a ação do vazio)
    remove o parâmetro.
  - Sem resultados, o card mostra o vazio **Nenhuma central encontrada** com **Limpar busca**
    (distinto de "Nenhuma central ainda", quando não há centrais). A busca filtra só a lista:
    **Nova central** continua oferecendo todos os projetos disponíveis.
- O campo **Projeto (repositório)** do diálogo *Nova central* é um `SearchPicker` com o item de
  repositório do GitHub (`GithubRepoLabel`: avatar, `owner/repo`, descrição e cadeado de privado),
  buscável por repositório, nome do projeto e sigla (fuse.js) — as opções continuam sendo os
  **projetos vinculados** (`GET /api/tasks/options`), e o índice do GitHub (`useGithubRepoIndex`, o
  mesmo do `ClienteDialog`) só enriquece a exibição. Sem os metadados do GitHub (token ausente ou
  falha), o item cai no `owner/repo` do projeto e segue selecionável. Projeto que já tem central fica
  bloqueado com o motivo; a lista vazia, o carregamento, o "não encontrado" e a falha da consulta
  (com **Tentar novamente**) têm estado próprio.

### Central (`/integracoes/ia/centrais/[id]`, `agentic_centrals`)

Configuração validada por `centralConfigSchema` (mesmo schema na tela e na API; campos ausentes
caem nos padrões em `parseCentralConfig`). Abas (`?aba=`, "Descartar alterações?"):

| Aba | Campos |
|---|---|
| Geral | ativa, diretório das sessões, pasta dos worktrees (padrão `<diretório das sessões>/worktrees`), mesas abertas ao mesmo tempo (1–10, padrão 2), **Chat durante a execução** (`liveChat`: **Padrão global** — padrão, inclusive para centrais antigas, com o estado global no rótulo — / Ligado / Desligado; ver "Chat durante a execução"), repositório (do vínculo em Integrações › GitHub) |
| Agentes | cada etapa herda o padrão da aba ou é personalizada (override campo a campo: agente vazio herda; modelo próprio leva a variante própria — `resolveAgent`); etapa personalizada escolhe os **modelos de fallback**: Usar os do padrão / Personalizar / Sem fallback (ver "Modelos de fallback") |
| Git e PR | branch base, branch de destino do PR, padrões da branch/commit/título (`{code}`, `{title}`, `{slug}`), PR rascunho, **merge automático** (o agente mergeia o PR e apaga a branch remota — ver “Merge automático”), card **Corrigir CI falho** (`git.inheritCi`: **Padrão global** — padrão das centrais novas e das antigas sem valor próprio — ou **Personalizar** com `git.fixCi`, padrão ligado, e `git.ciFixLimit`, 1–20, vazio = sem limite; efetivo em `resolveCentralCi` — ver “CI falho”), revisores, labels, comandos de preparo do worktree e de validação antes do PR |
| Ambiente | fluxo padrão da mesa (**Publicar prévia**, ligado por padrão; desligado = PR automático direto — OPE-79), arquivo do compose (vazio = padrão do projeto), variável da porta (padrão `PORT`), faixa de portas da prévia (porta inicial/final, padrão 4001–4098), endereço da prévia (host, padrão `localhost`), caminho do teste de saúde, tempo máximo do build, **backup do banco de dados** (padrão **ligado**; desligue em projetos sem banco — ver “Backup do MongoDB da prévia”, OPE-72). Com **Publicar prévia desligado** os demais campos do ambiente são ocultados (os valores salvos são preservados) |
| Colunas e conclusão | **Fila** e **Movimentação** das colunas, cada uma herdando o padrão global da aba ou **personalizada** nesta central (OPE-79); limpeza após o merge (derrubar a prévia, remover o worktree, apagar a branch local) — tudo padrão **sim**; o backup da prévia é sempre removido na conclusão; o que vai para o planejador (comentários, histórico) |
| Instruções | texto extra anexado às mensagens de cada etapa |
| Logs | terminal (`IntegrationDebugConsole` da integração `ai` com `scope=agentic:<id>`), sempre gravado (`integrationDebug(..., { always: true })`, 48 h) |
| Mesas | mesas da central com etapa e atalho |

- **Testar central** (`POST /api/agentic/centrals/[id]/test`): pelo `shell` do OpenCode no
  diretório da central confere `git rev-parse --show-toplevel`, `git ls-remote` das branches base e
  de destino, `gh auth status`, `docker compose version`, o arquivo do compose e a pasta dos
  worktrees; mais feature/OpenCode e o vínculo do repositório (aviso). Grava `lastTest`.
- Excluir a central só sem mesas em andamento (apaga as concluídas e a saída delas).

## Fila da central de desenvolvimento

Cada central pode apontar uma **coluna da fila** (`columns.queue`, `null` = desligada; aba "Colunas e
conclusão"). A coluna pode ser **personalizada** na central ou **herdada** do padrão global da aba
"Desenvolvimento agêntico" (`columns.inheritQueue`, OPE-79) — o que vale é sempre a **coluna
efetiva**. Ao mover um card para essa coluna, a tarefa do projeto entra na fila para abrir a mesa:

- **Vaga livre** (mesas abertas `< maxConcurrent`) → a mesa é criada **na hora** e o planejamento
  começa (o mesmo fluxo de "Abrir mesa e gerar o plano").
- **Sem vaga** → a tarefa **aguarda na fila** e a mesa é criada quando uma mesa conclui (ou é
  excluída). A ordem é a **dos cards no kanban** (`order`); a posição (1-based) aparece na lista de
  tarefas e na mesa como "Na fila · #N".
- O **limite** (`maxConcurrent`, 1–10) conta o trabalho ativo: **Plano pronto**, **Revisão bloqueou**
  (Agente Adversário), **Prévia pronta**, **PR aberto** e **Concluída** não ocupam vaga (a **Revisão
  adversária** ocupa). Uma mesa já ocupando vaga pode encadear os turnos.
  Retomar uma etapa isenta com a central cheia grava `pendingTurn` (FIFO), mostra posição e oferece
  **Cancelar espera**. Retomadas têm prioridade sobre novas tarefas, inclusive sem coluna de fila.
  Feedback de PR, resolução de conflito, merge e limpeza pós-merge respeitam a espera. Reabrir só
  move a tarefa e arquiva o PR quando a vaga chega. A fila global de build permanece independente.
- A fila é **derivada** (`DevTask` do projeto na coluna, não arquivadas e sem mesa) — não há coleção
  própria. `GET /api/agentic/centrals/[id]/queue` devolve a fila para a tela.
- **Gatilhos**: mudança de coluna da tarefa (criar/atualizar/mover/lote) avisa a central; concluir
  ou excluir uma mesa libera a vaga; mudar a config da central reavalia a fila. A rotina interna
  **`agentic-queue-pump`** (1 min, Crons) cobre reinícios e vagas liberadas fora do processo.
- Sem OpenCode conectado, ou com a feature/central desativada, a tarefa **permanece na fila** e é
  iniciada quando ficar disponível. Mover o card para fora da coluna remove a tarefa da fila.
- Excluir a coluna da fila é bloqueado (`COLUMN_QUEUE_IN_USE`): vale para a coluna de uma central
  (personalizada ou herdada) **e** para a fila padrão global da aba. Troque a coluna da fila antes.

## Fila do build (um build por vez)

### Método da prévia: Local ou GitHub Action

Na central → Ambiente, `environment.previewMethod` seleciona **Local** (padrão, inclusive
registros antigos) ou **GitHub Action**. O seletor segmentado mostra workflow (`githubWorkflow`,
padrão `preview.yml`) e serviço Compose (`previewService`, padrão `app`) no modo remoto.

- **Local:** implementação → `build_queued` → `building`. Mantém fila global e build no servidor.
- **GitHub Action:** implementação → `building`, diretamente, sem fila. Builds remotos podem
  rodar em paralelo e não bloqueiam builds locais. PR automático continua pulando os dois métodos.
- O método é salvo por tentativa em `previewBuild`; trocar configuração não altera o build em
  andamento. Retentativa remota também pula fila, mesmo se a configuração mudou depois.
- A etapa continua sendo um turno do agente Build na sessão da mesa. O agente cria/reutiliza o
  backup do banco (quando ligado na aba Ambiente) e executa
  `npx tsx scripts/preview-github.ts <estado> <tentativa>` no worktree.
  O workflow e o runner devem estar instalados no projeto com a skill global
  `~/.agents/skills/setup-preview-workflow/`. O Opex inclui os dois como referência funcional.
- O runner autoriza **push da branch antes da aprovação**, sem abrir PR. Exige worktree limpo,
  branch da mesa e SHA imutável. Dispara `workflow_dispatch` na branch padrão; nenhum push/PR
  dispara publicação de prévia. Workflow: suíte completa → build → artefato com checksum/manifest.
- A porta permanece reservada no banco, dentro da faixa da central. O GitHub não escolhe portas.
  Estado `remote-preview-<tentativa>.json` fora do worktree, na pasta do backup, guarda tentativa, SHA, runId
  e confirmação de publicação. A URL do run aparece nos logs da sessão; reconexão pode retomar
  o run registrado. O agendador existente e a reconciliação de turnos continuam cobrindo reinícios.
- O runner baixa o artefato daquela execução, valida SHA/tentativa/checksum, confere backup (só
  quando ligado na central) e worktree, revalida porta e importa a imagem. Publica com override
  Compose por tentativa, `--no-build --pull never`, mesma variável de porta/projeto/serviço. Porta
  ocupada por outra aplicação falha; container da própria mesa pode ser recriado. Não há fallback
  para build local.
- Cancelamento, exclusão, correção e nova tentativa invalidam o estado antigo; o runner verifica
  a reserva lógica durante a espera e imediatamente antes da publicação. Timeout/falha também
  invalidam a tentativa. O app exige confirmação remota, backup e saúde antes de liberar a prévia.
  A reserva/invalidação e o Compose compartilham `flock` por mesa, evitando corrida entre uma
  execução antiga e uma nova publicação. Host Linux precisa de `flock` (util-linux).
- Credenciais de GitHub vêm do `gh` autenticado no host do OpenCode (mesmo requisito dos PRs).
  Token precisa permitir Actions e push. Nenhum secret SSH/produção, .env ou dump vai ao GitHub.
  Variables públicas do build são de repositório; configurar plataforma e URLs apropriadas à prévia.
- A limpeza remove a pasta do backup (estado, artefatos e override) e derruba Compose/libera porta
  conforme as opções atuais. CI obrigatório do PR e testes da main permanecem independentes;
  reaproveitamento de resultados por SHA não foi introduzido.

**Builder Machine** (`modules/builder-machine.md`): com a integração ativa, o túnel do PC aberto e a
central usando o PC (card na aba Ambiente, oculto no método GitHub Action), o build **Local** vai para
o Docker do PC: `prepareBuildTurn` chama `resolveBuildTarget` (import dinâmico memorizado, só com a
integração ativa), a porta pula as ocupadas no PC e no servidor, o servidor repassa a porta pelo túnel,
o aviso ganha "(prévia na máquina local)" e o `buildPrompt` recebe `docker: { prefix }`
(`DOCKER_CONTEXT=opex-local BUILDX_BUILDER=…` em todo comando docker; o builder da central é ignorado;
não combina com a seção do GitHub Action). Trocar para o GitHub Action derruba a prévia anterior que
estava no PC. Na limpeza (merge, exclusão, tentar a limpeza de novo), a prévia que estava no PC é
derrubada pela Builder Machine e o agente pula o `docker compose down`. Forks não usam a Builder Machine.

A subida da prévia **Local** usa o Docker da máquina e roda **uma por vez em todo o Opex** (global, acima das
centrais). Ao concluir a implementação, a mesa entra na fila em vez de subir direto:

- A mesa vai para a etapa **`build_queued`** ("Na fila do build") e aguarda; a posição (1-based)
  aparece na lista de tarefas e na mesa como "Na fila do build · #N".
- Um **motor** (`build-queue.ts`, `pumpBuildQueue`) inicia o próximo build quando **não há nenhum
  build vivo no processo** (mesa em `building` e executando). A ordem é **FIFO** pela hora de entrada
  (`buildQueuedAt`); a porta da prévia só é reservada quando a vez chega (`startBuildTurn`).
- **Gatilhos**: fim da implementação, fim de cada build (sucesso ou falha/interrupção) e a rotina
  interna **`agentic-queue-pump`** (1 min, Crons), que cobre reinícios e vagas liberadas fora do
  processo.
- **Tentar novamente** num build que falhou **volta para a fila** (`build_queued`) em vez de subir
  direto. Enquanto aguarda, a mesa fica `idle` (o apontamento de horas não corre) e **não** oferece
  ações além de excluir a mesa.
- Um build órfão (o app reiniciou no meio) não trava a fila: só conta como build em andamento o
  turno vivo neste processo; ao ser lida, a mesa órfã vira `interrupted`.

## Backup do MongoDB da prévia (OPE-54 · opcional pela OPE-72)

Antes de publicar a prévia, o agente cria um **dump do banco MongoDB do próprio projeto** (não o do
Opex) e a mesa só conclui depois de removê-lo. Pipeline: `preview-backup.ts` (caminhos puros),
`server/preview-backup.ts` (reserva e conferência) e os prompts de build/limpeza.

- **Execução opcional por central** (`environment.backupDatabase`, aba **Ambiente**, padrão **ligado**):
  desligada, a prévia sobe **sem dump** — para projetos que não têm banco de dados, em que a etapa
  falhava por não haver o que copiar. O valor vive no schema da central (`centralConfigSchema`), é
  salvo como o resto da configuração (auditoria + Pusher) e `parseCentralConfig` mantém centrais
  antigas com o backup **ligado** (compatibilidade).
- A opção é **efetiva por tentativa** (`previewBuild.dumpRequired`): desligá-la não altera o turno que
  já está rodando; **Tentar novamente** depois de desligar reaproveita a configuração salva e sobe a
  prévia sem o dump (destrava a retentativa que falhava por falta de banco).
- **Desligada no modo remoto**: a pasta do ciclo continua sendo reservada porque é nela que ficam o
  estado da tentativa (`remote-preview-<tentativa>.json`), os artefatos e o `flock`; o que sai é a
  **exigência** do arquivo — `scripts/preview-github.ts` só rejeita o dump ausente/vazio quando
  `dumpRequired` não é `false` (estado gravado por versão anterior, sem o campo, continua exigindo).
  Projetos já instalados precisam reaplicar a skill `setup-preview-workflow` para receber o script
  atualizado — sem ele, a prévia remota com o backup desligado continua falhando por dump ausente.
- **Limpeza independente da opção**: um backup já registrado (ligado em um ciclo anterior) continua
  sendo removido na conclusão/exclusão, e a reserva anterior é preservada nas retentativas mesmo com a
  opção desligada.
- **Caminho reservado antes do build**: ao iniciar o turno de build (`startBuildTurn`), a mesa
  reserva uma pasta exclusiva do ciclo em `<pasta dos worktrees>/.opex-backups/<código>/<ciclo>/`
  (`previewBackup` na mesa: `dir`, `path`, `createdAt`) e o prompt de build manda criar o dump ali
  como arquivo único (`mongodump --archive ... --gzip`), limitado ao banco do projeto e **sem
  imprimir credenciais**. A pasta fica **fora do worktree**, então nunca entra em commit nem é
  derrubada pelo `git worktree remove`. Com o backup desligado no modo **local** a reserva é
  dispensada (a mesa fica sem `previewBackup` e conclui sem etapa de limpeza).
- **Primeiro dump preservado**: retentativas do build e correções da prévia **reutilizam** o arquivo
  já criado (o prompt manda reutilizar quando existir; só cria quando não há nenhum). Reabrir a mesa
  zera a reserva, então o próximo build começa um **ciclo novo** (pasta nova).
- **Conferência no servidor**: ao fim do turno de build, o Opex confere na máquina do OpenCode
  (`runOpencodeShell`, `test -s`) que o dump existe e não está vazio; sem ele o build **falha** — a
  prévia não vale sem backup. O bloco JSON do agente não basta.
- **Remoção na conclusão**: a etapa `finishing` sempre inclui a remoção do backup (mesmo com a
  limpeza de ambiente desligada na central) e a mesa **só conclui** (`done`) depois de confirmar
  (`test ! -e`) que o arquivo não existe mais. Enquanto o arquivo existir, a etapa falha e a mesa
  oferece **Tentar novamente**; se a limpeza não puder nem começar, a mesa com backup fica em
  `finishing` (não conclui).
- Mesas abertas antes desta funcionalidade (sem `previewBackup`) seguem concluindo sem backup.
- A **exclusão da mesa** (OPE-68) roda a mesma limpeza e remove o dump antes de apagar o registro
  (ver "Excluir mesa"); abandonar a mesa (deixá-la parada) não remove o dump.

## Central de desenvolvimento (`/desenvolvimento/[tarefa]`)

- Item próprio no menu. A **central selecionada vive no `localStorage`**
  (`opex:dev-center-central:v1`) e a **tarefa na URL** (`/desenvolvimento` sem tarefa,
  `/desenvolvimento/[tarefa]` com a mesa aberta). A central efetiva é a do projeto da tarefa
  aberta, senão a salva, senão a primeira; trocar de central limpa a tarefa da URL. A **escolha feita
  no seletor tem prioridade** sobre a central do projeto da tarefa até a tarefa sair da URL: a central
  escolhida fica salva e a tarefa é limpa (o guarda evita que a central da tarefa regrave por cima a
  escolha no render intermediário entre a troca e a navegação). Duas colunas:
  **Tarefas do projeto** | **Mesa de trabalho**. No **celular** (`< lg`) só um painel aparece por
  vez: a lista quando não há tarefa aberta; a mesa quando há, com um botão **Voltar para tarefas**.
  A altura da central é sempre delimitada pela área visível (`useScrollViewportHeight`), inclusive
  no celular, para a saída da IA rolar por dentro e o botão **Ir para o final** aparecer.
- O topo da coluna de tarefas traz, de cima para baixo: o **título "Tarefas"** com a contagem e a
  **área de filtros recolhível** (`CollapsibleTaskFilters`, mesmas peças do `ListFilters` de /tarefas
  em `src/components/list/CollapsibleFilters.tsx`, sem botão de limpar). Ela **começa recolhida** a
  cada carregamento (o estado não é salvo; trocar de tarefa ou central o mantém) em no máximo duas
  linhas: "FILTROS" com o chevron e, abaixo, numa linha só, os chips dos filtros fora do padrão
  (`activeDevCenterFilterChips`, `dev-center-filter-chips.ts`; no máximo 2 + "+N" com o restante na
  dica) ou "Nenhum filtro ativo · clique para filtrar". Chips: **Projeto** (só com uma central
  escolhida; o × volta para "Todos os projetos"), **Só mesas ativas**, **Colunas** (só quando restringe;
  nenhuma marcada = "Colunas: nenhuma"; o × volta para todas), **Estado** e **Busca**; o × remove só
  aquele filtro sem expandir. Clicar no resumo ou no chevron expande (altura animada com Framer
  Motion); o chevron ⌃ recolhe. Abaixo dela fica o painel **Quota do OpenCode** (`OpencodeQuotaPanel`,
  ver `modules/opencode-quota.md`). Expandida, a área mostra os filtros: a
  chave **"Só mesas ativas"** (`Switch`, `ActiveWorkbenchSwitch`, linha inteira — o primeiro filtro); o
  **seletor da central** (`SearchPicker`/`CentralPicker`) ocupando a **linha inteira** — o gatilho
  mostra o **repositório do GitHub** (`GithubRepoLabel` — avatar + `owner/repo` + cadeado) e a lista
  é buscada por nome/projeto; a **busca por código/título**; e o **filtro de colunas**
  (`CadastroMultiSelect`) também em linha inteira; por fim a lista. A engrenagem à direita de
  **Tarefas** abre a configuração da central selecionada; em **Todos os projetos**, abre diretamente
  a subaba **Centrais de desenvolvimento** de `/integracoes/ia`. O avatar real vem do índice de
  repositórios do GitHub (`RepoIndexProvider`, montado no layout de `/desenvolvimento`); sem token,
  cai na inicial.
- Navegar entre tarefas ou centrais **não** anima nem remonta a página inteira (`/desenvolvimento`
  está em `PERSISTENT_PAGE_HREFS` da casca e a central é renderizada pelo layout de
  `/desenvolvimento` — `DevCenterRoute` lê a tarefa por `useParams`; as páginas retornam `null`):
  as colunas ficam paradas (rolagem e filtros mantidos)
  e só o que mudou faz um fade curto — a mesa ao trocar de tarefa, a lista de tarefas ao trocar de
  central (Framer Motion, sem deslocamento com movimento reduzido).
- A coluna **Tarefas** tem **largura fixa de 340 px** a partir de `lg` (a mesa fica ao lado, no
  espaço restante); abaixo de `lg` as colunas ficam empilhadas e a coluna ocupa a linha inteira.
- Tarefas: do quadro local filtradas pelo projeto da central (sem arquivadas), ordenadas pela
  ordem do quadro; filtros de **nome** (código/título, sem acento) e **coluna**, persistidos em
  `localStorage` (`opex:dev-center-filters:v1`), sem botão de restaurar na própria coluna (limpar
  pelos filtros persistidos, pelo `localStorage` ou pelo "Limpar filtros" do estado vazio). Lista
  virtualizada, com a altura de cada linha
  medida dinamicamente; cada item mostra o título e, **abaixo dele, o resumo (`summary`) da tarefa**
  quando houver (texto discreto, com o texto completo na dica e limitado a 2 linhas). Cada tarefa
  mostra a etapa da mesa ou, sem mesa, a posição na fila ("Na fila · #N"). Quando a mesa está
  **parada aguardando o
  usuário**, o item mostra um **warning** (ícone de alerta, com o motivo na dica): revisão do plano,
  aprovação da prévia, revisão/merge do PR, "mudanças pedidas no PR", permissão ou pergunta
  pendente do agente, falha/interrupção (regra `workbenchUserWaitReason`; o chip de etapa deixa de
  pulsar quando o agente não está executando). Mesa **na fila do build** mostra a fila e mesa
  **concluída** não gera warning.
- Tarefa sem mesa: o estado inicial mostra o **código, o título e a descrição** da tarefa, a
  chave **Gerar prévia** (ligada = Publicar prévia; desligada = PR automático, ver "Fluxo da mesa") — com a indicação
  de que a tarefa **segue o padrão da central** e a ação **Usar padrão da central** quando há uma
  escolha própria — e um campo
  opcional de **Informações adicionais** (enviadas ao planejador no primeiro prompt, junto da tarefa,
  e exibidas como mensagem do usuário na saída). O botão **Abrir mesa e gerar o plano** desabilita com
  o motivo quando indisponível, com a central desativada ou com a tarefa de outro projeto; em fila,
  mostra a posição e abre ao liberar a vaga.
- Página da tarefa: botão de ícone **Mesa de trabalho** leva à mesa; com mesa, assume a cor da
  etapa e a dica mostra o chip da etapa.

## Mesa de trabalho (`agentic_workbenches`, uma por tarefa)

Uma **única sessão do OpenCode** do início ao fim (criada no diretório da central); cada etapa é
um **turno** em que o app troca agente/modelo (`switchAgent`/`switchModel`) e envia a mensagem da
etapa (`prompts.ts`). Os turnos rodam **em segundo plano no servidor** (`workflow.ts` +
`runner.ts`): fechar a tela não para a IA.

```
planning → plan_review ─┬─ Solicitar correção do plano → planning
                        ├─ Implementar (prévia Local) → implementing → build_queued → building → preview
                        ├─ Implementar (prévia GitHub Action) → implementing → building → preview
                        └─ Implementar (fluxo PR automático)   → implementing → opening_pr → pr_open
preview ─┬─ Solicitar correção → planning (texto vai ao planejador)
         └─ Aprovar e abrir PR → opening_pr → pr_open
pr_open ─┬─ comentário novo (conversa/linha) ou revisão com "@opex" → planning (automático)
         ├─ revisão "pediu mudanças" com texto → planning (automático)
         ├─ revisão sem texto → changes_requested (usuário descreve) → planning
         ├─ merge bloqueado por conflito → resolving_conflicts (automático) → pr_open
         ├─ CI falho (todas as verificações terminadas) → fixing_ci (automático) → pr_open
         ├─ merge automático (se ligado na central) → merging_pr → deleting_pr_branch → finishing (limpeza) → done
         ├─ merge → finishing (limpeza) → done
         └─ fechado sem merge → aviso (uma vez)
done → Reabrir mesa (texto ao planejador) → planning
```

- `runState`: `idle` | `running` | `failed` | `interrupted`. Ações por etapa em
  `workbenchActions` (mesma regra na tela e nas rotas): executando só **Parar**; falha/interrupção →
  **Reconectar** (acompanha a sessão existente **sem** reenviar mensagem — ver "Reconectar", com o
  ciclo automático 1 s→16 s quando a interrupção **não** veio de um Parar),
  **Tentar novamente** (reenvia a mensagem da etapa pedindo para retomar) e, depois do plano,
  **Voltar ao planejamento**.
- **Planejamento**: só leitura; o texto do turno vira uma nova **versão do plano** (com o pedido que
  a originou). A tarefa vai em Markdown (`buildUnderstandTaskPrompt`, **sem cortes** — opção
  `fullText`) + link. As **Informações
  adicionais** informadas ao abrir a mesa são anexadas ao **primeiro prompt** (seção própria, sem
  virar o "pedido" da versão 1) e aparecem como mensagem do usuário na saída.
- **Implementação**: a branch (`branchNameFor`) e o caminho do worktree (`worktreePathFor`) são
  definidos pelo app; **a IA** cria o worktree a partir de `origin/<base>` (ou reutiliza), **move a
  sessão** com a ferramenta `session_move` do OpenCode, roda o preparo e implementa (commits locais,
  sem push nesta etapa; no modo remoto o turno Build publica a branch). Ao fim o app confere o diretório da sessão; se não moveu, move pelo cliente (aviso).
  Ao aprovar o plano (ação **Implementar**), o usuário pode anexar **Informações adicionais**
  opcionais (campo mostrado na etapa de revisão do plano): elas são enviadas no prompt de
  implementação (seção própria do prompt) e aparecem como mensagem do usuário na saída — mesmo
  comportamento das informações informadas na abertura da mesa.
- **Revisão adversária (OPE-87)**: com o **Agente Adversário** ativo e a central no escopo, ao fim de
  toda implementação (`afterImplementation`) a mesa passa pela etapa `adversarial_review` (sessão nova
  do OpenCode, só leitura, contexto limpo) antes da prévia ou do PR; bloqueios voltam ao implementador
  (correção automática) ou param em `adversarial_blocked` (**Revisão bloqueou**: Corrigir, Revisar de
  novo, Seguir mesmo assim, saindo por `launchOrQueue` com as ações pendentes `adversarial-*`). Sem
  chat durante a revisão e sem Reconectar na revisão que falhou. Trilha com o passo "Revisão
  adversária" (`WorkbenchDto.adversarial`) e aba **Adversário (N)**. Ver `modules/adversarial-agent.md`.
- **Fluxo da mesa (OPE-53 · padrão da central na OPE-79)**: o estado inicial da mesa traz a chave
  **Gerar prévia** (`ToggleCard`, situação "Ligada"/"Desligada") — **ligada = Publicar prévia**,
  **desligada = PR automático**. A escolha salva na hora na tarefa
  (`DevTask.agenticFlow`, ajustável por `PATCH /api/tasks/[id]`) e é copiada para a mesa ao abrir
  (`agenticFlow`; registros antigos caem em `preview`). **Sem escolha** na tarefa (`agenticFlow`
  `null`) vale o **padrão da central** (`environment.publishPreview`, aba Ambiente; ligado =
  `preview`, desligado = `auto_pr`), tanto na abertura manual quanto na automática pela fila — a
  linha abaixo da switch mostra se a tarefa está seguindo o padrão e o botão **Usar padrão da
  central** volta a herdar. Em **PR automático** a implementação vai **direto** ao PR (etapa
  `opening_pr`, turno encadeado na mesma sessão), pulando a fila do build, a prévia e a aprovação:
  nenhuma porta é reservada e a limpeza não derruba ambiente. A revisão do plano continua obrigatória
  nos dois fluxos e a trilha da mesa esconde o passo "Prévia" no PR automático.
- **Gerar prévia (chave da mesa)**: com a mesa aberta, a chave **Gerar prévia** (`PreviewSwitch`, no
  canto esquerdo da barra inferior, depois do seletor de modelo e de um divisor vertical; rótulo à
  esquerda da chave, com a explicação na dica do rótulo) troca o fluxo **só desta mesa**
  (`agenticFlow` da mesa; a tarefa mantém o fluxo salvo) — útil, por exemplo, enquanto o PR é
  corrigido. Oculta em Finalizando e Concluída (409 na rota) e enquanto um campo de texto está aberto
  (ex.: Mudanças pedidas); disponível com o agente trabalhando. O fluxo é relido no fim de cada
  implementação e de cada build (`setWorkbenchPreview`, `workflow.ts`):

  | Ao desligar com a mesa em | Efeito |
  |---|---|
  | Fila do build | sai da fila e já publica no PR (`opening_pr`: abre, ou atualiza e comenta o PR existente) |
  | Build rodando (local ou GitHub) | o build termina e a mesa publica no PR sem parar na prévia (a prévia fica no ar) |
  | Prévia pronta | fica como está (aprovar/corrigir normalmente); vale na próxima implementação |
  | Outras etapas | vale no próximo fim de implementação |

  Ao **religar** com a mesa **parada em PR aberto**, gera a prévia do código atual na hora: no modo
  Local entra na fila do build → build → **Prévia pronta**; no modo GitHub o build remoto começa direto
  (aprovar atualiza o PR e volta a PR aberto). O build ocupa vaga: com a central no limite a mesa
  **aguarda vaga** com a ação **"Gerar a prévia"** (`pendingTurn.action = "generate-preview"`,
  cancelável; com a vaga, `startPendingTurn` a coloca no build em vez de lançar um turno). Nas outras
  etapas, religar vale na próxima implementação. Enquanto a mesa estiver na fila do build, no build ou
  em Prévia pronta, o **acompanhamento do PR fica pausado** (ele só olha mesas em PR aberto). Cada
  troca registra auditoria (`gerarPrevia`), publica no Pusher e avisa na saída; resposta otimista com
  reversão (`useSetWorkbenchPreview`).
- **Build Local**: ao fim da implementação a mesa entra na **fila global do build** (`build_queued`, ver
  acima) e só sobe quando não há outro build. A porta é reservada no banco (índice único) na faixa
  configurada na central (padrão **4001–4098**), pulando portas ocupadas no host
  (`allocatePreviewPort`); a IA roda
  `<VAR>=<porta> docker compose -p <projeto-código> [-f arquivo] up -d --build` no worktree e
  termina com um bloco JSON `{"ok": true|false, "error"?}`. O app espera a prévia responder
  (`http://<host>:<porta><saúde>`, até 90 s). Prévia pronta: **Solicitar correção** e **Aprovar e abrir
  PR** (com PR aberto — `pr.state === "open"` — o rótulo é só **Aprovar**: o PR existente é
  atualizado). A prévia e o PR abrem pelos links do cabeçalho da mesa, em nova guia (a barra não tem
  atalhos para eles). **Abrir fork** (sempre o primeiro da linha; bloqueado com a dica "A mesa está
  sendo excluída" durante a exclusão), **Solicitar correção** (e a variante **Voltar ao
  planejamento** da mesa com falha) e **Solicitar correção do plano** são botões de ícone com dica
  (`TooltipIconButton`, bloqueados com "Aguarde a ação em andamento" durante outra ação), com o nome
  completo no `aria-label`. No **celular** as ações da etapa ficam na **mesma linha** (sem quebrar)
  e os botões com texto usam rótulos compactos (**Descrever**, **Reabrir**, **Aprovar PR**,
  **Tentar**, **Cancelar**), preservando o nome acessível completo; se não couber, a barra rola na
  horizontal. Assim a saída do agente ganha altura de leitura.
- **PR**: a IA valida, faz commit (padrão da central) e push e abre o PR com o `gh`
  (`--base`, título, `--draft`, revisores, labels); PR já aberto só é atualizado (push + comentário).
  Resposta `{"url", "number"}` (ou a última URL de PR do texto).
- **Acompanhamento**: rotina `agentic-pr-watch` dos Crons (a cada 2 min, `pr-watch.ts`) consulta o
  PR no GitHub (repositório tirado da URL do PR). Volta ao planejamento quando há:
  - **comentário novo** que mencione `@opex` (`mentionsOpex`; `id` > `lastCommentId`) — na conversa
    (`issues/{n}/comments`), na linha (`pulls/{n}/comments`) ou no corpo de uma revisão;
  - **revisão nova** com `CHANGES_REQUESTED` (`id` > `lastReviewId`), mantida como antes.
  As revisões relevantes viram texto (corpo + comentários de linha); os comentários soltos com `@opex`
  entram como seção própria. Os cursores `lastReviewId`/`lastCommentId` são gravados a cada varredura;
  mesas abertas antes desta rotina (sem `lastCommentId`) fazem uma 1ª varredura só de linha de base,
  sem replanejar por comentários antigos.
- **Acompanhamento do PR ao vivo** (`pr-watch-report.ts`): cada varredura de uma mesa com PR aparece
  na **Saída da IA** como um bloco **"Verificação do PR #N"** com os passos e o horário de cada um
  (consulta ao GitHub, estado de merge, revisões/comentários novos e se pedem mudança, estado da
  revisão automática do commit atual — só o estado, via `gate.reviewStatus` —, conflito, CI
  (`describeCiState` quando as verificações são consultadas: nenhuma, em andamento, sem falha ou quais
  falharam; limite atingido, falhas já tratadas ou correção desligada; sem consulta, `describeChecks`
  só relata `mergeable_state: unstable`), merge automático e o motivo da espera, mesa aguardando vaga)
  e o desfecho: `idle` ("Nada a fazer", "Aguardando vaga", PR que continua fechado), `action` (pedido
  de mudança, conflito, correção de CI, merge automático,
  merge, fechamento, reabertura) ou `error`.
  - Eventos: `pr-watch-step` (transitório, só ao vivo no hub) e `pr-watch` (a verificação inteira,
    gravada no log da mesa). O relato é fechado **antes** de acionar a ação (o turno aparece depois
    do bloco). Falhas do relato nunca interrompem a varredura; falha depois do fechamento vira aviso.
  - Gravação: uma verificação `idle` apaga as `idle` anteriores (`dropIdlePrWatchEvents`) — fica só
    a última, também na tela (`applyTimelineLine`); as que encontraram algo ficam no histórico.
  - Tela: a verificação em andamento e a mais recente ficam abertas; as anteriores, recolhidas
    (`PrWatchItem`). No fim da saída, com a mesa em PR aberto e parada, a contagem
    **"Próxima verificação em m:ss"** (`PrWatchCountdown`; "Verificação em instantes…" ao zerar,
    "Verificando o PR agora…" durante a rodada, ou "Acompanhamento automático do PR desligado" com a
    rotina/agendador desligados). O horário vem de `GET /api/agentic/pr-watch` (`usePrWatchSchedule`,
    refeito a cada 30 s; `loadPrWatchSchedule`: `CronJobState.nextRunAt` da rotina `agentic-pr-watch`
    + agendador e rotina ligados; `running` = lease vigente) e do `nextCheckAt` da última verificação
    (o mais recente dos dois, `nextPrWatchAt`).
- **Conflito de merge (OPE-49)**: quando o PR aberto responde `mergeable: false` no GitHub, a rotina
  aciona o agente para resolver o conflito **sozinho** (etapa `resolving_conflicts`, agente da etapa
  **Pull Request**), **sem nova aprovação** do usuário. O prompt manda confirmar a branch do PR, fazer
  `git fetch`, integrar a branch de **destino real do PR** por merge (preservando os dois lados),
  rodar a validação, commitar e `git push` (nunca force-push) e comentar o resumo no PR (sem `@opex`);
  é proibido abrir outro PR ou mergear. Ao concluir, a mesa volta a `pr_open` (a prévia aprovada deixa
  de valer para o código novo). Para não repetir a cada varredura, os SHAs de base/head tratados ficam
  em `pr.conflictBaseSha`/`pr.conflictHeadSha` (um push novo ou uma base nova libera outra tentativa);
  `mergeable: null` (GitHub calculando) não dispara nada e o bloqueio por CI/regras/PR rascunho não é
  confundido com conflito. `feedback` tem prioridade: na mesma varredura, um pedido de mudança vai ao
  planejamento e o conflito fica para a próxima. Se a resolução não puder começar (OpenCode
  indisponível, limite de mesas…), a mesa permanece elegível e o motivo vira aviso; falha/interrupção
  do turno deixam **Tentar novamente** e **Voltar ao planejamento** na barra de ações.
- **CI falho (OPE-81)**: com a correção ligada (efetiva da central: herdada do padrão global ou
  personalizada), a rotina consulta as verificações do commit atual do PR
  (`commits/{sha}/check-runs` + `commits/{sha}/status`, `fetchCiState`) só quando o GitHub indica
  bloqueio (`mergeable: true` e `mergeable_state` `unstable`/`blocked`) — ou, havendo tentativas
  contadas, para zerar a contagem. Regras puras em `src/features/agentic/ci.ts`: `ciFailureState`
  **espera todas** as verificações terminarem, considera a **última execução** de cada check (por nome)
  e conta como falha `failure`, `timed_out`, `startup_failure`, `action_required` e os status
  `failure`/`error` (`cancelled`/`skipped`/`neutral` não contam). `ciFixDecision` decide:
  - **corrigir**: etapa **`fixing_ci`** (agente da etapa **Pull Request**, papel de modelo `pr`,
    sem aprovação; ocupa vaga como trabalho ativo e respeita a espera por vaga — ação
    `pr-ci-fix`). O prompt (`ciFixPrompt`) lista as verificações (run/job do Actions, link e resumo)
    e manda alinhar a branch com `origin/<branch>` (`git pull --ff-only`), ler os logs
    (`gh run view <run> --log-failed`), reproduzir só o que falhou, corrigir o **mínimo** (nunca
    desativar/pular testes), rodar a validação, commitar e `git push` (nunca force-push/rebase) e
    comentar no PR com o marcador `<!-- opex:ci-fix -->` (sem `@opex`). Falha de **infraestrutura**
    pode só ser reexecutada (`gh run rerun <run> --failed`, resposta `{"ok": true, "rerun": true}`),
    **apenas na 1ª tentativa daquele commit** (`pr.ciFixHeadSha`).
  - **não repetir**: o conjunto tratado fica em `pr.ciFixKey` (`sha:ids` das verificações); uma
    reexecução gera ids novos e libera outra tentativa (já sem reexecução).
  - **limite** (`ciFixLimit`): `pr.ciFixAttempts` conta as correções seguidas e **zera quando o CI
    passa**; atingido o limite, a mesa avisa **uma vez** (`pr.ciFixLimitNotified`) e para de tentar.
  Concluído, volta a `pr_open`: com push a prévia aprovada deixa de valer (`previewHealthy: false`);
  só reexecução não a invalida. Falha/interrupção deixam **Tentar novamente**/**Voltar ao
  planejamento**. Prioridade na varredura: **feedback → conflito → CI → merge automático**. Auditoria
  ao iniciar e ao concluir; log da central; a barra mostra o aviso da etapa com **Parar**.
- **Merge automático (OPE-50)**: opção **"Merge automático"** nas configurações da central (aba Git e PR, `git.autoMerge`, padrão **desligada**; campos antigos caem nela pelo `parseCentralConfig`). Não combina com **PR rascunho** (o schema recusa as duas ligadas — `centralConfigSchema`, mesma regra na tela e na API). Com a opção ligada, a rotina `agentic-pr-watch` mergeia o **PR do próprio agente** assim que ele fica pronto no GitHub (`prMergeReady`: `mergeable: true`, `mergeable_state` `clean`/`behind`/`has_hooks` e fora do rascunho), na etapa **`merging_pr`** (agente da etapa **Pull Request**), sem nova aprovação. O prompt exige **merge commit** (`gh pr merge --merge`), proíbe `--admin`/`--auto`/squash/rebase/force-push e manda parar se o repositório recusar por verificações/revisões/regras (as proteções nunca são contornadas). O **bloco JSON do agente não basta**: o merge é confirmado no GitHub (`merged` + `merge_commit_sha`) antes de concluir. Confirmado o merge, o agente apaga a **branch remota de origem** na etapa **`deleting_pr_branch`** (`git push origin --delete <branch>`; branch já ausente conta como sucesso) — só quando a branch do PR é a esperada pela mesa; se divergir, a exclusão é cancelada com aviso. A exclusão remota é um passo próprio, independente de **"apagar a branch local"** da limpeza (`cleanup.deleteBranch`). Depois vem a **mesma conclusão** do merge manual: tarefa para a coluna "Ao concluir" (fecha a issue pelo vínculo), auditoria, limpeza e exclusão da sessão. Ligar a opção vale também para os **PRs já abertos** pelas mesas da central (verificados a cada varredura). Falha/interrupção em `merging_pr`/`deleting_pr_branch` deixa a mesa em **Tentar novamente**/**Reconectar** (sem "Voltar ao planejamento") e a mesa **não** fica em `pr_open`, então a varredura não repete a operação sozinha.
- **Conclusão (merge)**: a tarefa vai para a coluna configurada em "Ao concluir" (se houver) — que
  é a coluna de conclusão do vínculo, então a issue é **fechada** pela sincronização do serviço de
  tarefas —, a limpeza é feita pela IA (volta a sessão ao diretório da central, remove o **backup do
  MongoDB da prévia**, `docker compose down`, `git worktree remove`, `git branch -D`, conforme a
  central) e a porta é liberada.
- **Exclusão da sessão (OPE-46)**: ao concluir a mesa (depois da limpeza), a sessão do OpenCode é
  **desvinculada** (`sessionId`/`sessionDirectory` = `null`, preservando todo o histórico da mesa no
  Opex — planos, saída, PR, uso) e **excluída** no OpenCode (`session.remove`). Se a exclusão falhar
  (OpenCode fora do ar etc.), o id fica em `pendingSessionDeletions` e a rotina **`agentic-queue-pump`**
  (Crons) retoma a exclusão; sessão já inexistente conta como excluída (idempotente). Mesas sem sessão
  concluem sem chamar o OpenCode, e ao excluir uma mesa as pendências são tentadas antes de apagar o
  registro. A **mesma rotina** também retoma as exclusões pendentes dos **refinamentos de tarefa**
  (`features/refinement/server/session-cleanup.ts`; ver `modules/refinement.md`). Lógica em
  `server/session-cleanup.ts`.
- **Reabrir mesa** (`done` → planejamento): a tarefa é movida para a coluna de desenvolvimento (a
  mesma "Ao abrir a mesa (implementação)"; sem ela, a coluna de entrada do vínculo) e a issue é
  **reaberta** (mesma sincronização). Como a sessão anterior foi excluída, a mesa ganha uma **sessão
  nova** no diretório da central e o prompt de reabertura avisa que é uma sessão nova e inclui o
  último plano como contexto.
- **Controle de horas agêntico**: a mesa abre/pausa/retoma/fecha o apontamento da tarefa conforme o
  agente trabalha ou espera o usuário (`timer-sync.ts`; ver `modules/time.md`). Não há controles
  manuais de timer e a central não tem mais as opções de timer.
- **Trabalhos em andamento** (`server/in-progress.ts`): lista as mesas **não concluídas** para o
  popover do indicador de tempo — executando (agente com período ativo) ou paradas com o **motivo da
  espera** (`workbenchWaitingReason`): revisão do plano, aprovação da prévia, revisão/merge do PR,
  permissão/pergunta pendente, falha ou interrupção. Somente leitura; cada item navega para a mesa.
- Abrir a mesa pode mover a tarefa para a coluna configurada em "Ao abrir a mesa"; falhas ao mover
  viram aviso na mesa, sem interromper.
- **Permissões e perguntas** do agente aparecem na mesa (`pendingPermissions`/`pendingForms`):
  Aprovar uma vez / Aprovar sempre / Recusar; formulários desenhados pelos campos do OpenCode
  (texto, número, sim/não, opções, múltipla escolha) com Responder ou Dispensar. As **opções** de uma
  pergunta viram uma lista de **linhas selecionáveis** (`AgentQuestionOptions`): cada opção com o
  texto e, abaixo, a **descrição** mais discreta; a linha inteira é o botão (rádio na escolha única,
  caixa na múltipla). O card é compartilhado com o refinamento (`components/agent-questions/`).
  **Pendências são chaveadas por id** (o servidor faz `$pull` + `$push` e a timeline atualiza o item
  existente): uma releitura do estado nunca vira card duplicado.
- **Reconectar** (`POST /workbenches/[id]/actions/reconnect`): quando a mesa aparece em falha/
  interrupção mas o agente **continua rodando** no OpenCode (queda de conexão ou reinício do app),
  religa o acompanhamento da **mesma sessão** — **sem** enviar prompt nem trocar agente/modelo. O app
  confere a sessão no OpenCode (mesmo `probeAttachSession` na tela e no acompanhamento) e a resposta
  (HTTP 200) traz um **desfecho estável** em `reconnect.outcome` do estado: **`attached`** (ainda
  executa — volta a assinar o SSE e segue até o fim), **`recovered`** (terminou durante a queda —
  recupera o resultado do histórico e aplica a transição da etapa **uma única vez**), **`nothing`**
  (sessão inexistente ou nada rodando — mantém o estado e explica) ou **`transient`** (OpenCode
  indisponível no momento — nada muda, é só tentar de novo). Sem sessão, fora de uma etapa de
  execução, com a feature/central indisponível ou com um turno vivo no processo, responde 409/no-op.
  A releitura também **restaura perguntas e permissões** que ficaram pendentes (o SSE é só ao vivo).
- **Reconexão no buraco do SSE**: se o SSE com o OpenCode cair **durante** um turno e reatar, o runner
  relê o estado da sessão (`form.list`/`permission.list`) e republica só as pendências **ainda não
  emitidas** neste acompanhamento; o que saiu da lista (respondido/demitido em outro lugar) é fechado.
  Assim uma pergunta que nasceu durante a queda aparece na mesa sem abrir o OpenCode. Falha da
  releitura é transitória (mantém o que já foi emitido) e o aviso de que "parte da saída pode não ter
  sido exibida" continua valendo para o texto/raciocínio perdidos.
- **Ciclo automático de reconexão** (mesa e refinamento, `useAutoReconnect` + `ReconnectButton`):
  quando a ação **Reconectar** passa a ser oferecida — inclusive ao abrir a tela já em falha/
  interrupção — o cliente tenta sozinho em **1 s → 2 s → 4 s → 8 s → 16 s** (no máximo 5, sem toast
  por tentativa) e o botão mostra **“Reconectando…”** (sem contador) durante o ciclo. Para no sucesso
  (`running`/resultado recuperado), na resposta definitiva (`nothing`, com aviso) e ao esgotar (aviso
  discreto; o botão continua clicável e uma nova tentativa recomeça a contagem). Uma oscilação
  `running → falha` da recuperação **não** reinicia a contagem (um ciclo por episódio, chaveado pelo
  `turnStartedAt`) e **nunca** há ciclo automático depois de um **Parar** do usuário
  (`stopRequestedAt` marca a intenção; só uma tentativa manual reconecta).
- Mesa "executando" sem turno vivo no processo (o app reiniciou) vira `interrupted` ao ser lida.
- **Excluir mesa (OPE-68)**: marca a exclusão na mesa (`deletionRequestedAt`), interrompe o turno
  vivo, invalida a prévia remota e roda a **mesma limpeza de ambiente da conclusão** (etapa
  `finishing`, agente de Build) antes de apagar o registro: containers (`docker compose down`, quando
  houve build), backup do MongoDB (sempre), worktree e branch local — conforme as opções da central —
  e a sessão do OpenCode. O app **confere** na máquina do OpenCode que os recursos sumiram (o bloco
  JSON do agente não basta) e só então remove a mesa, a saída e libera a porta. A tarefa, o PR e a
  branch remota **não** são tocados. Enquanto a limpeza não termina, a mesa permanece na etapa
  `finishing` (rótulo "Excluindo…") com **Tentar novamente**/**Reconectar**; OpenCode indisponível ou
  falha na limpeza **não** apaga a mesa nem perde a referência da sessão. Mesa que nunca criou
  recursos (só planejamento) e não tem sessão é removida na hora. O `DELETE` responde
  `{ deleted: true }` quando a mesa já saiu e `{ deleted: false }` quando a limpeza ficou em
  andamento.
- Custo e tokens acumulados por mesa (`session.step.ended`). Cada passo também é registrado em
  `ai_consumption_logs` (origem `agentic`) para o painel de consumo do OpenCode — ver
  `modules/ai.md`, "Medição de consumo".

## Forks da conversa

- Agente **Fork** configurável globalmente e por central, com instruções próprias. Conversas
  paralelas não ocupam vaga nem alteram a tarefa/descrição. Sessão copiada da mesa;
  sem sessão principal, nova sessão com o contexto preservado. Consumo separado (`agentic-fork`).
- **Fork de fork** copia a sessão do pai, sem limite de profundidade; seletor em árvore e atalho para
  o pai. Pai descartado é identificado sem perder os filhos. Filhos também integram no pai, além
  dos demais destinos disponíveis na mesa.
- **Modo Plan/Build** (`mode` no fork): **Plan** = somente leitura (permissões `FORK_READONLY_PERMISSIONS`
  na sessão, protocolo de leitura e agente `plan` no turno); **Build** = pode alterar arquivos na pasta
  da mesa (sessão sem restrição própria, valem as permissões do agente; turno com o agente do papel
  Fork ou `build` quando ele for o `plan`; protocolo proíbe commit/push/merge/troca de branch sem
  pedido). O modo inicial vem do agente do papel Fork configurado na central (`plan` → Plan; demais →
  Build). Forks antigos sem o campo são tratados como Plan (eram somente leitura) e sem trava.
- **`ForkModeSelect`** (barra inferior, só com o fork em aberto): alterna Plan/Build (`OptionTabs`)
  apenas com o agente parado (`forkModeBlockReason`: travado, fora de aberto ou respondendo). A troca
  refaz permissões e protocolo da sessão, grava `pendingModeNote` (vai no início da próxima mensagem,
  uma vez), registra aviso na saída, audita e publica `agentic-updated`. Resposta otimista com
  reversão e toast (`useForkAction`).
- **Trava de somente leitura** (`readOnly`): caixa **Somente leitura** no `ForkComposer` ou botão
  **Travar** com confirmação (AlertDialog). Sem volta: o modo fica Plan e o seletor vira o selo
  "Somente leitura (travado)". **Fork de fork não herda** a trava nem o modo do pai (a cópia da sessão
  recebe as permissões do próprio modo). O cabeçalho do fork mostra o modo (`forkModeText`).
- Ciclo: conversar, parar, tentar novamente, **pausar a conversa**, retomar, descartar ou integrar.
  Integração consolida resumo ajustável; usuário escolhe **Contexto**, **Planejador**, **Reabertura**
  ou **Pai** conforme estado/sessão. Resumo é adicional, nunca substitui o conteúdo original.
- **Pausar conversa** (status `closed`, rótulo **"Pausado"** no selo e no seletor) é instantâneo e
  reversível: só libera **Retomar conversa**, **Integrar fork** e **Descartar fork**. A barra do fork
  avisa "Conversa pausada: retome a conversa, integre o que foi levantado à mesa ou descarte o fork.";
  a saída registra "Conversa pausada: retome, integre ou descarte o fork." e, ao retomar, "Conversa
  retomada." O fim real do fork é Integrado, Concluído ou Descartado.
- **Uma única área rolável** usa toda a altura do fork: a saída da conversa e, no fim dela (prop
  `footer` da `Timeline`, com transição Framer Motion), o bloco do estado — **Integrar a conversa ·
  Fork N** (resumo com quebra de conteúdo longo, "Integrar em" com destinos responsivos e motivos de
  bloqueio visíveis, e o campo "O que mudar no resumo?"), o **resumo integrado** (`ForkIntegrated`:
  data, destino e resumo aplicado) ou o aviso de **fork concluído**. Nada disso tem caixa ou rolagem
  própria; a área acompanha o fim quando o bloco muda.
- Os botões da integração (**Cancelar integração** · **Modificar resumo** · **Integrar**, ou
  **Voltar** · **Enviar ajuste**) ficam na **barra inferior fixa** do fork, ao lado do Abrir fork
  (`useForkIntegration` compartilha o estado entre o corpo e os botões; Ctrl+Enter no ajuste aciona
  Enviar ajuste). Reabertura exige confirmação. Cancelar volta o fork a Pausado.
- Na conclusão, política `forks.onWorkbenchDone`: perguntar (padrão), concluir ou manter. Exclusão da
  mesa remove forks e sessões sem dispensar a limpeza do ambiente do Opex. Sessões pendentes são
  retomadas pelos Crons. Excluir uma central também preserva os registros se a limpeza das sessões
  dos forks falhar, oferecendo nova tentativa. Auditoria `ForkDaMesa` (abertura com `modo`/`somenteLeitura`, trocas de modo e trava) e eventos `agentic-updated`
  em `private-app`.
- APIs autenticadas em `/api/agentic/workbenches/[id]/forks`: listar/criar (`parentForkId?`,
  `readOnly?`, `mode?`), detalhe, excluir, mensagens, ações, permissões, formulários, eventos NDJSON e
  decisão `done-prompt`. O `ForkDto` expõe `mode`, `readOnly` e `liveChat`. A mensagem no fork
  ativo parado abre turno novo; executando, com o chat durante a execução ligado, entra no turno
  atual (ver "Chat durante a execução").

| Ação (`POST …/forks/[forkId]/actions/[action]`) | Corpo | Efeito |
|---|---|---|
| `close` · `resume` · `interrupt` · `retry` · `integrate` · `cancel-integration` | — | Ciclo de vida do fork |
| `revise-summary` | `{ text }` | Ajusta o resumo da integração |
| `apply` | `{ target }` | Integra no destino (`context`, `planner`, `reopen`, `parent`) |
| `set-mode` | `{ mode: "plan" \| "build" }` | Troca o modo (agente parado; 409 se travado) |
| `lock` | — | Trava como somente leitura (Plan), sem volta |

## Modelos de fallback

- **Configuração**: cada papel (Planejamento, Implementação, Build e ambiente, Pull Request, Fork da
  conversa) tem a lista **Modelos de fallback** (`FallbackModelsField`, abaixo de agente/modelo/variante):
  até **5** itens (`MAX_MODEL_FALLBACKS`), cada um com **modelo + variante** (mesma busca do
  `ModelSearchPicker`); o agente continua o do papel. **Adicionar fallback**, remover e **ordem por
  arrastar** (dnd-kit) — a ordem é a ordem de tentativa. Item repetido ou igual ao modelo principal é
  apontado no campo e recusado pelo schema (`agentConfigSchema.fallbacks`, `superRefine`).
- **Na central** (aba Agentes, etapa personalizada): `OptionTabs` **Usar os do padrão** (padrão; resumo
  "Fallback do padrão: A → B"), **Personalizar** (a lista da central **substitui** a padrão, não soma;
  começa com a cópia da padrão) e **Sem fallback**. Etapa que herda o padrão inteiro herda também os
  fallbacks. Gravado em `agents.<papel>.fallbacks`: ausente/`null` = herda, `[]` = sem fallback, lista
  = substitui (`resolveAgent`). Nos agentes padrão, ausente = sem fallback (configurações antigas
  continuam válidas, sem migração).
- **Quando troca**: só quando o **modelo/provedor falha** — o OpenCode encerra a execução com erro
  (limite de uso, cota, autenticação, modelo indisponível, sobrecarga), não consegue selecionar o modelo
  ou recusa a mensagem (`TurnResult.failure = "model"`, `lib/ai/opencode-run.ts`). **Não** troca ao
  Parar, com a conexão com o OpenCode perdida, na reconexão (que não envia mensagem) nem em erros da
  etapa (build falhou, plano vazio, PR sem URL).
- **Como continua** (`runWithFallback`, `server/model-fallback.ts`): reenvia o turno **na mesma
  sessão** com o próximo modelo da corrente (`modelChain`: principal + fallbacks, sem repetidos),
  pedindo para retomar ("A execução anterior desta etapa não terminou (motivo). Retome de onde parou…";
  no fork, "A resposta anterior não terminou…"). A saída avisa: "anthropic/opus falhou (limite de uso):
  continuando com openai/gpt-5 (high) — fallback 1 de 2." (e o log da central). Se o último também
  falhar, a mesa (ou o fork) falha como hoje, com o erro do último modelo. O custo das tentativas soma
  no turno.
- **Só naquele turno**: cada turno novo (inclusive os encadeados) começa pelo modelo principal.
- **Com a troca de modelo na mesa/fork**: o modelo trocado vira o principal e a lista do papel continua
  valendo atrás dele (pulando o que for igual). No fork vale para as mensagens e para a consolidação
  do resumo (lista do papel Fork da conversa; agente do Mode).
- Fora do alcance: Refinar tarefa e a revisão automática do PR (configurações próprias).

## Trocar o modelo na mesa e no fork

- **Seletor de modelo** no canto esquerdo da barra inferior, na mesa (`WorkbenchModelPicker`, modelo do
  papel da etapa) e no fork (ao lado do Modo, `ForkActionBar`, só com o fork em aberto). Ambos usam
  `ModelOverridePicker`:
  - **botão do modelo**: só o ícone e o **nome do modelo** (sem "Modelo do Plano:"); modelo trocado
    fica destacado na cor primária. O contexto ("Modelo do Plano: X (padrão | trocado)") vai na dica e
    no rótulo acessível. Abre a busca de modelos do OpenCode (o mesmo `ModelSearchPicker`
    compartilhado com as configurações dos papéis em `AgentConfigFields`) com **Voltar ao padrão** no
    rodapé quando trocado;
  - **botão do esforço de raciocínio** (variante): **só um ícone** (cérebro), exibido quando o modelo
    tem variantes; destacado quando há variante definida, que aparece na dica. Abre um menu com
    "Padrão do modelo" e as variantes.
  - Compacto assim, o seletor, a chave **Gerar prévia** e os botões da etapa cabem numa linha só no
    desktop.
- **Troca modelo e variante; o agente não muda** (o da etapa na mesa; no fork, o do modo Plan/Build).
  Conferida no OpenCode como nas configurações (`assertAgentConfigs`; modelo ou variante inexistente →
  400; OpenCode desconectado não bloqueia).
- **Alcance na mesa: só o papel da etapa atual, só nesta mesa** (`modelOverrides` por papel no
  `agentic_workbenches`, `STAGE_MODEL_ROLE` em `constants.ts`); os outros papéis seguem o modelo
  configurado até serem trocados também. A troca fica gravada (inclusive ao reabrir a mesa) e vale para
  todos os turnos do papel — inclusive os automáticos (conflito, merge automático e apagar a branch, no
  papel Pull Request) — e para o apontamento de horas (`timer-sync`). A revisão automática do PR
  (`pr-review`) tem configuração própria e não usa a troca.

  | Etapa da mesa | Seletor troca o modelo de |
  |---|---|
  | Planejando, Plano pronto, Mudanças pedidas no PR | Plano (papel Planejamento) |
  | Implementando, Revisão bloqueou | Implementação |
  | Revisão adversária | seletor oculto (modelo na aba Agente Adversário) |
  | Na fila do build, Subindo a prévia, Prévia pronta | Prévia (papel Build e ambiente) |
  | Abrindo o PR, PR aberto, Resolvendo conflitos, Corrigindo o CI, Mergeando o PR, Excluindo a branch remota | Pull Request |
  | Concluindo, Concluída | seletor oculto |

  Com falha, vale a etapa em que a mesa parou. "Mudanças pedidas" troca o do Plano (o turno seguinte
  é o replanejamento). `STAGE_MODEL_ROLE` é um `Record` exaustivo: etapa nova precisa entrar nele.
- **Alcance no fork**: todas as mensagens daquele fork (inclusive a consolidação do resumo;
  `modelOverride` no `agentic_forks`). Fork novo — inclusive fork de fork — começa no modelo do papel
  Fork da conversa (não herda a troca da origem). Fork integrado ou concluído → 409.
- **Com o agente respondendo**: o seletor continua habilitado; o turno em andamento termina com o
  modelo antigo e a troca vale **a partir do próximo turno** (a mesa relê a troca a cada turno em
  `executeTurns`). A saída avisa ("Modelo do Plano trocado para X (high): vale a partir do próximo
  turno."; no fork, "…da próxima mensagem").
- Resposta otimista com reversão e toast (`useSetWorkbenchModel`, `useSetForkModel`); auditoria
  (`MesaDeTrabalho`/`ForkDaMesa`: etapa, modelo antes/depois, `trocado`) e `agentic-updated` no Pusher.
- DTO: `WorkbenchDto.models` (por papel, `{ model, variant, overridden }` já resolvido) e
  `ForkDto.model`; `null` quando a central não pôde ser lida (seletor oculto). Regras:
  `applyModelOverride`/`asModelOverride` (`logic.ts`) e `server/models.ts`.
- Rotas: `PUT /api/agentic/workbenches/[id]/model` `{ role, model, variant }` (papéis `planning`,
  `implementation`, `build`, `pr`) e `PUT /api/agentic/workbenches/[id]/forks/[forkId]/model`
  `{ model, variant }`; `model: null` volta ao padrão.

## Filtros avançados e builder Docker

- **Todos os projetos** agrega tarefas dos projetos com central. A seleção continua no navegador;
  a mesa usa a central do projeto da tarefa aberta, sem sobrescrever a seleção Todos.
- Ordem: **Só mesas ativas** → seletor de central → colunas com **Todos** → estado da mesa → busca
  (inclui resumo).
- **Só mesas ativas** (`activeOnly`, padrão desligada; regra `isActiveWorkbench`): mostra só as
  tarefas com **mesa aberta e não concluída** — qualquer etapa de Planejando a Finalizando, inclusive
  PR aberto, falha/interrompida e aguardando vaga. Tarefa sem mesa, só na fila da central e mesa
  Concluída ficam de fora. **Restringe (E)** os demais filtros: colunas, estado da mesa e busca
  continuam valendo (com "Sem mesa" marcado a lista fica vazia). Filtros salvos antes da chave
  continuam válidos, com ela desligada (`z.boolean().default(false)`, sem trocar a chave `v1`).
  Estados combinam por OU: interação, falha/interrupção, agente trabalhando, sem mesa, fila e etapas.
  "Implementando" inclui Revisão adversária e Revisão bloqueou (esta também em "Requer interação").
  Filtros combinam entre si por E. Persistência aditiva compatível com `opex:dev-center-filters:v1`;
  registros antigos sem estados continuam válidos. `allColumns` distingue ausência de seleção
  explícita (nenhuma coluna) do filtro legado vazio (todas).
- `environment.dockerBuilder` (vazio = padrão do host) lista builders reais via OpenCode em
  `GET /api/agentic/centrals/[id]/docker-builders`; nome validado e disponibilidade no teste da
  central. Prévia **Local** usa `BUILDX_BUILDER` sem `docker buildx use`; no **GitHub Action**, vale
  o builder do runner, preservando backup opcional, portas e publicação remota.

## Saída ao vivo

- `hub.ts` (em memória, `globalThis`): cada evento ganha `seq` por execução, vai na hora para quem
  assiste e é gravado em lote em `agentic_events` (textos seguidos viram um documento; saída de
  ferramenta cortada em 20 mil caracteres guardando o fim). Raciocínio e progresso de ferramenta são
  só ao vivo. O **refinamento de tarefas** reusa este barramento/coleção (chave = id do refinamento).
- `GET /api/agentic/workbenches/[id]/events` (NDJSON): `reset` + tudo o que foi gravado + ao vivo,
  `ping` a cada 15 s. Sem buracos: assina, grava o pendente, lê o banco e descarta `seq` repetido.
  O cliente (`useWorkbenchStream`) reconecta sozinho (3 s; 45 s sem nada = reconectar) e reconstrói
  com `applyTimelineLine` (`timeline.ts`, puro). Na reconexão do SSE o runner relê as pendências da
  sessão (ver "Reconectar") e a timeline **atualiza o item pelo id** (pergunta/permissão reenviadas
  não duplicam). A queda da conexão do navegador/Pusher é coberta pelo `RealtimeStatusBanner`,
  que invalida as consultas ativas ao reconectar — a pendência persistida reaparece sem clique.
- Mudanças de etapa/pedidos chegam pelo Pusher (`agentic-updated` em `private-app`, payload
  `{centralId, workbenchId, taskId}`) → `useAgenticRealtime` invalida as consultas `["agentic"]`.
- Tela: cabeçalho (código → página da tarefa, etapa, "ao vivo", custo, branch, worktree, porta,
  prévia, PR), passos (Plano → Implementação → Prévia → Pull Request → Concluída), abas
  **Descrição** e **Spec.** (as primeiras da barra: descrição e especificação técnica da tarefa em
  Markdown, só leitura, lidas por `useTaskDetail`; vazias mostram "Sem descrição."/"Sem
  especificação técnica." com o atalho **Abrir a tarefa**, onde o texto é editado; falha ao
  carregar com "Tentar novamente"; componente `TaskTextView`), **Saída da IA** (aba aberta ao
  entrar na mesa; turnos, texto em Markdown, ferramentas recolhíveis — abertas enquanto executam,
  avisos), **Plano vN** (versões) e **Forks (N)** (quando houver), pedidos pendentes e barra de
  ações com o campo de correção. A barra de abas rola na horizontal quando não cabe (celular).
- **Citar uma linha da saída** (`ReplyTargetProvider` no `WorkbenchView`): cada linha do texto da
  IA, do **Plano** e das abas **Descrição** e **Spec.** tem, no hover, **Citar no campo de resposta**, que insere `> linha` no cursor do
  campo focado por último (resposta de pergunta pendente, correção/feedback da etapa, **Informações
  adicionais**, mensagem do Abrir fork). Sem campo aberto, abre o primeiro feedback da etapa
  (`revise-plan` → `request-correction` → `submit-pr-feedback` → `reopen`) já com a citação; sem
  nenhum, copia a linha (toast). Selecionando texto, **Citar o trecho no campo de resposta** (botão
  no fim da seleção) cita só o trecho, pelo mesmo destino. Cada fork tem provider próprio: a linha do fork vai para a mensagem
  do fork ou o pedido de ajuste do resumo da integração.
- **Rolagem da saída** (`useStickToBottom`): a aba "Saída da IA" acompanha o fim do stream sozinha
  sempre que o conteúdo cresce — inclusive quando um item do **meio** da lista muda (ex.: o fim de
  um turno) — enquanto o usuário estiver no fim. Ao rolar para cima, o acompanhamento **para** (não
  volta sozinho) e aparece um botão flutuante **Ir para o final**; ao voltar ao fim ou clicar no
  botão, o acompanhamento **retoma**. O botão rola suave, desligando o movimento com
  `prefers-reduced-motion`.

## Chat durante a execução

- Com o agente **executando**, a mesa (abas **Saída da IA** e **Plano**), o **fork ativo** e o
  **refinamento** mostram o campo **Enviar ao agente** (`LiveMessageComposer`, entra/sai animado). A
  mensagem entra na execução em andamento com `delivery: "steer"` do OpenCode 2.x: **não interrompe**
  nem abre turno novo (o avanço das etapas não muda); o agente considera e segue. Parada, a mesa
  continua só com as ações da etapa.
- Opção efetiva = `resolveLiveChat(settings, central)` (`logic.ts`): a central com **Ligado**/**Desligado**
  prevalece; **Padrão global** segue `settings.liveChat`. **Divergência intencional** do padrão
  `inherit*` booleano das outras opções da central no Opex (`inheritQueue`, `inheritMovement`,
  `git.inheritCi`): aqui o campo é o enum `liveChat: "inherit" | "on" | "off"`
  (`LIVE_CHAT_POLICIES`, `OptionTabs` de 3 abas), como no my-tasks de origem — a opção é um
  liga/desliga simples, sem valores próprios a personalizar. Vai pronta na tela como `liveChat` em
  `WorkbenchDto`, `ForkDto` e no refinamento (`liveChatEnabled`, `server/live-chat.ts`).
- Entrega (`deliverLiveMessage`): confere a opção (409 `LIVE_CHAT_DISABLED`), envia pelo runner
  (`steerAgentTurn` de `lib/ai/opencode-run.ts`, que só envia a um turno **vivo e não terminado**
  com aquele id — registro em memória por execução), mostra a mensagem na saída como mensagem do
  usuário e audita (`MesaDeTrabalho`/`ForkDaMesa`/`RefinamentoTarefa`, campo
  `mensagemDuranteExecucao`). Sem turno vivo (terminou ou trocando entre etapas encadeadas, ex.:
  implementação → build): 409 `TURN_NOT_RUNNING`; recusa do OpenCode: 502 `LIVE_MESSAGE_FAILED`.
- Recusas específicas: mesa parada (`WORKBENCH_NOT_RUNNING`) ou em exclusão (`WORKBENCH_DELETING`);
  fork consolidando o resumo da integração (`FORK_INVALID_STATE`); refinamento parado
  (`REFINEMENT_NOT_RUNNING`) ou consolidando a especificação (`REFINEMENT_FINALIZING`). Nesses casos
  o campo nem aparece.
- Fork: a mesma rota `/messages` — parado, abre turno novo (como antes); executando, entra no turno.
- Citar linha da saída com a mesa executando (sem campo de correção aberto) preenche o campo.
- Fora do escopo: revisão automática de PR (sem tela de conversa) e o Agente Opex (outro motor).

## APIs (`src/app/api/agentic/`)

| Rota | Uso |
|---|---|
| `GET/PUT /settings` | configuração geral |
| `GET/POST /centrals`, `GET/PUT/DELETE /centrals/[id]`, `POST /centrals/[id]/test`, `GET /centrals/[id]/workbenches`, `GET /centrals/[id]/queue` | centrais |
| `POST /workbenches` `{centralId, taskId, text?}` | abre a mesa e inicia o plano; `text` são as informações adicionais do primeiro prompt (409 se já existir) |
| `GET /pr-watch` | agendamento do acompanhamento do PR (`{enabled, nextCheckAt, running}`) para a contagem |
| `GET /workbenches/in-progress` | mesas em andamento (executando ou aguardando ação humana) |
| `GET /workbenches/by-task/[taskId]`, `GET/DELETE /workbenches/[id]` | mesa (o `DELETE` limpa o ambiente e devolve `{ deleted }`) |
| `POST /workbenches/[id]/actions/[action]` | `revise-plan`, `request-correction`, `submit-pr-feedback`, `reopen` (`{text}`); `implement` (`{text?}` — informações adicionais ao prompt de implementação); `approve`, `retry`, `interrupt`, `reconnect` |
| `POST /workbenches/[id]/messages` `{text}` | chat durante a execução: a mensagem entra no turno em andamento (409 com a opção desligada ou sem o agente trabalhando) |
| `POST /workbenches/[id]/permissions/[requestId]` `{decision, message?}` | resposta à permissão |
| `POST /workbenches/[id]/forms/[formId]` `{answer}` ou `{cancel: true}` | resposta à pergunta |
| `GET /workbenches/[id]/events` | stream NDJSON |
| `PUT /workbenches/[id]/preview` `{enabled}` | chave "Gerar prévia" da mesa (desligada = PR automático só nesta mesa; religada em PR aberto gera a prévia na hora) |
| `PUT /workbenches/[id]/model` `{role, model, variant}` | troca o modelo de um papel da mesa (`planning`, `implementation`, `build`, `pr`); `model: null` volta ao padrão |
| `PUT /workbenches/[id]/forks/[forkId]/model` `{model, variant}` | troca o modelo do fork; `model: null` volta ao padrão |

Auditoria: `CentralDesenvolvimento` (criar/editar/excluir) e `MesaDeTrabalho` (abrir, PR,
merge, reabrir, excluir).

## Testes

`__tests__/features/agentic/` (prompts, regras, linha do tempo (dedupe por id), filtros, fila (`queue`),
criação da central com o seletor de repositório (`create-central-dialog`), mesas em
andamento (`in-progress`), hub, runner com cliente falso — incluindo **reconexão** (`attach`) e a
releitura das pendências no buraco do SSE —, o ciclo automático de reconexão (`reconnect`,
`auto-reconnect`), acompanhamento do PR (inclusive o relato ao vivo: `pr-watch`, `pr-watch-report`,
`pr-watch-schedule`, `timeline-pr-watch`, `PrWatchItem`, `hub`; e `__tests__/features/pr-review/gate.test.ts`), rota de ações, barra de ações, troca de modelo na mesa e no fork (`model-override`, `workflow-model`,
`forks-model`, `model-routes`, `ModelOverridePicker`), modelos de fallback
(`model-fallback`, `logic` › modelos de fallback, `workflow-model`, `forks`, `fallback-models-field`), exclusão de sessão (`session-cleanup`),
conclusão da mesa com exclusão da sessão (`workflow-session-cleanup`), conflito de merge do PR
(`workflow-pr-conflicts`), CI falho do PR (`ci`, `workflow-pr-ci`, prioridades e limite em
`pr-watch`, `ciFixPrompt` em `prompts`, padrão global/central em `logic`, `git-section` e
`agentic-settings-tabs`), merge automático do PR (`pr-automation`), backup da prévia
(`preview-backup` e `workflow-preview-backup`, com o backup **ligado e desligado** — OPE-72),
aba Ambiente do formulário da central (`environment-section`, com o toggle do backup e o switch de
**Publicar prévia** e ocultar os campos do ambiente — OPE-79), fila e movimentação globais/por central
(`columns-section`), fluxo da mesa — Publicar prévia vs PR automático, incluindo o **padrão herdado da
central** (`workflow-flow-mode`) e a chave Gerar prévia da mesa (`workflow-preview-switch`), a migração que preserva o fluxo das tarefas antigas
(`task-flow-backfill`) e **exclusão da mesa com limpeza do ambiente**
(`workflow-deletion`) e a decisão da limpeza (`environment-cleanup`)),
`__tests__/deployment/preview-github.test.ts` (prévia remota, com e sem o dump obrigatório),
`__tests__/components/agent-questions.test.tsx` (perguntas com descrição
das opções) e `__tests__/lib/ai/opencode-events.test.ts`. O OpenCode e o GitHub são sempre mockados.
