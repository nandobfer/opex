# Módulo: Tarefas (`/tarefas`)

A página inicial do app é **Dashboards** (`/dashboard`); `/` redireciona para
`HOME_HREF = "/dashboard"` (ver `modules/dashboard.md`). O Opex é a **fonte de
verdade** das tarefas: cria, edita, exclui, organiza em **kanban** ou **tabela** e aponta horas. Não
há plataforma externa — nada aqui espelha outro sistema.

As colunas do quadro são **100% configuráveis** (criar, editar, reordenar, excluir); cada tarefa
pertence a **uma** coluna. Não existem regras automáticas de transição — exceto a **coluna da fila**
de uma central de desenvolvimento: o card que entra nela pode abrir a mesa da tarefa automaticamente
(ver `modules/agentic-dev.md`).

## Modelo (`src/lib/db/models/`)

- `DevTask` (`dev_tasks`): `{ code, projectId, columnId, order, title, description, technicalSpec,
  taskType, priority, archived, clientId, summary, summarySourceHash, summaryUpdatedAt, tags,
  tagsSourceHash, tagsUpdatedAt, estimate, agenticFlow }`.
  `description` e `technicalSpec` são Markdown **sem limite artificial de caracteres** (o schema não
  corta nem recusa por tamanho; a mesa/refinamento enviam a tarefa inteira ao agente).
  `code` = `{SIGLA}-{n}` (sequencial por projeto, via `taskSeq` do projeto com `$inc`). `summary` é o
  resumo de 1 linha gerado por IA e `summarySourceHash` é o hash de título+descrição usado nele
  (detecta desatualização) — ver `modules/ai.md`. `tags` são os **ids** da taxonomia fechada da
  feature "Tags de tarefas" e `tagsSourceHash` é o hash equivalente das tags (ver `modules/ai.md`).
  `clientId` é o cliente de orçamento **da tarefa** — o que a **solicitou** pelo portal ou o que o
  dono **atribuiu/atualizou na página da tarefa** (`null` = sem cliente) — e é o que define a lista
  do portal (o cliente só vê as dele). `estimate` é a estimativa da tarefa (snapshot: horas reais,
  horas do cliente, fator, custo/hora e faturamento) e **não depende do cliente**: sem cliente ela
  guarda só as **horas reais** (fator 1, custo 0, sem inflação); com cliente, o prazo e o faturamento
  são inflados. `estimate: null` significa **ainda não estimada** (a edição manual ou a IA cria).
  Ver `modules/orcamentos.md`.
- `TaskComment` (`task_comments`): `{ taskId, content, authorType, authorName, createdAt }`. A origem
  do comentário (`authorType: "owner" | "client"`) e o nome exibido (`authorName`: o dono vindo de
  `APP_OWNER_NAME`/`getLocalUser()`, ou o nome do cliente no portal) permitem marcar quem comentou;
  comentários antigos (sem autor) caem no dono. Ver `modules/orcamentos.md`.
- `TaskBoardColumn` (`task_board_columns`) e `TaskBoardLayout` (`task_board_layout`, documento
  `board` com a ordem).
- `Project` (`projects`): um repositório GitHub vinculado (ver `modules/github.md`).
- Histórico = derivado do `AuditLog` (entidade `Tarefa`), não é coleção própria.

**Migração** `drop-legacy-collections` (boot, idempotente): remove as coleções da era Go! Sipal
(`go_sipal_task_snapshots`, `task_local_states`, `github_people`, `task_drafts`). O quadro padrão é
semeado na primeira leitura (`ensureBoard`).

## Vocabulário (`src/features/tasks/constants.ts`, puro)

- Tipos: Análise e Especificação, Nova Funcionalidade, Correção, Automação, Testes, DevOps.
- Prioridades: Urgente, Alta, Média, Baixa.
- Ordenação dos cards (`ordering.ts`): Prioridade (padrão), Manual (arrastar), Mais recentes, Mais
  antigas. `order` novo = ponto médio entre vizinhos (`computeDropOrderInList`).
