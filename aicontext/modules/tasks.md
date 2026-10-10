# Módulo: Tarefas (`/tarefas`)

Página inicial do app (`/` redireciona para `HOME_HREF = "/tarefas"`). O Opex é a **fonte de
verdade** das tarefas: cria, edita, exclui, organiza em **kanban** ou **tabela** e aponta horas. Não
há plataforma externa — nada aqui espelha outro sistema.

As colunas do quadro são **100% configuráveis** (criar, editar, reordenar, excluir); cada tarefa
pertence a **uma** coluna. Não existem regras automáticas de transição.

## Modelo (`src/lib/db/models/`)

- `DevTask` (`dev_tasks`): `{ code, projectId, columnId, order, title, description, technicalSpec,
  taskType, priority, archived }`. `code` = `{SIGLA}-{n}` (sequencial por projeto, via `taskSeq` do
  projeto com `$inc`).
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
  Toda mutação grava auditoria e publica `tasks-updated { ids }` no canal `private-app`.
- `columns.ts` (`COLUMN_AUDIT_ENTITY = "ColunaTarefas"`): `ensureBoard` (semeia o quadro padrão —
  A Fazer / Em Andamento / Concluído — na primeira execução), `getBoard`, `createColumn`,
  `updateColumn`, `deleteColumn` (só vazia e que não seja coluna de entrada de um projeto),
  `reorderColumns` (409 `COLUMNS_CHANGED` se a ordem não bate). Publica `task-columns-updated`.

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
- **Nova tarefa** (`TaskFormDialog`, react-hook-form + Zod `taskInputSchema`): título, projeto,
  coluna, tipo, prioridade, descrição e especificação técnica (Markdown). Editar/excluir ficam na
  página da tarefa. Sem projeto vinculado, o botão fica desabilitado ("Vincule um repositório em
  Integrações › GitHub").
- **Filtros** (`TaskFiltersBar`, sobre `ListFilters`): busca (código exato, senão título tolerante a
  erro com fuse.js), **Projeto**, **Coluna**, Prioridade, Tipo, Ordenar cards e Arquivadas. "Limpar"
  zera os filtros, mantendo visão e ordenações.
- Filtros salvos no navegador (`usePersistentState`, chave `opex:tasks-filters:v1`,
  `taskFiltersSchema`); chips resumem os ativos (`activeTaskFilterChips`).
- **Kanban** (`TaskBoard`/`TaskColumn`/`TaskCard`, dnd-kit + Framer Motion): todas as colunas são
  editáveis (alça para arrastar, ícone, descrição em tooltip, contador `n/limite` com aviso de WIP,
  menu Editar / Mover para a esquerda/direita / Excluir). **"+"** entre colunas e **"Nova coluna"** no
  fim abrem `ColumnFormDialog`. Arrastar coluna reordena (otimista); arrastar card move entre colunas
  (o card entra durante o arraste) e, na ordenação Manual, reordena. Colunas virtualizadas acima de
  50 cards; cards com código, tipo, título, projeto, prioridade e "Arquivada".
- **Tabela** (`TaskTable`): Código, Issue, Título, Coluna ("Mover para…"), Prioridade, Tipo, Projeto,
  Atualizada; ordenação por coluna (salva); virtualizada acima de 50; rola com a página
  (`usePageVirtualizer`).
- **Edição na linha** (tabela): prioridade (`TaskPriorityMenu`) aplica na hora (`useUpdateTask`,
  otimista, reverte com toast).
- Mudança de coluna (`useTaskMoveFlow` + `useMoveTask`): **otimista** em todas as listas e no
  detalhe; falha reverte e mostra toast.
- **Seleção e ações em lote** (`useTaskSelection` + `TaskBulkBar` + `useTaskBulkActions`): **Mover**,
  **Prioridade** e **Arquivar/Desarquivar**, com execução em pedaços de 4, progresso, reversão só
  das que falharam e "Desfazer por 8 s" (`useBulkTasks`, itens em `bulk-items.ts`).
- Tempo real: `useTasksRealtime` assina `tasks-updated` e `task-columns-updated` em `private-app`.

## Página da tarefa `/tarefas/[id]` (`components/detail/`)

- Voltar, Atualizar, código, tipo, "Arquivada", título, **coluna com "Mover para…"** (`TaskColumnMenu`),
  **Entender tarefa**, **Mesa de trabalho**, **Abrir issue**, **Editar** e **Excluir**.
- Abas animadas: Descrição (descrição + especificação técnica em Markdown), Comentários (lista +
  formulário), Histórico (auditoria, mais recente primeiro), Horas (apontamentos; "Em andamento").
- Lateral: prioridade editável, tipo, projeto, horas apontadas, criada e atualizada.
- Estados: esqueleto, **Tarefa não encontrada**, erro com tentar novamente.
- **Entender tarefa** (cabeçalho): modal com IA em streaming (ver `modules/ai.md`).
- **Mesa de trabalho** (cabeçalho): leva à mesa da tarefa na Central de desenvolvimento
  (`/desenvolvimento/[central]/[tarefa]`); bloqueado quando o projeto não tem central
  (ver `modules/agentic-dev.md`).

## Issue ↔ tarefa (GitHub)

Issues dos repositórios vinculados viram tarefas (ver `modules/github.md`). A tarefa mostra o botão
da issue (`#N`) no card, na coluna Issue da tabela e na página. O vínculo é **informativo** (dedupe
da sincronização + "Abrir issue"); a coluna da tarefa é sempre gerida por você.

## Testes

`__tests__/features/tasks/` (`tasks-logic`, `tasks-service`, `task-move-flow`, `tasks-bulk`,
`task-columns`, `task-filter-chips`, `TasksPage`, `task-card`, `task-column-header`,
`task-board-layout`, `task-table-scroll`) e `__tests__/hooks/usePersistentState.test.tsx`.
