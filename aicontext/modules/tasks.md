# Módulo: Tarefas (`/tarefas`)

Página inicial do app (`/` redireciona para `HOME_HREF = "/tarefas"`). Mostra as tarefas do
Centro de Desenvolvimento do **Go! Sipal** em **kanban** ou **tabela**, permite **mudar o status**
(arrastar no kanban, "Mover para…" na tabela e na página da tarefa), **responsável e prioridade**
(na linha da tabela e na página da tarefa), **ações em lote** sobre as tarefas selecionadas e abre
cada tarefa numa página própria (`/tarefas/[id]`). Não cria tarefas do zero nem edita outros
campos; tarefas novas só nascem enviando **rascunhos** de issues do GitHub (ver "Rascunhos").

Além das 7 colunas do Go! Sipal, o quadro tem **colunas customizadas** (status pessoais) que só
existem nO Opex — ver "Colunas customizadas".

Depende da sessão da integração Go! Sipal (`modules/go-sipal.md`). Sem sessão, as telas mostram
"Conecte-se ao Go! Sipal" com link para `/integracoes/go_sipal`.

## Contrato usado da plataforma (rotas internas, conferidas em `~/code/sap-painel-lancamento`)

| Rota do Go! Sipal | Uso aqui |
|---|---|
| `GET /api/dev-center/tasks[?includeArchived=true]` | Quadro inteiro (Backlog e Em Produção limitados a **200** cada) |
| `GET /api/dev-center/tasks/[id]` | Detalhe (só `_id` Mongo): comentários, histórico, anexos, plano, `timeLogs`, `totalTimeLogged` |
| `POST /api/dev-center/tasks/[id]/move` `{targetStatus, order?, commitUrl?, pullRequestUrl?}` | Mudar status/ordem |
| `PUT /api/dev-center/tasks/[id]` `{assignee?, priority?}` | Responsável (`null` remove) e prioridade. A resposta não popula o produto: a tela recarrega |
| `POST /api/dev-center/tasks/[id]/archive` `{archive}` | Arquivar/desarquivar |
| `GET /api/dev-center/products` / `GET /api/dev-center/developers` | Opções dos filtros |

A plataforma **não tem rota de lote**: o app faz uma chamada por tarefa. Qualquer desenvolvedor pode
alterar qualquer tarefa (não há checagem de dono).

Pacotes de trabalho **não** são listados pela plataforma sem produto (`productId` obrigatório): as
opções do filtro saem das próprias tarefas carregadas.

## Vocabulário (`src/features/tasks/constants.ts`, espelho de `lib/constants/devTask.ts`)

- Status/colunas, nesta ordem: Backlog · Priorizado · Especificação · Desenvolvimento · Validação ·
  Aguardando Produção · Em Produção.
- Tipos: Análise e Especificação, Nova Funcionalidade, Correção, Automação, Testes, DevOps.
  Prioridades: Urgente, Alta, Média, Baixa.
- **Regras de transição** (mesmas de `validateTaskTransition`):
  - **Em Produção é final**: o card fica travado (cadeado, sem arraste; "Mover para" desabilitado);
    o servidor do app recusa (400) sem chamar a plataforma quando `fromStatus` é Em Produção.
  - **Validação exige URL de commit** (GitHub/GitLab/Bitbucket) e **Aguardando Produção exige URL
    de PR/MR** (GitHub/GitLab), exceto tipos sem código (análise, automação, testes, DevOps).
    `requiredUrlFor` decide antes de chamar; se a plataforma ainda recusar com
    `requiresCommitUrl`/`requiresPullRequestUrl`, o diálogo reabre com a mensagem dela.
- Ordenação dos cards (`ordering.ts`): Prioridade (padrão), Manual (arrastar), Mais recentes, Mais
  antigas. `order` novo = ponto médio entre vizinhos (`computeDropOrderInList`, trata empate).

## Servidor (`src/features/tasks/server/`)

- `mappers.ts`: normaliza as respostas (`toTaskDto`, `toTaskDetailDto`, `toTaskOptions`); registros
  inválidos são descartados, campos estranhos viram `null`.