- **Tags** (`src/features/tasks/tags.ts`, puro): taxonomia **fechada** (`{ id, label }`) gerenciada
  em "Tags de tarefas" (Integrações › Provedores de IA); a tarefa guarda só os ids. `slugifyTag`,
  `normalizeTaxonomy`, `filterKnownTags`, `tagLabel`. Ver `modules/ai.md`.

## Servidor (`src/features/tasks/server/`)

- `service.ts` (`TASK_AUDIT_ENTITY = "Tarefa"`): `listTasks(includeArchived)` (junta projeto e issue),
  `getTask` (detalhe com comentários, histórico e horas), `getTaskOptions` (projetos), `createTask`
  (gera o código, vai para o fim da coluna; aceita `clientId` do portal e `tags`), `updateTask` (campos; mudar
  de coluna leva ao fim dela), `moveTask` (coluna + ordem), `setTaskArchived`, `deleteTask` (apaga
  comentários e apontamentos), `setTaskClient` (define/troca/remove o cliente da tarefa e recalcula a
  estimativa), `addComment` (grava a origem e o nome do autor via
  `{ id, type, name }`), `runBulkTasks` (cada item com a própria ação, 4 em paralelo, um
  `tasks-updated`), `listTasksForClient(clientId, includeArchived)` (tarefas que um cliente do portal
  solicitou). `updateTask` aceita `origin`: `"opex"` (padrão), `"github"` (vindo da sincronização —
  não ecoa de volta) ou `"client"` (edição do cliente no portal, ex.: a prioridade — ver
  `modules/orcamentos.md`); a origem entra na auditoria. Toda mutação grava auditoria e publica
  `tasks-updated { ids }` no canal `private-app`.
  Mudanças de coluna também avisam o desenvolvimento agêntico (a tarefa pode entrar na fila de uma
  central). Criar a tarefa e editar título/descrição disparam, em segundo plano, a geração do resumo
  e das tags de IA. `concludedColumnKeys` devolve as colunas de conclusão dos vínculos (usado pelos
  resumos e pelas tags de IA).
- `columns.ts` (`COLUMN_AUDIT_ENTITY = "ColunaTarefas"`): `ensureBoard` (semeia o quadro padrão —
  A Fazer / Em Andamento / Concluído — na primeira execução), `getBoard`, `createColumn`,
  `updateColumn`, `deleteColumn` (só vazia, que não seja coluna de entrada de um projeto —
  `COLUMN_IN_USE` — nem coluna da fila de uma central — `COLUMN_QUEUE_IN_USE`), `reorderColumns`
  (409 `COLUMNS_CHANGED` se a ordem não bate). Publica `task-columns-updated`.

### APIs do app

| Rota | Descrição |
|---|---|
| `GET /api/tasks[?includeArchived=true]` | `TaskListDto { tasks, fetchedAt }` |
| `POST /api/tasks` | `createTaskSchema` |
| `GET /api/tasks/[id]` | `TaskDetailDto` |
| `PATCH /api/tasks/[id]` | `updateTaskSchema` (parcial; inclui `agenticFlow` — fluxo da mesa, ajustável só pela tela de desenvolvimento) |
| `PATCH /api/tasks/[id]/estimate` | `updateTaskEstimateSchema` (`hours`) — grava as horas reais (cria a estimativa se não existir) e recalcula prazo/faturamento com o cliente da tarefa |
| `POST /api/tasks/[id]/estimate/generate` | Estima as horas com IA (NDJSON; reusa "Estimar prazos") e grava o snapshot |
| `PATCH /api/tasks/[id]/client` | `setTaskClientSchema` (`clientId: string \| null`) — define/troca/remove o cliente; recalcula a estimativa (`null` remove o cliente e a inflação, **preservando as horas reais**) |
| `POST /api/tasks/[id]/tags` | Gera (ou regenera) as tags da tarefa (JSON `{ tags }`) |
| `DELETE /api/tasks/[id]` | Exclui a tarefa |
| `POST /api/tasks/[id]/move` | `moveTaskSchema` (`targetColumn`, `order?`) |
| `POST /api/tasks/[id]/comments` | `{ content }` |
| `POST /api/tasks/bulk` | `bulkTasksSchema`: ações `move` / `priority` / `archive` |
| `GET /api/tasks/options` | Projetos |
| `GET/POST /api/tasks/columns` · `PATCH/DELETE /api/tasks/columns/[key]` · `PUT /api/tasks/columns/order` | Colunas |
| `POST /api/tasks/drafts` | Abre a prévia do dono (`clientId: null`); `clienteDraftSchema` |
| `GET /api/tasks/drafts/[id]` | Rascunho da prévia (prévia + estimativa) |
| `POST /api/tasks/drafts/[id]/correction` | Registra o ajuste pedido |
| `POST /api/tasks/drafts/[id]/preview` | Gera a prévia com IA (NDJSON — 1ª fase) |
| `POST /api/tasks/drafts/[id]/estimate` | Estima as horas com IA e calcula o custo (NDJSON); `{ clientId? }` recalcula **só o custo** |
| `POST /api/tasks/drafts/[id]/approve` | Cria a tarefa conforme a prévia (corpo opcional `{ priority }`) |

