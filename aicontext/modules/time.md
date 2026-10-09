# Módulo: Controle de horas (timers do Go! Sipal)

Espelha o apontamento de horas do Centro de Desenvolvimento do Go! Sipal. **Nada é salvo no
Opex**: iniciar, parar, editar e excluir acontecem direto na plataforma, pela sessão da
integração `go_sipal` (`modules/go-sipal.md`). Código em `src/features/time/`.

## Contrato usado (conferido em `~/code/sap-painel-lancamento`)

| Rota do Go! Sipal | Uso |
|---|---|
| `GET /api/dev-center/time-logs/active` | Timers ativos do usuário (`task` populada só com título e produto) |
| `POST /api/dev-center/time-logs` `{ taskId, elementType: "devTask" }` | Iniciar. **Um timer ativo por tarefa** (senão 400 "Já existe um timer ativo para este item") |
| `PUT /api/dev-center/time-logs/[id]` `{ stop: true, description?, startTime?, endTime? }` | Parar (nada no futuro; fim depois do início) |
| `GET /api/dev-center/time-logs?startDate&endDate&page&limit` | Meus apontamentos (filtra pelo início; até 100 por página; `summary.totalMinutes`) |
| `PUT /api/dev-center/time-logs/[id]` `{ description }` ou `{ startTime, endTime, justification }` | Editar (justificativa obrigatória para horários; timesheet aprovado → 409) |
| `DELETE /api/dev-center/time-logs/[id]` `{ justification }` | Excluir (justificativa obrigatória; timer ativo não pode) |

O Go! Sipal não devolve o código da tarefa nos apontamentos: o servidor completa `taskCode` pelo
quadro (`taskCodes()`, cache em memória de 2 min).

## Servidor

- `server/service.ts`: `listActiveTimers`, `startTimer`, `stopTimer`, `listTimeLogs`,
  `updateTimeLog`, `deleteTimeLog`, `toTimeLogDto`. Erros pelo mesmo mapeamento das tarefas
  (`toTaskDomainError`: sem sessão → 401 `GO_SIPAL_SESSION`; recusa → 400 com a mensagem da
  plataforma). Auditoria `ApontamentoGoSipal` (`CRIAR` ao iniciar, `ATUALIZAR` ao parar/editar,
  `EXCLUIR`) e evento Pusher `time-updated { taskIds }` no canal `private-app`.
- A rotina "Sincronizar tarefas do Go! Sipal" (`tasks/server/sync.ts`) também lê os timers ativos
  (documento `timers` em `go_sipal_task_snapshots`: id do apontamento → tarefa) e publica
  `time-updated` quando um timer é iniciado/parado direto no go.sipal. Falha nos timers não
  derruba a sincronização do quadro.

| Rota do app | Descrição |
|---|---|
| `GET /api/time/active` | `TimeLogDto[]` |
| `POST /api/time/start` | `startTimerSchema` `{ taskId }` |
| `POST /api/time/[id]/stop` | `stopTimerSchema` `{ description?, startTime?, endTime?, taskCode? }` |
| `GET /api/time/logs?from&to&page` | `TimeLogPageDto` (`from`/`to` ISO) |
| `PATCH /api/time/[id]` | `updateTimeLogSchema`: `{ kind: "description", description }` ou `{ kind: "period", startTime, endTime, justification }` |
| `DELETE /api/time/[id]` | `{ justification }` |

## Tela

- `TimerProvider` (em `src/app/(app)/tarefas/layout.tsx`): timers ativos, iniciar/parar e o único
  modal "Parar timer" para Tarefas, página da tarefa e Minhas horas. `useTimer()` fora do provider
  devolve `null` (os botões não aparecem).
- **Um timer por vez**: iniciar com outro rodando abre o modal de parar o atual ("Parar e
  iniciar"); ao confirmar, para e inicia o novo. Vários ativos só se iniciados no go.sipal — o
  indicador do topo lista para escolher qual parar.
- `TimerButton` (▶/⏸): no card (rodapé), na linha da tabela (coluna antes do código) e na página da
  tarefa ("Iniciar trabalho"/"Parar"). Iniciar é otimista (o timer aparece na hora; volta com toast
  se o Go! Sipal recusar); parar abre o modal. Não propaga clique/ponteiro (não abre a tarefa nem
  arrasta).
- Tarefa em andamento: card com borda e brilho verde pulsando + cronômetro ao vivo; linha da tabela
  com fundo verde, faixa à esquerda e cronômetro sob o código.
- `StopTimerDialog` (igual ao Go! Sipal): tempo decorrido ao vivo e tarefa, "Ajustar horários"
  (início/fim, `datetime-local`, fim pré-preenchido com agora) e descrição opcional; react-hook-form
  + `stopTimerFormSchema`; erro da plataforma no próprio modal.
- `TimerIndicator`: no topo de Tarefas, da página da tarefa e de Minhas horas — ícone girando +
  cronômetro; clique abre o modal de parar.
- Topo de Tarefas: `[indicador] [Minhas horas] [Kanban | Tabela] [Atualizar]`.
- Horas totais por tarefa **não** aparecem no card/tabela (a lista do Go! Sipal não traz; a aba
  Horas da página da tarefa mostra os apontamentos de todos).

## Minhas horas (`/tarefas/horas`, item próprio no menu)

- Período na URL (`from`/`to`, padrão: última semana) com `PresetDateRangeFilter`; total do período
  e quantidade de apontamentos (números animados).
- Apontamentos agrupados por dia (`groupTimeLogsByDay`, mais recente primeiro, total do dia),
  "Carregar mais" (páginas de 100).
- Cada apontamento (`TimeLogItem`): código (link para a tarefa), título, produto, início–fim,
  duração; ativo com cronômetro e **Parar**. Ações: editar descrição na linha, **Editar período**
  (`EditPeriodDialog`, justificativa obrigatória) e **Excluir** (`DeleteTimeLogDialog`,
  justificativa obrigatória; desabilitados no timer ativo).
- Estados: sem sessão, carregando, vazio e erro.

## Testes

`__tests__/features/time/time-service.test.ts` (contrato com a plataforma simulada, sincronização
de timers) e `time-ui.test.tsx` (botão, um timer por vez, modal, indicador, agrupamento, item).
