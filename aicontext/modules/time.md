# Módulo: Controle de horas agêntico (`/tarefas/horas`)

O controle de horas dO Opex é **agêntico**: cada apontamento é um **período de trabalho de uma mesa
de desenvolvimento** (não há timer manual). Quem abre/fecha os períodos é o servidor, a partir do
estado da mesa; a interação humana com o timer e com as horas é **somente leitura**. O Opex é a
fonte de verdade; os dados ficam em `time_logs`. Código em `src/features/time/`.

## Modelo e regras (`src/lib/db/models/TimeLog.ts`)

- `TimeLog` (`time_logs`): `{ taskId, workbenchId, stage, agent, model, startTime, endTime,
  duration (minutos), costUsd, inputTokens, outputTokens, reasoningTokens, description, active }`.
- Um período é um **intervalo contínuo em que o agente esteve trabalhando**, independentemente da
  etapa; a `description` nasce como "Desenvolvimento agêntico · {Etapa}".
- **Um período ativo por mesa**; como várias mesas podem rodar juntas, **há vários períodos ativos ao
  mesmo tempo** (não existe mais "um timer por vez" nem "um por tarefa").
- O período guarda a etapa e o **agente/modelo** vigentes e acumula **tokens e custo** (de
  `session.step.ended`). Se a execução encadear dois turnos sem pausa (implementação → build), o
  período é um só, com a etapa/agente/modelo do turno mais recente.

### Quando o período abre, pausa e fecha

Regra única: o agente está **executando** quando `runState === "running"` **e** não há
permissão/pergunta pendente (`pendingPermissions`/`pendingForms` vazios).

| Estado da mesa | Timer |
|---|---|
| `running` e sem permissão/pergunta pendente | **ativo** (período aberto) |
| `running` aguardando permissão/pergunta do OpenCode | **pausado** |
| `idle` (`plan_review`, `preview`, `pr_open`, `changes_requested`, `done`) | **pausado** |
| `failed` / `interrupted` | **pausado** |
| `done` (mesa concluída) | **parado em definitivo** |

## Servidor (`src/features/time/server/service.ts`, `TIME_AUDIT_ENTITY = "Apontamento"`)

Só o servidor escreve. Funções usadas pela mesa (não há rotas de escrita):

- `beginWorkPeriod` — abre o período da mesa (idempotente por `workbenchId`; 404 se a tarefa não
  existe).
- `touchWorkPeriod` — atualiza etapa/agente/modelo do período aberto (encadeamento de turnos).
- `accumulateWorkPeriodUsage` — soma tokens/custo no período ativo (a cada passo do agente).
- `endWorkPeriod` / `endWorkPeriodById` — fecham o período (pausa ou conclusão).
- `listActiveWorkPeriods` — referências dos períodos ativos (limpeza de órfãos).
- `listActiveTimers`, `listTimeLogs` — leitura (100 por página; `totalMinutes` e `totalCostUsd` do
  período).
- O `taskCode`/`taskTitle` vêm das tarefas locais. Auditoria (`CRIAR`/`ATUALIZAR`) e evento Pusher
  `time-updated { taskIds }` no canal `private-app` (ao abrir/fechar, não a cada passo).

| Rota do app (somente leitura) | Descrição |
|---|---|
| `GET /api/time/active` | `TimeLogDto[]` |
| `GET /api/time/logs?from&to&page` | `TimeLogPageDto` (`from`/`to` ISO) |

## Integração com a mesa (`src/features/agentic/server/timer-sync.ts`)

- `syncWorkbenchTimer(workbenchId)` lê a mesa, resolve etapa/agente/modelo (`resolveAgent`) e
  **concilia** o período (abre, atualiza ou fecha). É idempotente e tolerante a falhas (nunca derruba
  o fluxo da mesa). Chamada em toda transição de estado da mesa (`update`/`reconcile`) e nas
  permissões/perguntas (`onPermission`/`onForm` e respectivas respostas).
