# Módulo: Tarefas (`/tarefas`)

Página inicial do app (`/` redireciona para `HOME_HREF = "/tarefas"`). O Opex é a **fonte de
verdade** das tarefas: cria, edita, exclui, organiza em **kanban** ou **tabela** e aponta horas. Não
há plataforma externa — nada aqui espelha outro sistema.

As colunas do quadro são **100% configuráveis** (criar, editar, reordenar, excluir); cada tarefa
pertence a **uma** coluna. Não existem regras automáticas de transição — exceto a **coluna da fila**
de uma central de desenvolvimento: o card que entra nela pode abrir a mesa da tarefa automaticamente
(ver `modules/agentic-dev.md`).

## Modelo (`src/lib/db/models/`)

- `DevTask` (`dev_tasks`): `{ code, projectId, columnId, order, title, description, technicalSpec,
  taskType, priority, archived, summary, summarySourceHash, summaryUpdatedAt, estimate }`. `code` =
  `{SIGLA}-{n}` (sequencial por projeto, via `taskSeq` do projeto com `$inc`). `summary` é o resumo
  de 1 linha gerado por IA e `summarySourceHash` é o hash de título+descrição usado nele (detecta
  desatualização) — ver `modules/ai.md`. `estimate` é o orçamento vindo do portal do cliente
  (`null` fora dele) — ver `modules/orcamentos.md`.
- `TaskComment` (`task_comments`): `{ taskId, content, createdAt }`.
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

## Servidor (`src/features/tasks/server/`)

- `service.ts` (`TASK_AUDIT_ENTITY = "Tarefa"`): `listTasks(includeArchived)` (junta projeto e issue),
  `getTask` (detalhe com comentários, histórico e horas), `getTaskOptions` (projetos), `createTask`
  (gera o código, vai para o fim da coluna), `updateTask` (campos; mudar de coluna leva ao fim dela),
  `moveTask` (coluna + ordem), `setTaskArchived`, `deleteTask` (apaga comentários e apontamentos),
  `addComment`, `runBulkTasks` (cada item com a própria ação, 4 em paralelo, um `tasks-updated`).
  Toda mutação grava auditoria e publica `tasks-updated { ids }` no canal `private-app`. Mudanças de
  coluna também avisam o desenvolvimento agêntico (a tarefa pode entrar na fila de uma central).
  `concludedColumnKeys` devolve as colunas de conclusão dos vínculos (usado pelos resumos de IA).
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
| `PATCH /api/tasks/[id]` | `updateTaskSchema` (parcial) |
| `DELETE /api/tasks/[id]` | Exclui a tarefa |
| `POST /api/tasks/[id]/move` | `moveTaskSchema` (`targetColumn`, `order?`) |
| `POST /api/tasks/[id]/comments` | `{ content }` |
| `POST /api/tasks/bulk` | `bulkTasksSchema`: ações `move` / `priority` / `archive` |
| `GET /api/tasks/options` | Projetos |
| `GET/POST /api/tasks/columns` · `PATCH/DELETE /api/tasks/columns/[key]` · `PUT /api/tasks/columns/order` | Colunas |

## Tela `/tarefas` (`components/TasksPage.tsx`)

- Cabeçalho: título com total animado, "atualizado às HH:mm:ss", **Nova tarefa**, **Kanban |
  Tabela** (`TaskViewSwitch`) e **Atualizar**. `TimerIndicator` e "Minhas horas" ao lado.
- **Nova tarefa**: navega para a página própria `/tarefas/nova` (sem repositório vinculado, o botão
  fica desabilitado — "Vincule um repositório em Integrações › GitHub").
- **Filtros** (`TaskFiltersBar`, sobre `ListFilters`): busca (código exato, senão título tolerante a
  erro com fuse.js), **Repositório**, **Coluna**, Prioridade, Tipo, Ordenar cards e Arquivadas. O
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
  colorido, sem rótulo), a **estimativa real** de horas (`EstimateBadge`, quando a tarefa veio do
  portal — ver `modules/orcamentos.md`), o chip de tipo e "Arquivada"; o título, o resumo de IA e o
  repositório (`GithubRepoLabel`) ficam no corpo.
  O **resumo de IA** aparece como uma linha sob o título quando existir, **sem substituir** a
  descrição (ver `modules/ai.md`).
- **Tabela** (`TaskTable`): Código, Issue, Título (com a prévia do **resumo de IA** e a
  **estimativa real** de horas sob o título), Coluna ("Mover para…"), Prioridade, Tipo,
  Repositório, Atualizada; ordenação por coluna (salva); virtualizada acima de 50; rola com a página
  (`usePageVirtualizer`).
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

## Página da tarefa `/tarefas/[id]` (`components/detail/`)

- Voltar, Atualizar, código, tipo, "Arquivada", título, **coluna com "Mover para…"** (`TaskColumnMenu`),
  **Entender tarefa**, **Mesa de trabalho**, **Abrir issue**, **Editar** e **Excluir**. **Editar**
  abre o `TaskForm` **inline** no lugar das abas (não é mais modal); salvar/cancelar voltam à visão.
- Acima do card de conteúdo, o **Resumo (IA)** aparece em um **card próprio** (`TaskSummaryCard`,
  fonte discreta) — é **adicional** e **não substitui** a descrição.
- Abas animadas: Descrição (descrição + especificação técnica em Markdown), Comentários (lista +
  formulário), Histórico (auditoria, mais recente primeiro), Horas (apontamentos; "Em andamento").
- Lateral: prioridade editável, tipo, repositório (`GithubRepoLabel`), horas apontadas, criada e atualizada.
- Estados: esqueleto, **Tarefa não encontrada**, erro com tentar novamente.
- **Entender tarefa** (cabeçalho): modal com IA em streaming (ver `modules/ai.md`).
- **Gerar resumo** (cabeçalho): modal com IA em streaming que grava o resumo de 1 linha da tarefa
  (ver `modules/ai.md`).
- **Mesa de trabalho** (cabeçalho): leva à mesa da tarefa na Central de desenvolvimento
  (`/desenvolvimento/[central]/[tarefa]`); bloqueado quando o projeto não tem central
  (ver `modules/agentic-dev.md`).

## Issue ↔ tarefa (GitHub)

Issues dos repositórios vinculados viram tarefas e vice-versa (ver `modules/github.md`). A tarefa
mostra o botão da issue (`#N`) no card, na coluna Issue da tabela e na página. O vínculo é
**bidirecional com last-write-wins**: editar título/descrição/tipo/prioridade/coluna empurra para a
issue na hora e a rotina puxa mudanças mais recentes da issue (a coluna ↔ aberta/fechada segue a
coluna de conclusão do vínculo). Mudanças vindas do GitHub entram no Histórico com origem GitHub.

## Testes

`__tests__/features/tasks/` (`tasks-logic`, `tasks-service`, `task-move-flow`, `tasks-bulk`,
`task-columns`, `task-filter-chips`, `TasksPage`, `task-form`, `task-card`, `task-column-header`,
`task-board-layout`, `task-table-scroll`) e `__tests__/hooks/usePersistentState.test.tsx`.