- `service.ts`: `listTasks` (inclui `currentUserId` lido do JWT e `baseUrl`), `getTask` (id que não
  é ObjectId → 404 sem chamar), `getTaskOptions`, `moveTask` (auditoria `TarefaGoSipal`/`MOVER`
  com antes/depois, evento Pusher). Erros: sem sessão/401 → **401 `GO_SIPAL_SESSION`**; 403 →
  `GO_SIPAL_FORBIDDEN`; 404 → `TASK_NOT_FOUND`; recusa → 400 `GO_SIPAL_REJECTED` com `details`
  `{ requiresCommitUrl, requiresPullRequestUrl }`; indisponível → 502.
  `updateTask` (PUT; auditoria `ATRIBUIR` ou `ATUALIZAR` com antes/depois), `setTaskArchived`
  (auditoria `ATUALIZAR` `arquivada`) e `runBulkTasks` (cada item com a própria ação, **4 em
  paralelo**, resultado por tarefa sem derrubar o lote, **um** `tasks-updated` com as que deram
  certo). Em lote, mover a partir de Em Produção falha só aquele item.
- `sync.ts`: rotina **"Sincronizar tarefas do Go! Sipal"** (`go-sipal-task-sync`, interna, padrão a
  cada **1 min**, intervalo configurável em Integrações › Crons). Sem sessão: pulada. Lê o quadro
  (com arquivadas), compara a assinatura de cada tarefa (status, ordem, atualização, responsável,
  arquivada, prioridade, tipo, pacote) com a última leitura (`go_sipal_task_snapshots`, documento `board`) e,
  se algo mudou, publica `tasks-updated { ids }` (até 200) no canal `private-app`. A primeira
  leitura só grava a referência.

### APIs do app

| Rota | Descrição |
|---|---|
| `GET /api/tasks[?includeArchived=true]` | `TaskListDto { tasks, baseUrl, currentUserId, fetchedAt }` |
| `GET /api/tasks/options` | Produtos e desenvolvedores |
| `GET /api/tasks/[id]` | `TaskDetailDto` (com `platformUrl` = `{baseUrl}/dev-center?task={id}`) |
| `POST /api/tasks/[id]/move` | `moveTaskSchema` (`targetStatus`, `order?`, `commitUrl?`, `pullRequestUrl?`, `fromStatus?`, `code?`) |
| `PATCH /api/tasks/[id]` | `updateTaskSchema` (`assignee?: id \| null`, `priority?`, `code?`, `from?` para a auditoria) |
| `POST /api/tasks/bulk` | `bulkTasksSchema`: `items` (1–200) `{ id, code?, fromStatus?, action }`, ação `move` / `assign` / `priority` / `archive`; responde `{ results: [{ id, ok, error? }] }` |
| `GET /api/tasks/options` | Inclui `currentUserId` (da sessão) para "Atribuir a mim" |

## Colunas customizadas (status pessoais)

- Modelo (`src/lib/db/models/TaskBoard.ts`): `task_board_columns` (`key` `custom-…`, nome, cor,
  ícone, descrição, limite WIP), `task_board_layout` (documento `board`: ordem de todas as colunas)
  e `task_local_states` (tarefa → coluna customizada, ordem local e `goStatusAtEntry`).
- `board.ts` (puro): `normalizeLayout` mantém as 7 do Go! Sipal sempre presentes e na ordem do
  fluxo; cada customizada fica presa à coluna do Go! Sipal anterior (ou no início).
  `buildBoardColumns` monta as colunas da tela; `columnKeyOf(task)` = `localColumn ?? status`.
- **Mover para coluna customizada não chama o Go! Sipal** (`moveTask` com `targetColumn`; lote
  `local-move`). Vale até para tarefa em Produção. A tarefa continua com o status real, mostrado no
  card/tabela (`GoStatusChip`).
- Sair de uma customizada para uma coluna do Go! Sipal: apaga o estado local; se o status for o
  mesmo, **não chama** a plataforma; se for outro, segue as regras de sempre (URL, Em Produção).
