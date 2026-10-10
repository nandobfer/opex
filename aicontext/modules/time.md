# Módulo: Controle de horas (`/tarefas/horas`)

Apontamento de horas **local** — o Opex é a fonte de verdade. Iniciar, parar, editar e excluir
gravam em `time_logs`. Código em `src/features/time/`.

## Modelo e regras (`src/lib/db/models/TimeLog.ts`, `schemas.ts`)

- `TimeLog` (`time_logs`): `{ taskId, startTime, endTime, duration (minutos), description, active }`.
- **Um timer ativo por tarefa** (`active: true`); `duration` é gravada ao parar.
- Regras: nada no futuro (tolerância de 60 s), fim depois do início. **Sem justificativa.**

## Servidor (`src/features/time/server/service.ts`, `TIME_AUDIT_ENTITY = "Apontamento"`)

- `listActiveTimers`, `startTimer` (404 se a tarefa não existe; 409 `TIMER_RUNNING` se já há timer),
  `stopTimer` (início/fim/descrição opcionais), `listTimeLogs` (filtra por `startTime`, 100 por
  página, `totalMinutes` do período), `updateTimeLog` (`kind: "description"` ou `"period"`),
  `deleteTimeLog`.
- O `taskCode`/`taskTitle` do apontamento vêm das tarefas locais.
- Auditoria (`CRIAR`/`ATUALIZAR`/`EXCLUIR`) e evento Pusher `time-updated { taskIds }` no canal
  `private-app`.

| Rota do app | Descrição |
|---|---|
| `GET /api/time/active` | `TimeLogDto[]` |
| `POST /api/time/start` | `startTimerSchema` `{ taskId }` |
| `POST /api/time/[id]/stop` | `stopTimerSchema` `{ description?, startTime?, endTime? }` |
| `GET /api/time/logs?from&to&page` | `TimeLogPageDto` (`from`/`to` ISO) |
| `PATCH /api/time/[id]` | `updateTimeLogSchema`: `{ kind: "description", description }` ou `{ kind: "period", startTime, endTime }` |
| `DELETE /api/time/[id]` | Exclui o apontamento |

## Tela

- `TimerProvider` (em `src/app/(app)/tarefas/layout.tsx`): timers ativos, iniciar/parar e o único
  modal "Parar timer" para Tarefas, página da tarefa e Minhas horas. `useTimer()` fora do provider
  devolve `null` (os botões não aparecem).
- **Um timer por vez**: iniciar com outro rodando abre o modal de parar o atual ("Parar e
  iniciar"); ao confirmar, para e inicia o novo.
- `TimerButton` (▶/⏸): no card (rodapé), na linha da tabela (coluna antes do código) e na página da
  tarefa ("Iniciar trabalho"/"Parar"). Iniciar é otimista; parar abre o modal.
- Tarefa em andamento: card com borda e brilho verde pulsando + cronômetro ao vivo; linha da tabela
  com fundo verde, faixa à esquerda e cronômetro sob o código.
- `StopTimerDialog`: tempo decorrido ao vivo e tarefa, "Ajustar horários" (início/fim,
  `datetime-local`, fim pré-preenchido com agora) e descrição opcional; react-hook-form +
  `stopTimerFormSchema`.
- `TimerIndicator`: no topo de Tarefas, da página da tarefa e de Minhas horas — ícone girando +
  cronômetro; clique abre o modal de parar.

## Minhas horas (`/tarefas/horas`, item próprio no menu)

- Período na URL (`from`/`to`, padrão: última semana) com `PresetDateRangeFilter`; total do período
  e quantidade de apontamentos (números animados).
- Apontamentos agrupados por dia (`groupTimeLogsByDay`, mais recente primeiro, total do dia),
  "Carregar mais" (páginas de 100).
- Cada apontamento (`TimeLogItem`): código (link para a tarefa), título, início–fim, duração; ativo
  com cronômetro e **Parar**. Ações: editar descrição na linha, **Editar período** e **Excluir**
  (desabilitados no timer ativo).
- Estados: carregando, vazio e erro.

## Testes

`__tests__/features/time/time-service.test.ts` e `time-ui.test.tsx`.