## Tela `/tarefas` (`components/TasksPage.tsx`)

- Cabeçalho: título com total animado, "atualizado às HH:mm:ss", **Nova prévia**, **Nova tarefa**, **Kanban |
  Tabela** (`TaskViewSwitch`) e **Atualizar**. `TimerIndicator` e "Minhas horas" ao lado.
- **Nova tarefa**: navega para a página própria `/tarefas/nova` (sem repositório vinculado, o botão
  fica desabilitado — "Vincule um repositório em Integrações › GitHub").
- **Nova prévia**: botão `variant="outline"` à esquerda de **Nova tarefa** (ícone `Sparkles`) que
  abre `/tarefas/previa` — o fluxo de prévia por IA do portal do cliente, agora para o dono (ver
  "Prévia de tarefa (dono)"). Sem repositório vinculado, fica desabilitado como **Nova tarefa**.
- **Filtros** (`TaskFiltersBar`, sobre `ListFilters`): busca (código exato, senão título tolerante a
  erro com fuse.js), **Repositório**, **Coluna**, **Tags**, Prioridade, Tipo, Ordenar cards e Arquivadas. O
  filtro **Repositório** usa o **mesmo item da integração** (`GithubRepoLabel`: avatar real do GitHub
  + `owner/repo` + descrição + cadeado quando privado), restrito aos repositórios **vinculados**, e
  guarda o `projectId` — o sistema infere o projeto a partir do repositório escolhido. Sem o GitHub
  (integração ausente ou repositório fora do token), o avatar cai na inicial. "Limpar" zera os
  filtros, mantendo visão e ordenações.
- Filtros salvos no navegador (`usePersistentState`, chave `opex:tasks-filters:v1`,
  `taskFiltersSchema`); chips resumem os ativos (`activeTaskFilterChips`).
- **Kanban** (`TaskBoard`/`TaskColumn`/`TaskCard`, dnd-kit + Framer Motion): todas as colunas são
  editáveis (alça para arrastar, ícone, descrição em tooltip, contador `n/limite` com aviso de WIP,
  menu Editar / Mover para a esquerda/direita / Excluir). **"+"** entre colunas e **"Nova coluna"** no
  fim abrem `ColumnFormDialog`. Arrastar coluna reordena (otimista); arrastar card move entre colunas
  (o card entra durante o arraste) e, na ordenação Manual, reordena. Colunas virtualizadas acima de
  50 cards; o card mostra no cabeçalho o código e, no rodapé, o ícone de prioridade (só o ícone
  colorido, sem rótulo), a **estimativa real** de horas e, **com cliente**, o **faturamento estimado**
  (`EstimateBadge` — ver `modules/orcamentos.md`), o chip de tipo, as **tags** e "Arquivada"; o
  título, o resumo de IA e o repositório (`GithubRepoLabel`) ficam no corpo.
  O **resumo de IA** aparece como uma linha sob o título quando existir, **sem substituir** a
  descrição (ver `modules/ai.md`). Quando uma **mesa de trabalho** da tarefa aguarda o usuário
  (revisão do plano, prévia, PR, permissão/pergunta) ou falhou, o card mostra o **motivo**
  (`workbenchProgressTone`) como **link direto para a mesa** (`/desenvolvimento/[central]/[tarefa]`):
  clicar nele navega para a mesa que aguarda a interação e **não** abre a tarefa (ver
  `modules/agentic-dev.md`, "Trabalhos em andamento").