- **Status mudou no Go! Sipal** desde que a tarefa entrou na coluna (ou a coluna sumiu): ao
  carregar (`applyLocalStates`, em `listTasks`/`getTask`) o estado local é apagado e a tarefa volta
  para a coluna do status atual; `TaskListDto.returned` lista quem voltou → toast + destaque animado
  no card. A rotina de sincronização já avisa a tela quando o status muda.
- Excluir: **só coluna vazia** (409 `COLUMN_NOT_EMPTY` com os códigos, contando rascunhos; no menu o
  item fica desabilitado com a contagem) e que não seja coluna de entrada de um vínculo do GitHub
  (409 `COLUMN_IN_USE` com os repositórios). Reordenar com colunas diferentes das atuais → 409
  `COLUMNS_CHANGED`.
- Auditoria `ColunaTarefas` (`CRIAR`/`ATUALIZAR`/`EXCLUIR`/`MOVER` da ordem) e movimentos locais em
  `TarefaGoSipal` (`MOVER` com `coluna`/`pessoal: true`). Evento Pusher `task-columns-updated`
  (`private-app`) → a tela recarrega colunas e tarefas.

| Rota | Descrição |
|---|---|
| `GET /api/tasks/columns` | `{ columns, layout }` |
| `POST /api/tasks/columns` | `createColumnSchema` (+ `afterKey`) |
| `PATCH /api/tasks/columns/[key]` | `columnInputSchema` |
| `DELETE /api/tasks/columns/[key]` | Só vazia (409) |
| `PUT /api/tasks/columns/order` | `{ order }` com todas as colunas |

## Tela `/tarefas` (`components/TasksPage.tsx`)

- Cabeçalho: título com total animado, "atualizado às HH:mm:ss", **Kanban | Tabela**
  (`TaskViewSwitch`, destaque deslizante) e **Atualizar** (ícone girando enquanto busca).
- **Filtros** (`TaskFiltersBar`, sobre `ListFilters`): Status com as colunas do Go! Sipal e as
  pessoais (marcadas "pessoal"; chaves de colunas excluídas são ignoradas); busca (código exato, senão título tolerante
  a erro com fuse.js), Produto, Responsável (com "(eu)" no topo e "Sem responsável"), Status,
  Prioridade, Tipo, Pacote de trabalho (só dos produtos escolhidos), Ordenar cards e Arquivadas
  (nova busca com `includeArchived`). "Limpar" zera os filtros, mantendo visão e ordenações.
- O cartão de filtros **começa recolhido** a cada entrada na página, mostrando só os filtros ativos
  em chips (`activeTaskFilterChips` em `filter-chips.ts`): `Busca: "x"`, `Produto: …`,
  `Responsável: Fulano (eu)`, `Status: …`, `Prioridade`, `Tipo`, `Pacote`, `Arquivadas: mostrando`
  e, discreto, `Ordem: …` quando não for Prioridade. Mais de 2 valores viram "N selecionados" (lista
  completa na dica). O × de cada chip remove só aquele filtro (Produto também limpa Pacote; Ordem
  volta para Prioridade). Clicar no cartão expande; ⌃ recolhe.
- **Filtros salvos no navegador**, sem prazo: `usePersistentState` (`src/hooks/`) com a chave
  `opex:tasks-filters:v1` e `taskFiltersSchema` (campo inválido volta ao padrão). Inclui a visão
  e as ordenações do kanban e da tabela. Sincroniza entre abas. Esqueleto até ler o navegador.
