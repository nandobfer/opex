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
`src/features/agentic/server/preview-backup.ts`.

## Configuração (Integrações › Provedores de IA › aba "Desenvolvimento agêntico")

- Configuração geral em `ai_feature_settings` (`feature: "agentic-dev"`,
  `agenticSettingsSchema`): **ativa** e o **agente padrão** (agente, modelo `provedor/modelo`,
  variante) de cada etapa: **Planejamento**, **Implementação**, **Build e ambiente** (também faz a
  limpeza) e **Pull Request**. Agentes/modelos são conferidos no OpenCode ao salvar (com a feature
  ativa, exige o OpenCode conectado).
- Disponível = ativa + OpenCode configurado e conectado (`agenticAvailability`).
- A aba tem duas **abas internas** (estado local, não vão à URL; padrão **Agentes**):
  - **Agentes**: card que liga a feature (ativa) + os **agentes padrão** de cada etapa, com os botões
    **Salvar**/**Desfazer** (mesma configuração geral acima).
  - **Centrais de desenvolvimento**: card com a lista das centrais (abaixo).
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
| Geral | ativa, diretório das sessões, pasta dos worktrees (padrão `<diretório das sessões>/worktrees`), mesas abertas ao mesmo tempo (1–10, padrão 2), repositório (do vínculo em Integrações › GitHub) |
| Agentes | cada etapa herda o padrão da aba ou é personalizada (override campo a campo: agente vazio herda; modelo próprio leva a variante própria — `resolveAgent`) |
| Git e PR | branch base, branch de destino do PR, padrões da branch/commit/título (`{code}`, `{title}`, `{slug}`), PR rascunho, **merge automático** (o agente mergeia o PR e apaga a branch remota — ver “Merge automático”), revisores, labels, comandos de preparo do worktree e de validação antes do PR |
| Ambiente | arquivo do compose (vazio = padrão do projeto), variável da porta (padrão `PORT`), faixa de portas da prévia (porta inicial/final, padrão 4001–4098), endereço da prévia (host, padrão `localhost`), caminho do teste de saúde, tempo máximo do build |
| Colunas e conclusão | coluna da fila (abre a mesa automaticamente ao receber um card — "Nenhuma" por padrão), coluna ao abrir a mesa (implementação), ao abrir o PR e ao concluir (PR mergeado) — cada uma "Não mover" por padrão; limpeza após o merge (derrubar a prévia, remover o worktree, apagar a branch local) — tudo padrão **sim**; o backup da prévia é sempre removido na conclusão; o que vai para o planejador (comentários, histórico) |
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
conclusão"). Ao mover um card para essa coluna, a tarefa do projeto entra na fila para abrir a mesa:

- **Vaga livre** (mesas abertas `< maxConcurrent`) → a mesa é criada **na hora** e o planejamento
  começa (o mesmo fluxo de "Abrir mesa e gerar o plano").
- **Sem vaga** → a tarefa **aguarda na fila** e a mesa é criada quando uma mesa conclui (ou é
  excluída). A ordem é a **dos cards no kanban** (`order`); a posição (1-based) aparece na lista de
  tarefas e na mesa como "Na fila · #N".
- O **limite** (`maxConcurrent`, "Mesas abertas ao mesmo tempo", 1–10) conta mesas **não concluídas**
  (`stage != done`). Uma mesa aberta nunca é bloqueada nos próprios turnos.
- A fila é **derivada** (`DevTask` do projeto na coluna, não arquivadas e sem mesa) — não há coleção
  própria. `GET /api/agentic/centrals/[id]/queue` devolve a fila para a tela.
- **Gatilhos**: mudança de coluna da tarefa (criar/atualizar/mover/lote) avisa a central; concluir
  ou excluir uma mesa libera a vaga; mudar a config da central reavalia a fila. A rotina interna
  **`agentic-queue-pump`** (1 min, Crons) cobre reinícios e vagas liberadas fora do processo.
- Sem OpenCode conectado, ou com a feature/central desativada, a tarefa **permanece na fila** e é
  iniciada quando ficar disponível. Mover o card para fora da coluna remove a tarefa da fila.
- Excluir a coluna da fila de uma central é bloqueado (`COLUMN_QUEUE_IN_USE`): troque a coluna na
  central antes.

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
  backup obrigatório e executa `npx tsx scripts/preview-github.ts <estado> <tentativa>` no worktree.
  O workflow e o runner devem estar instalados no projeto com a skill global
  `~/.agents/skills/setup-preview-workflow/`. O Opex inclui os dois como referência funcional.
- O runner autoriza **push da branch antes da aprovação**, sem abrir PR. Exige worktree limpo,
  branch da mesa e SHA imutável. Dispara `workflow_dispatch` na branch padrão; nenhum push/PR
  dispara publicação de prévia. Workflow: suíte completa → build → artefato com checksum/manifest.
- A porta permanece reservada no banco, dentro da faixa da central. O GitHub não escolhe portas.
  Estado `remote-preview-<tentativa>.json` fora do worktree, na pasta do backup, guarda tentativa, SHA, runId
  e confirmação de publicação. A URL do run aparece nos logs da sessão; reconexão pode retomar
  o run registrado. O agendador existente e a reconciliação de turnos continuam cobrindo reinícios.
- O runner baixa o artefato daquela execução, valida SHA/tentativa/checksum, confere backup e
  worktree, revalida porta e importa a imagem. Publica com override Compose por tentativa,
  `--no-build --pull never`, mesma variável de porta/projeto/serviço. Porta ocupada por outra
  aplicação falha; container da própria mesa pode ser recriado. Não há fallback para build local.
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

## Backup do MongoDB da prévia (OPE-54)

Antes de publicar a prévia, o agente cria um **dump do banco MongoDB do próprio projeto** (não o do
Opex) e a mesa só conclui depois de removê-lo. Pipeline: `preview-backup.ts` (caminhos puros),
`server/preview-backup.ts` (reserva e conferência) e os prompts de build/limpeza.

- **Caminho reservado antes do build**: ao iniciar o turno de build (`startBuildTurn`), a mesa
  reserva uma pasta exclusiva do ciclo em `<pasta dos worktrees>/.opex-backups/<código>/<ciclo>/`
  (`previewBackup` na mesa: `dir`, `path`, `createdAt`) e o prompt de build manda criar o dump ali
  como arquivo único (`mongodump --archive ... --gzip`), limitado ao banco do projeto e **sem
  imprimir credenciais**. A pasta fica **fora do worktree**, então nunca entra em commit nem é
  derrubada pelo `git worktree remove`.
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
- O topo da coluna de tarefas traz, de cima para baixo: o **título "Tarefas"** com a contagem; o
  **seletor da central** (`SearchPicker`/`CentralPicker`) ocupando a **linha inteira** — o gatilho
  mostra o **repositório do GitHub** (`GithubRepoLabel` — avatar + `owner/repo` + cadeado) e a lista
  é buscada por nome/projeto; a **busca por código/título**; e o **filtro de colunas**
  (`CadastroMultiSelect`) também em linha inteira; por fim a lista. Não há atalho das configurações
  da central nem botão de restaurar filtros na coluna (as configurações ficam em Integrações ›
  Provedores de IA › Centrais e no botão do estado vazio). O avatar real vem do índice de
  repositórios do GitHub (`RepoIndexProvider`, montado no layout de `/desenvolvimento`); sem token,
  cai na inicial.
- Navegar entre tarefas ou centrais **não** anima nem remonta a página inteira (`/desenvolvimento`
  está em `PERSISTENT_PAGE_HREFS` da casca): as colunas ficam paradas (rolagem e filtros mantidos)
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
  switch **Fluxo da mesa** (Publicar prévia / PR automático, ver "Fluxo da mesa") e um campo
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
         ├─ merge automático (se ligado na central) → merging_pr → deleting_pr_branch → finishing (limpeza) → done
         ├─ merge → finishing (limpeza) → done
         └─ fechado sem merge → aviso (uma vez)
done → Reabrir mesa (texto ao planejador) → planning
```

- `runState`: `idle` | `running` | `failed` | `interrupted`. Ações por etapa em
  `workbenchActions` (mesma regra na tela e nas rotas): executando só **Parar**; falha/interrupção →
  **Reconectar** (acompanha a sessão existente **sem** reenviar mensagem — ver "Reconectar"),
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
- **Fluxo da mesa (OPE-53)**: o estado inicial da mesa traz a switch **Fluxo da mesa** —
  **Publicar prévia** (padrão) ou **PR automático** —, salva na hora na tarefa
  (`DevTask.agenticFlow`, ajustável por `PATCH /api/tasks/[id]`) e copiada para a mesa ao abrir
  (`agenticFlow`; registros antigos caem em `preview`). Em **PR automático** a implementação vai
  **direto** ao PR (etapa `opening_pr`, turno encadeado na mesma sessão), pulando a fila do build, a
  prévia e a aprovação: nenhuma porta é reservada e a limpeza não derruba ambiente. A revisão do
  plano continua obrigatória nos dois fluxos e a trilha da mesa esconde o passo "Prévia" no PR
  automático.
- **Build Local**: ao fim da implementação a mesa entra na **fila global do build** (`build_queued`, ver
  acima) e só sobe quando não há outro build. A porta é reservada no banco (índice único) na faixa
  configurada na central (padrão **4001–4098**), pulando portas ocupadas no host
  (`allocatePreviewPort`); a IA roda
  `<VAR>=<porta> docker compose -p <projeto-código> [-f arquivo] up -d --build` no worktree e
  termina com um bloco JSON `{"ok": true|false, "error"?}`. O app espera a prévia responder
  (`http://<host>:<porta><saúde>`, até 90 s). Prévia pronta: **Abrir em nova guia**,
  **Solicitar correção**, **Aprovar e abrir PR**. No **celular** as ações da etapa ficam na **mesma
  linha** (sem quebrar): **Abrir em nova guia** só com o ícone e as demais com rótulo compacto
  (**Correção**, **Aprovar PR**…), preservando o nome acessível completo; se não couber, a barra rola
  na horizontal. Assim a saída do agente ganha altura de leitura.
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
- **Reconectar** (`POST /workbenches/[id]/actions/reconnect`): quando a mesa aparece em falha/
  interrupção mas o agente **continua rodando** no OpenCode (queda de conexão ou reinício do app),
  religa o acompanhamento da **mesma sessão** — **sem** enviar prompt nem trocar agente/modelo. O app
  confere a sessão no OpenCode (`session.get`/`session.active`): se ainda executa, volta a assinar o
  SSE e segue até o fim; se já terminou durante a queda, **recupera o resultado do histórico**
  (`message.list`) e aplica a transição da etapa **uma única vez**; se não há execução em andamento,
  avisa e mantém o estado. Também **restaura perguntas e permissões** que ficaram pendentes (o SSE é
  só ao vivo) e usa o `turnStartedAt` como marco do turno. Sem sessão, sem etapa de execução ou com
  o agente indisponível, a ação responde 409 e a tela continua oferecendo **Tentar novamente**.
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

## Saída ao vivo

- `hub.ts` (em memória, `globalThis`): cada evento ganha `seq` por execução, vai na hora para quem
  assiste e é gravado em lote em `agentic_events` (textos seguidos viram um documento; saída de
  ferramenta cortada em 20 mil caracteres guardando o fim). Raciocínio e progresso de ferramenta são
  só ao vivo. O **refinamento de tarefas** reusa este barramento/coleção (chave = id do refinamento).
- `GET /api/agentic/workbenches/[id]/events` (NDJSON): `reset` + tudo o que foi gravado + ao vivo,
  `ping` a cada 15 s. Sem buracos: assina, grava o pendente, lê o banco e descarta `seq` repetido.
  O cliente (`useWorkbenchStream`) reconecta sozinho (3 s; 45 s sem nada = reconectar) e reconstrói
  com `applyTimelineLine` (`timeline.ts`, puro).
- Mudanças de etapa/pedidos chegam pelo Pusher (`agentic-updated` em `private-app`, payload
  `{centralId, workbenchId, taskId}`) → `useAgenticRealtime` invalida as consultas `["agentic"]`.
- Tela: cabeçalho (código → página da tarefa, etapa, "ao vivo", custo, branch, worktree, porta,
  prévia, PR), passos (Plano → Implementação → Prévia → Pull Request → Concluída), abas **Saída da
  IA** (turnos, texto em Markdown, ferramentas recolhíveis — abertas enquanto executam, avisos) e
  **Plano vN** (versões), pedidos pendentes e barra de ações com o campo de correção.
- **Rolagem da saída** (`useStickToBottom`): a aba "Saída da IA" acompanha o fim do stream sozinha
  sempre que o conteúdo cresce — inclusive quando um item do **meio** da lista muda (ex.: o fim de
  um turno) — enquanto o usuário estiver no fim. Ao rolar para cima, o acompanhamento **para** (não
  volta sozinho) e aparece um botão flutuante **Ir para o final**; ao voltar ao fim ou clicar no
  botão, o acompanhamento **retoma**. O botão rola suave, desligando o movimento com
  `prefers-reduced-motion`.

## APIs (`src/app/api/agentic/`)

| Rota | Uso |
|---|---|
| `GET/PUT /settings` | configuração geral |
| `GET/POST /centrals`, `GET/PUT/DELETE /centrals/[id]`, `POST /centrals/[id]/test`, `GET /centrals/[id]/workbenches`, `GET /centrals/[id]/queue` | centrais |
| `POST /workbenches` `{centralId, taskId, text?}` | abre a mesa e inicia o plano; `text` são as informações adicionais do primeiro prompt (409 se já existir) |
| `GET /workbenches/in-progress` | mesas em andamento (executando ou aguardando ação humana) |
| `GET /workbenches/by-task/[taskId]`, `GET/DELETE /workbenches/[id]` | mesa (o `DELETE` limpa o ambiente e devolve `{ deleted }`) |
| `POST /workbenches/[id]/actions/[action]` | `revise-plan`, `request-correction`, `submit-pr-feedback`, `reopen` (`{text}`); `implement` (`{text?}` — informações adicionais ao prompt de implementação); `approve`, `retry`, `interrupt`, `reconnect` |
| `POST /workbenches/[id]/permissions/[requestId]` `{decision, message?}` | resposta à permissão |
| `POST /workbenches/[id]/forms/[formId]` `{answer}` ou `{cancel: true}` | resposta à pergunta |
| `GET /workbenches/[id]/events` | stream NDJSON |

Auditoria: `CentralDesenvolvimento` (criar/editar/excluir) e `MesaDeTrabalho` (abrir, PR,
merge, reabrir, excluir).

## Testes

`__tests__/features/agentic/` (prompts, regras, linha do tempo, filtros, fila (`queue`),
criação da central com o seletor de repositório (`create-central-dialog`), mesas em
andamento (`in-progress`), hub, runner com cliente falso — incluindo **reconexão** (`attach`) —,
acompanhamento do PR, rota de ações, barra de ações, exclusão de sessão (`session-cleanup`),
conclusão da mesa com exclusão da sessão (`workflow-session-cleanup`), conflito de merge do PR
(`workflow-pr-conflicts`), merge automático do PR (`pr-automation`), backup da prévia
(`preview-backup` e `workflow-preview-backup`), fluxo da mesa — Publicar
prévia vs PR automático (`workflow-flow-mode`) e **exclusão da mesa com limpeza do ambiente**
(`workflow-deletion`) e a decisão da limpeza (`environment-cleanup`)),
`__tests__/components/agent-questions.test.tsx` (perguntas com descrição
das opções) e `__tests__/lib/ai/opencode-events.test.ts`. O OpenCode e o GitHub são sempre mockados.