- **Tabela** (`TaskTable`): Código, Issue, Título (com a prévia do **resumo de IA**, as **tags** e a
  **estimativa real** de horas e, com cliente, o faturamento sob o título), Coluna ("Mover para…"), Prioridade,
  Tipo, Repositório, Atualizada; ordenação por coluna (salva); virtualizada acima de 50; rola com
  a página (`usePageVirtualizer`). Na célula do código, o **motivo de espera** de uma mesa é o
  mesmo **link para a mesa** do card do kanban.
- **Edição na linha** (tabela): prioridade (`TaskPriorityMenu`) aplica na hora (`useUpdateTask`,
  otimista, reverte com toast).
- Mudança de coluna (`useTaskMoveFlow` + `useMoveTask`): **otimista** em todas as listas e no
  detalhe; falha reverte e mostra toast.
- **Seleção e ações em lote** (`useTaskSelection` + `TaskBulkBar` + `useTaskBulkActions`): **Mover**,
  **Prioridade** e **Arquivar/Desarquivar**, com execução em pedaços de 4, progresso, reversão só
  das que falharam e "Desfazer por 8 s" (`useBulkTasks`, itens em `bulk-items.ts`).
- Tempo real: `useTasksRealtime` assina `tasks-updated` e `task-columns-updated` em `private-app`.

## Criar tarefa (`/tarefas/nova`, `components/TaskCreatePage.tsx` + `TaskForm.tsx`)

Formulário no estilo "nova issue do GitHub", em **página própria** (não é mais modal): título,
descrição em **campo Markdown** (`MarkdownField`: abas **Escrever / Visualizar** + barra com
**negrito**, itálico, cabeçalho, link, imagem, lista, citação e código) e os metadados em
**autocomplete com chips**
(`SearchPicker` + `FieldTrigger`): **Repositório** (`GithubRepoLabel`, só os vinculados), **Coluna**,
**Tipo** e **Prioridade**. A **especificação técnica saiu do formulário** (será gerada de forma agêntica; o
campo continua no modelo e na API). Schema do formulário: `taskFormSchema` (= `taskInputSchema` sem
`technicalSpec`). O mesmo `MarkdownField` é reusado no portal do cliente (`modules/orcamentos.md`).

O **Repositório** substitui o antigo campo "Projeto": o Projeto É o repositório vinculado, então a
escolha do repositório define o `projectId`. Ao salvar, a tarefa **cria a issue no repositório** e o
vínculo (`createTaskWithIssue`, `features/github/server/task-issue.ts`); **falha do GitHub bloqueia**
a criação (nenhuma tarefa é criada). O `TaskForm` também é usado na **edição inline** da página da
tarefa.

## Prévia de tarefa (dono) `/tarefas/previa`

O dono usa o **mesmo fluxo de prévia por IA do portal do cliente** (ver `modules/orcamentos.md`),
mas pelos endpoints internos (sessão, sem token de cliente):

- `/tarefas/previa` — formulário (`OwnerPreviewFormPage`): **Repositório** (só os vinculados, no
  `SearchPicker` com o `GithubRepoLabel` real) + **descrição** em Markdown (`MarkdownField`). Ao
  avançar, abre o rascunho e segue para a revisão.
- `/tarefas/previa/[draftId]` — revisão (`OwnerPreviewReviewPage`), espelhando a revisão do portal:
  prévia (título/resumo/descrição e especificação técnica), repositório, tipo + **prioridade
  editável**, tags, **clareza** e os cards de correção/aprovar. A diferença é o card de estimativa.