- Padrão: todos os responsáveis e todas as colunas.
- **Kanban** (`TaskBoard`/`TaskColumn`/`TaskCard`, dnd-kit + Framer Motion): colunas do Go! Sipal
  com selo "Go! Sipal" + cadeado (fixas, sem menu); customizadas com selo "Pessoal", alça para
  arrastar, ícone, descrição (tooltip), contador `n/limite` (âmbar acima do WIP) e menu Editar,
  Mover para a esquerda/direita e Excluir. **"+"** entre colunas (hover) e **"Nova coluna"** no fim
  abrem `ColumnFormDialog` (nome, cor, ícone com busca, descrição, limite).
  - **Altura e largura**: no kanban a página ocupa a altura da área de conteúdo (`min-h-full`,
    coluna flex) e o quadro fica com o que sobra (`flex-1 basis-0 min-h-0`); cada coluna tem a
    altura do quadro e a lista de cards fica com o resto dela, rolando até a borda de baixo (sem
    altura máxima fixa; piso `min-h-[200px]`, abaixo disso a página rola). A área que rola para os
    lados usa `CONTENT_BLEED_X` (margem negativa + padding iguais ao espaçamento do layout): as
    colunas rolam até a borda do conteúdo, e parado o alinhamento é o do resto da página.
  - **Cabeçalho em 2 linhas**: 1ª = alça (pessoais), ícone, nome, contador e menu; 2ª = faixa
    (`column-meta-{key}`, altura fixa) com o checkbox "selecionar todas" à esquerda (só no hover ou
    com seleção; some em coluna vazia), a descrição no meio (só pessoais; `text-[10px]` discreta,
    truncada, tooltip com o texto inteiro) e o selo à direita ("Go! Sipal" ou "Pessoal", ambos com
    tooltip). A faixa destaca o tipo: `bg-primary/10` nas do Go! Sipal (sem descrição), `bg-muted/60`
    nas pessoais.
  - **Arrastar coluna** (só customizadas): as vizinhas deslizam e abrem o espaço (sortable
    horizontal); a ordem salva é otimista (`useColumnMutations().reorder`).
  - **Arrastar card**: vários contêineres — o card entra na coluna de destino DURANTE o arraste e
    os cards abaixo descem (`moveBetweenColumns`); ao soltar, `finalDropPosition` dá a posição e o
    `order` (só na ordenação Manual; nas outras o card se acomoda pela ordenação). A posição do
    arraste segura até a resposta otimista (sem "pulo"). No lugar do card fica um espaço
    tracejado. Colunas do Go! Sipal ficam esmaecidas para tarefa em Produção.
  - Filtro de Status esconde colunas; contador animado; aviso quando Backlog/Em Produção
  atingem 200; colunas virtualizadas acima de 50 cards; card com código, tipo, título,
  produto · pacote, prioridade, responsável (iniciais; borda primária = minhas) e "Arquivada".
  Rodapé do card, à direita: issue vinculada (ícone do GitHub + `#N`, abre a issue), ▶ do timer e
  responsável.
  Soltar em outra coluna move (sempre); reordenar na mesma coluna só na ordenação **Manual** (nas
  customizadas a ordem é local).
- **Tabela** (`TaskTable`): colunas Código, Issue (ícone do GitHub + `#N`, abre a issue; "—" sem
  issue; ordena pelo número), Título, Status ("Mover para…"), Prioridade, Tipo,
  Produto, Responsável, Atualizada; ordenação por coluna (salva); virtualizada acima de 50. Pacote
  de trabalho não é coluna (o título fica com o espaço; continua no filtro e na página da tarefa).
  O título trunca e mostra o texto inteiro numa tooltip ao passar o mouse.
  **Rola com a página** (sem altura máxima nem rolagem própria): `usePageVirtualizer` mede a
  rolagem de `#main-content` e a posição da tabela nela (`scrollMargin`, recalculada quando os
  filtros abrem/fecham). Cabeçalho fixo no topo da página (sombra depois que começa a rolar).
  Sem rolagem horizontal: título trunca e colunas somem em telas estreitas
  (`TASK_TABLE_RESPONSIVE`: < xl sem Atualizada; < lg sem Tipo/Produto; < sm sem Issue; < md sem
  Prioridade, que vira um ponto colorido ao lado do código). Com seleção, a tabela ganha espaço
  no fim para a barra de ações flutuante.
- Sem carregamento infinito: o Go! Sipal devolve o quadro inteiro (sem paginação) e filtros,
  busca, ordenação, totais, seleção e kanban dependem da lista completa; a virtualização já
  mantém a tela leve.
- Mudança de status (`useTaskMoveFlow` + `useMoveTask`): **otimista** em todas as listas e no
  detalhe; falha reverte e mostra toast; URL exigida abre `MoveUrlDialog` (react-hook-form + Zod com
  as regras da plataforma).
