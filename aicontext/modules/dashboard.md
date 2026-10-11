# Módulo: Dashboards (`/dashboard`)

Página inicial dO Opex (`/` redireciona para `HOME_HREF = "/dashboard"`), **acima de "Tarefas"** no
menu. Reúne KPIs e gráficos de quatro blocos — **Visão geral de tarefas**, **Financeiro**, **Horas
agênticas** e **Central de desenvolvimento** — num **único período global** e atualizados em tempo
real pelo Pusher. **Somente leitura**: nenhuma escrita nem auditoria.

## Endpoint `GET /api/dashboard`

- Query (Zod `dashboardQuerySchema`): `from?`/`to?` (ISO) e `timeZone?` (IANA). O **cliente** calcula
  o intervalo do período e envia; sem parâmetros o servidor assume os **últimos 30 dias** e o fuso
  **UTC**. Fuso inválido → 400. Intervalo invertido → `DomainError` 400 (`INVALID_RANGE`).
- Resposta: `ApiResponse<DashboardDto>` (ver `src/features/dashboard/types.ts`). O servidor sempre
  devolve `range` resolvido (ISO).
- Serviço `buildDashboard` (`server/service.ts`): `dbConnect()` + consultas de leitura
  (`DevTask`, `TaskBoardColumn`/`TaskBoardLayout`, `Project`, `AuditLog`, `TimeLog`,
  `AgenticCentral`/`AgenticWorkbench`) e reuso do **serviço Financeiro**
  (`listFinanceByClient`). As agregações puras ficam em `logic.ts` (testáveis sem banco).

## Regras de agregação

- **Conclusão de tarefa**: colunas de conclusão via `concludedColumnKeys()` e data derivada da
  auditoria (`completionTimestamps`, `MOVER`/`ATUALIZAR`) — a mesma regra do Financeiro.
  `tasksCompleted` e o `completed` da série usam essa data.
- **Tarefas**: `tasksActive` = não arquivadas; `tasksInProgress` = não arquivadas **fora** das
  colunas de conclusão; distribuições por coluna (rótulo/cor do quadro), tipo (`null` → "Sem tipo") e
  projeto (`null`/removido → "Projeto removido"). Criadas usam `createdAt`.
- **Financeiro**: faturamento é o **snapshot** `estimate.billingBrl`; `financeByClient` e os KPIs vêm
  dos grupos do serviço Financeiro (cliente removido preservado). `financeTimeline` é **mensal**.
- **Horas agênticas**: `TimeLog` com `startTime` no período; soma `duration` (minutos consolidados) e
  `costUsd`; agrupa por dia/semana, por projeto (via `taskId → projectId`), por etapa
  (`WORKBENCH_STAGE_LABELS`) e por modelo. Custo em **USD** (sem conversão cambial).
- **Central de desenvolvimento**: `activeWorkbenches` = mesas com `stage != "done"`;
  `runningWorkbenches` = ativas com `runState === "running"`; funil por `WORKBENCH_STEPS` (Plano →
  Implementação → Prévia → PR → Concluída). Distribuição e **custo acumulado** das mesas
  (`usage.costUsd`) são **instantâneos** — não filtram pelo período.
- **Custo por projeto aparece só em Horas agênticas** (TimeLog no período), evitando a sobreposição
  com o custo acumulado das mesas da Central.

## Período global (cliente)

- `useDashboardPeriod`: opção **7 / 30 / 90 dias** ou **mês atual** (padrão 30 dias), persistida com
  `usePersistentState` (`opex:dashboard:period:v1` + Zod). As datas ISO são recalculadas a cada
  render para não envelhecerem.
- Buckets: **dia** quando o intervalo ≤ 31 dias, **semana** (segunda a domingo) acima; Financeiro
  sempre **mensal**. O **fuso do navegador** (`Intl…timeZone`) é enviado ao servidor para a virada de
  dia/semana. Buckets sem eventos entram como zero.

## Tempo real

`useDashboardRealtime()` assina `private-app` e invalida a consulta em `tasks-updated`,
`task-columns-updated`, `time-updated`, `agentic-updated` e `orcamentos-updated`. Nenhum evento ou
`publishAppEvent` novo — o servidor já publica nesses pontos.

## Gráficos

Base do shadcn (`src/components/ui/chart.tsx`) com componentes da feature em
`components/charts/` (`BarsChart`, `TrendLineChart`, `DonutChart`, `RankedBarsCard`, `ChartCard`,
`ChartDataTable`, `EmptyChart`, `useChartAnimation`, `palette`). Cores só por `var(--chart-n)` e
`var(--color-*-400)`; cada gráfico tem `role="img"` + `aria-label` e uma **tabela oculta**
(`ChartDataTable`, linhas `data-barra`) com os mesmos números. A animação das séries usa a do
recharts, desligada com movimento reduzido.

## Arquivos

`src/features/dashboard/{types,schemas,period,logic,format}.ts`,
`src/features/dashboard/server/service.ts`, `src/features/dashboard/hooks/{useDashboard,useDashboardPeriod}.ts`,
`src/features/dashboard/components/**`, `src/app/(app)/dashboard/page.tsx`,
`src/app/api/dashboard/route.ts`. Testes em `__tests__/features/dashboard/`.