- **Estimativa com cliente opcional** (`PreviewEstimateCard`): a IA estima sempre as **horas reais
  (H)**; o **cliente** só define o custo. Sem cliente, o card mostra só as **horas estimadas**; com
  cliente, acrescenta o **prazo** (`H × fator`) e o **faturamento** (`prazo × custo/hora`). O seletor
  lista só clientes **ativos** cujo `projectIds` inclui o repositório do rascunho. Selecionar, trocar
  ou limpar o cliente **reestima apenas o custo** — reusa as horas e o modelo já gravados, sem nova
  chamada de IA.
- **Aprovar**: cria a tarefa real com issue no GitHub (como no app). **Sem cliente**, a tarefa nasce
  sem `clientId`, mas **preserva as horas reais** estimadas (snapshot neutro); **com cliente**, grava
  o cliente e o snapshot inflado. A prioridade escolhida na revisão sobrepõe a sugerida pela IA.
- Correção, clareza (bloqueia aprovar em "faltam informações") e prioridade funcionam igual ao
  portal; a correção regenera a prévia e **zera a estimativa**. O rascunho aprovado responde 409 a
  correção, estimativa e nova aprovação.
- O rascunho do dono tem `clientId: null` (não aparece no portal nem na lista de clientes) e pode
  guardar um `estimateClientId` — ver `modules/orcamentos.md`.

Servidor: `src/features/orcamentos/server/owner.ts` (criar/aprovar/reestimar) sobre os rascunhos
compartilhados de `server/drafts.ts`. No cliente: `src/features/tasks/preview/` (páginas, hooks e
`PreviewEstimateCard`) reusa a revisão compartilhada (`src/features/orcamentos/review.ts` +
`hooks/useDraftReview.ts`) e os cards de `src/features/orcamentos/components/preview/`.

## Página da tarefa `/tarefas/[id]` (`components/detail/`)

- Voltar, Atualizar, código, tipo, "Arquivada", título, **coluna com "Mover para…"** (`TaskColumnMenu`),
  **Entender tarefa**, **Refinar tarefa**, **Mesa de trabalho**, **Abrir issue**, **Editar** e
  **Excluir**. **Editar** abre o `TaskForm` **inline** no lugar das abas (não é mais modal);
  salvar/cancelar voltam à visão.
- Acima do card de conteúdo, o **Resumo (IA)** aparece em um **card próprio** (`TaskSummaryCard`,
ícone de sparkles + uma linha, fonte discreta, **sem rótulo**) — é **adicional** e **não substitui**
a descrição.
- Abas em uma linha rolável horizontalmente **sem barra de scroll vertical** (`TaskDetailTabs`),
animadas com `AnimatePresence`: **Descrição** (só a descrição em Markdown, **sem título próprio**),
  **Especificação técnica** (aba própria: a especificação atual em Markdown e, **abaixo**, o painel do
  refinamento com IA — ver `modules/refinement.md`), Comentários (lista + formulário; cada
  comentário mostra o **nome do autor** — dono ou cliente, ver `modules/orcamentos.md`), Histórico
(auditoria, mais recente primeiro) e Horas (apontamentos; "Em andamento"). Cada seção é um
componente próprio e a aba ativa é renderizada como **elemento** (não chamada como função), para
preservar o escopo de hooks de cada aba.
- Lateral: prioridade editável, tipo, **tags**, repositório (`GithubRepoLabel`), **cliente** (ver
  abaixo), **estimativa** (ver abaixo), horas apontadas, criada e atualizada.
- **Cliente** (`TaskClientCard`, coluna lateral): **adiciona**, **troca** ou **remove** o cliente da
  tarefa. O seletor lista só clientes **ativos** cujo `projectIds` inclui o repositório da tarefa;
  remover pede confirmação. Adicionar/trocar grava o `clientId` e **habilita o campo de estimativa**
  (`useSetTaskClient` → `PATCH /api/tasks/[id]/client`): o servidor recalcula o orçamento com o fator
  de lucro e o custo/hora do cliente escolhido, **preservando as horas** já estimadas (começando em
  **0** quando ainda não havia estimativa). Remover zera `clientId` e a inflação, **preservando as
  horas reais** na estimativa. Clientes são cadastrados **apenas** em Integrações › Orçamentos (o
  card traz o link no estado vazio).