- `closeOrphanWorkPeriods()` fecha apontamentos legados sem mesa e mesas que não estão mais
  executando neste processo (o app reiniciou no meio da etapa); roda no início da rotina
  `agentic-pr-watch`.
- A central **não** tem mais as opções `timers.start`/`timers.stopOnDone`: o ciclo
  iniciar/pausar/retomar/parar é sempre automático.

## Tela (somente leitura)

- `TimerProvider` (em `src/app/(app)/tarefas/layout.tsx`): expõe os períodos ativos (`active`,
  `timerOf`) e o tempo real; **não** tem mais iniciar/parar. `useTimer()` fora do provider devolve
  `null`.
- `WorkbenchProgressProvider` (mesmo layout, do desenvolvimento agêntico) compartilha as **mesas em
  andamento**: executando (período ativo) ou pausadas aguardando ação humana. É a fonte do destaque
  das tarefas e da lista de trabalhos em andamento.
- Tarefa em andamento (agente executando): card com borda e brilho verde pulsando + cronômetro ao
  vivo; linha da tabela com fundo verde, faixa à esquerda e cronômetro sob o código. Não há mais
  botão ▶/⏸.
- Tarefa cuja mesa **aguarda ação** (revisão do plano, aprovação da prévia, PR, permissão/pergunta,
  falha ou interrupção): card e linha destacados em **warning** (`--color-warning`; `failed` em
  destructive) com o motivo em pt-BR; a linha também ganha faixa à esquerda.
- `TimerIndicator`: no topo de Tarefas, da página da tarefa e de Horas agênticas — ícone girando +
  cronômetro quando algum agente executa, ou aviso em warning quando **só** há mesas aguardando ação.
  Clique abre a lista **"Trabalhos em andamento"**: cada item é um botão que navega para a **mesa de
  trabalho** (`/desenvolvimento/{central}/{tarefa}`) — ou para a tarefa, em apontamentos legados sem
  mesa. As mesas pausadas **não** somem da lista.

## Horas agênticas (`/tarefas/horas`, item próprio no menu)

- Período na URL (`from`/`to`, padrão: última semana) com `PresetDateRangeFilter`; totais do período
  (tempo, quantidade e custo) em números animados.
- **Agrupamento em dois níveis: dia → task/mesa → itens.** As seções de dia (`groupTimeLogsByDay`,
  mais recente primeiro, total do dia) contêm **grupos por task/mesa** (`groupTimeLogsByTask`, que
  agrupa pelo `taskId`; como há uma mesa por tarefa, o grupo representa a task/mesa — apontamentos
  legados sem mesa caem no mesmo grupo pelo `taskId`). Dentro do grupo, os apontamentos ficam em
  ordem de início mais recente primeiro.
- Cada grupo é **expansível** (`TimeLogTaskGroup`): o cabeçalho (botão com `aria-expanded`) mostra
  código, título, a contagem de apontamentos e o total de minutos do grupo naquele dia, além de um
  indicador "Em execução" quando contém período ativo. O grupo **começa recolhido**; grupos com
  período ativo ficam **sempre abertos**. A abertura/fechamento é animada por Framer Motion
  (altura/opacidade) respeitando movimento reduzido.
- "Carregar mais" (páginas de 100).
- Cada apontamento (`TimeLogItem`, **somente leitura**): código (link para a tarefa), título,
  descrição, início–fim, duração (ou cronômetro ao vivo) e o **uso** (agente, modelo, tokens e
  custo). Sem editar/excluir/parar.
- Estados: carregando, vazio e erro.

## Página da tarefa

- Aba **Horas**: apontamentos da tarefa em modo leitura, com etapa/uso (agente, modelo, tokens,
  custo). Resumo mostra as horas apontadas.

## Testes

`__tests__/features/time/time-service.test.ts`, `time-ui.test.tsx`,
`__tests__/features/agentic/timer-sync.test.ts` e
`__tests__/features/agentic/workbench-progress.test.tsx`.