- Clique no card/linha → `/tarefas/[id]`.
- **Edição na linha** (tabela): prioridade (`TaskPriorityMenu`) e responsável (`TaskAssigneePicker`:
  busca, "Atribuir a mim", "Remover responsável") aplicam na hora (`useUpdateTask`, otimista,
  reverte com toast). Valem só para a linha, mesmo com outras selecionadas. Clicar nelas não abre a
  tarefa. Pessoas = desenvolvedores da plataforma + responsáveis já vistos (`buildPeople`).

### Seleção e ações em lote

- **Seleção compartilhada** entre tabela e kanban (`useTaskSelection`), só das tarefas visíveis
  (o que sai do filtro deixa de estar selecionado); não é salva. Trocar de visão mantém. **Esc**
  limpa (exceto com diálogo/menu aberto).
  - Tabela: coluna de checkbox (`SelectionCheckbox`, `src/components/ui`); o do cabeçalho marca
    todas as linhas filtradas (estado "parcial"); **Shift+clique** marca o intervalo.
  - Kanban: checkbox no card (aparece no hover; sempre visível com seleção), no cabeçalho de cada
    coluna (todas da coluna) e **Ctrl/⌘ + clique** no card. Clique comum abre a tarefa.
  - **Arrastar um card selecionado (com outros selecionados) move todos** para a coluna de destino
    (pilha "N tarefas" no arraste; sem reordenar).
- **Barra flutuante** (`TaskBulkBar`, rodapé, 1+ selecionadas): **Mover**, **Atribuir**,
  **Prioridade** e **Arquivar/Desarquivar** (desarquivar quando todas estão arquivadas; com
  confirmação). Mover para Validação/Aguardando Produção pede **um link para todas** que precisam
  (as que já têm link válido ou são de tipo sem código não o recebem); Em Produção é ignorada com
  aviso.
  - Flutua por cima do conteúdo sem mudar a altura do quadro. O espaço para ela fica dentro do
    conteúdo (`BULK_BAR_CLEARANCE` / `BULK_BAR_CLEARANCE_PX`, 96 px): no fim da tabela e no fim da
    lista de cards de cada coluna (espaçador animado), para o último card/linha rolar acima da
    barra. A página não reserva espaço (no kanban isso encolheria o quadro).
- Execução (`useTaskBulkActions` + `useBulkTasks`, itens montados em `bulk-items.ts`): muda tudo
  na hora, envia em pedaços de 4 com progresso "N de M", reverte só as que falharam, resume no
  toast (motivo das 3 primeiras falhas) com **Desfazer por 8 s** (volta o valor anterior de cada
  tarefa; quem foi para Em Produção não volta). As que deram certo saem da seleção; as que falharam
  continuam selecionadas.
- Tempo real: `useTasksRealtime` assina `tasks-updated` em `private-app` e invalida as consultas.

## Rascunhos (issues do GitHub)

Issues novas dos repositórios vinculados viram **rascunhos** (ver `modules/github.md`). No quadro
e na tabela são tarefas com id `draft-{id}`, código `repo#N`, `draft` e `issue` preenchidos
(`src/features/tasks/drafts.ts`):

- Aparência: borda tracejada, selo **Rascunho** (com "issue fechada" se a issue fechou antes do
  envio), sem timer e sem chip de status do Go! Sipal. Botão do GitHub abre a issue.
- **Mover entre colunas pessoais** é normal (otimista; `moveTask` → `moveDraft`).
- **Soltar numa coluna do Go! Sipal** (ou "Mover para…"): o card volta e abre **"Enviar para o
  Go! Sipal?"** (`SendDraftDialog`): coluna (Backlog/Priorizado/Especificação/Desenvolvimento),
  tipo, pacote, prioridade e responsável já preenchidos pelo mapeamento (com a origem), prévia da
  descrição. Validação, Aguardando Produção e Em Produção ficam esmaecidas/bloqueadas
  (`draftAcceptsColumn`).
- Lote: mover entre pessoais, atribuir e prioridade mudam o rascunho; mover para coluna criável pede
  confirmação "Enviar N rascunhos" e envia (sem desfazer); para as demais, os rascunhos são
  ignorados com aviso. **Descartar** (barra) com confirmação e Desfazer por 8 s; Arquivar vale só
  para tarefas. Ações `discard`/`restore` no `bulkTasksSchema`.