- **Estimativa** (`TaskEstimateCard`, coluna lateral; **sempre visível**, com ou sem cliente): as
  **horas reais** (H) são **editáveis** (campo + **Salvar**, `useUpdateTaskEstimate`; salvar **cria**
  a estimativa quando a tarefa ainda não tinha) e podem ser **geradas por IA** pelo botão **Estimar
  com IA** / **Regerar com IA** (`useGenerateTaskEstimate` → `POST /api/tasks/[id]/estimate/generate`,
  que reusa "Estimar prazos" — ver `modules/ai.md`; o progresso e o erro aparecem no próprio card).
  **Com cliente**, o **prazo** (`H × fator`) e o **faturamento estimado** (`prazo × custo/hora`) são
  recalculados com o fator e o custo/hora **atuais** do cliente **da tarefa** (`resolveTaskClient`:
  o `clientId` gravado; `null` = sem cliente, **sem** inflação; só registros legados sem o campo caem
  no `OrcamentoClient` ativo do repositório) e animados com `AnimatedNumber`; mostra também o
  **cliente** (`estimateClientName`). **Sem cliente**, exibe só as horas reais. Salvar/gerar grava
  auditoria (`horasEstimadas`/`faturamentoEstimado`) e publica `tasks-updated`.
- Estados: esqueleto, **Tarefa não encontrada**, erro com tentar novamente.
- **Entender tarefa** (cabeçalho): modal com IA em streaming (ver `modules/ai.md`).
- **Refinar tarefa** (cabeçalho): abre a aba **Especificação técnica** e **inicia** o refinamento,
em que um agente do OpenCode faz perguntas (mesmo sistema da mesa) e **reescreve a especificação
técnica** da tarefa a cada rodada até ela ficar clara; o painel fica **abaixo da especificação**, com
as perguntas logo abaixo da saída do agente. O agente roda em segundo plano e o refinamento é
retomável. Bloqueado quando o projeto não tem uma central de desenvolvimento ativa
(ver `modules/refinement.md`).
- **Gerar resumo** (cabeçalho): modal com IA em streaming que grava o resumo de 1 linha da tarefa
  (ver `modules/ai.md`).
- **Mesa de trabalho** (cabeçalho): leva à mesa da tarefa na Central de desenvolvimento
  (`/desenvolvimento/[tarefa]`); bloqueado quando o projeto não tem central
  (ver `modules/agentic-dev.md`).

## Issue ↔ tarefa (GitHub)

Issues dos repositórios vinculados viram tarefas e vice-versa (ver `modules/github.md`). A tarefa
mostra o botão da issue (`#N`) no card, na coluna Issue da tabela e na página. O vínculo é
**bidirecional com last-write-wins**: editar título/descrição/tipo/prioridade/coluna empurra para a
issue na hora e a rotina puxa mudanças mais recentes da issue (a coluna ↔ aberta/fechada segue a
coluna de conclusão do vínculo). Mudanças vindas do GitHub entram no Histórico com origem GitHub.

## Testes

`__tests__/features/tasks/` (`tasks-logic`, `tasks-service`, `task-move-flow`, `tasks-bulk`,
`task-columns`, `task-filter-chips`, `TasksPage` — inclusive o botão **Nova prévia** —, `task-form`,
`task-card`, `task-column-header`,
`task-board-layout`, `task-table-scroll`, `task-detail-sections`, `task-detail-tabs`,
`task-summary-card`, `task-estimate-card`, `task-estimate-generate`, `task-client-card` — a
estimativa (sempre visível, edição manual e geração por IA na tarefa), o cliente da
tarefa (adicionar/trocar/remover e as validações) e o autor
dos comentários são cobertos em `tasks-service`; as **tags** têm testes próprios em
`__tests__/features/tasks/tags.test.ts`) e `__tests__/hooks/usePersistentState.test.tsx`. A **prévia
do dono** (formulário, revisão e o card de estimativa com cliente opcional) em
`__tests__/features/tasks/owner-preview.test.tsx`. O botão
**Refinar tarefa** é coberto em `__tests__/features/refinement/` (ver `modules/refinement.md`).