- `PATCH /api/tasks/[id]` e `POST /api/tasks/[id]/move` aceitam id de rascunho (respectivamente
  editam e movem/enviam o rascunho).
- **Página do rascunho** (`/tarefas/draft-…`, `components/draft/`): código, tipo, selo, título;
  "Mover para…", **Entender rascunho** (IA, ver `modules/ai.md`) e **Abrir issue** (`#N`) como
  botões de ícone com dica, **Descartar**
  (confirmação + Desfazer) e **Enviar para o Go! Sipal**. Abas Descrição (prévia com imagens; Editar título/descrição; "Restaurar da issue") e
  Comentários da issue. Lateral com responsável, prioridade, tipo e pacote editáveis (origem de
  cada um e "da issue" quando editado), produto, labels/Issue Type/milestone/assignees, autor.
  Rascunho enviado mostra o link da tarefa criada; descartado oferece Restaurar.
- Tarefas vinculadas a uma issue mostram o botão da issue com o número (`#N`) no rodapé do card e
  na coluna Issue da tabela, **Abrir issue** (ícone + `#N`, `IssueIconButton`) na página e
  o aviso da integração (ex.: "Issue fechada: aguardando o commit para ir para Validação").
- Mover uma tarefa para Validação (ou além) fecha a issue vinculada.

## Página da tarefa `/tarefas/[id]` (`components/detail/`)

- Voltar, Atualizar, código, tipo, "Arquivada", título, **status com "Mover para…"** (mesmo fluxo)
  e **Abrir no Go! Sipal**.
- Cabeçalho: **Entender tarefa**, **Mesa de trabalho**, **Abrir issue** e **Abrir no Go! Sipal** são
  botões só de ícone com contorno (`TooltipIconButton`, `src/components/ui/tooltip-icon-button.tsx`)
  e o texto do botão na dica (e como nome acessível). Bloqueado usa `aria-disabled` (continua
  focável) e a dica mostra o motivo. "Abrir issue" mostra o número ao lado do ícone (`#N`).
- Abas animadas: Descrição (descrição, contexto de negócio, critérios de aceite, especificação
  técnica — Markdown), Plano (complexidade, passos, arquivos), Comentários, Histórico (linha do
  tempo, mais recente primeiro), Horas (apontamentos; "Em andamento" para timer ativo).
- Lateral: responsável e prioridade **editáveis** (mesmos componentes da tabela), tipo, produto, pacote (período), horas apontadas, commit, PR,
  vínculos (solicitação/melhoria), criada (por quem) e atualizada.
- Estados: esqueleto, sem sessão, **Tarefa não encontrada**, erro com tentar novamente.
- Markdown: `src/components/ui/markdown.tsx` (`react-markdown` + `remark-gfm`, sem HTML cru).
- **Entender tarefa** (cabeçalho, ao lado do status): abre um modal que explica a tarefa com IA em
  streaming. Desabilitado (dica com o motivo) quando a feature está desativada ou o provedor não está
  conectado. Detalhes em `modules/ai.md`.
- **Mesa de trabalho** (cabeçalho): leva à mesa da tarefa na Central de desenvolvimento
  (`/desenvolvimento/[central]/[tarefa]`). Com mesa, o botão assume a cor da etapa (falha em vermelho,
  parada apagada; `workbenchToneClasses`) e a dica mostra o chip da etapa. Bloqueado (dica)
  quando o produto da tarefa não tem central. Detalhes em `modules/agentic-dev.md`.

## Testes

`__tests__/features/tasks/` (`tasks-logic`, `tasks-service`, `task-move-flow`, `tasks-bulk`, `task-columns`, `task-drafts`, `TasksPage`) e
`__tests__/hooks/usePersistentState.test.tsx`.

## Controle de horas

Timer por tarefa (▶/⏸ no card, na linha da tabela e na página da tarefa), destaque verde com
cronômetro ao vivo na tarefa em andamento, indicador girando e botão "Minhas horas" no topo — tudo
direto no Go! Sipal. Ver `modules/time.md`.
