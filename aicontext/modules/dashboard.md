# Módulo: Dashboards (`/dashboard`)

Página inicial dO Opex (`/` redireciona para `HOME_HREF = "/dashboard"`), **acima de "Tarefas"** no
menu. Reúne KPIs e gráficos de quatro blocos — **Visão geral de tarefas**, **Financeiro**, **Horas
agênticas** e **Central de desenvolvimento** — num **único período global** e atualizados em tempo
real pelo Pusher. Os **indicadores são somente leitura** (nenhuma escrita nem auditoria); o cabeçalho
traz **atalhos globais** de criação e o indicador **Trabalhos em andamento** (ver “Cabeçalho e
atalhos globais”).

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

## Cabeçalho e atalhos globais

O cabeçalho (`DashboardHeader`) reúne o título, o **período global** e o botão **Atualizar**, além de:

- **Trabalhos em andamento** (`TimerIndicator`, ver `modules/time.md`): as mesas executando ou
  aguardando ação humana; cada item abre a mesa de trabalho.
- **Nova prévia** e **Nova tarefa** (`TaskCreationActions`, ver `modules/tasks.md`): os mesmos atalhos
  da tela de Tarefas, nas páginas `/tarefas/previa` e `/tarefas/nova`; ficam desabilitados sem
  repositório vinculado.

O `DashboardHeader` é de **apresentação** (props `title`, `description`, `icon` e `actions`): o dono
injeta `TimerIndicator` + `TaskCreationActions` e o portal do cliente injeta só o seu **Nova prévia**
(ver “Dashboard do cliente”). A apresentação dos KPIs (`DashboardKpis`) também é compartilhada — o dono
monta os itens com `dashboardKpiItems(kpis)` e o portal com o recorte dele.

Os atalhos **independem do período** e continuam disponíveis durante o carregamento ou erro dos
indicadores. O período é um `OptionTabs` que **não quebra linha**: o grupo não encolhe (`shrink-0`) e
os rótulos usam `whitespace-nowrap`, para o grupo inteiro passar à linha seguinte sem "Mês atual"
quebrar em duas linhas. No **celular** (`< md`) a linha de ações empilha em **linhas inteiras**: o
indicador **Trabalhos em andamento** ocupa uma linha sozinho, **Nova prévia** e **Nova tarefa**
dividem uma linha inteira, o período ocupa a linha inteira e o botão **Atualizar** fica **oculto** (a
atualização continua pelo tempo real e pelo "Tentar novamente" em erro). O mesmo vale para o
**dashboard do cliente**: o botão único de criação e o período ocupam a linha inteira no celular.

O `layout.tsx` da rota monta `TimerProvider` e `WorkbenchProgressProvider` (somente leitura) para
alimentar o indicador — os mesmos contextos do layout de Tarefas.

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
`src/features/dashboard/components/**`, `src/app/(app)/dashboard/{page,layout}.tsx`,
`src/app/api/dashboard/route.ts`. Testes em `__tests__/features/dashboard/`.

## Dashboard do **cliente** (portal)

O portal tem um dashboard **próprio** (`/cliente/dashboard`, `GET /api/cliente/dashboard`) com a
**mesma apresentação** do dashboard do dono: reusa o `DashboardHeader` (título com ícone, atalho
**Nova prévia**, período global `OptionTabs` e Atualizar), a linha de KPIs (`DashboardKpis`) e os
gráficos de `components/charts/` (rosca por coluna, barras por tipo, barras ranqueadas por projeto e a
linha criadas × concluídas) — o cartão **Por tipo** conta as **tags** da tarefa, não o tipo. O período
usa as mesmas opções do dono (`period.ts`) com **chave própria** de persistência
(`opex:cliente:dashboard:period:v1`) e envia o fuso do navegador. O bloco de **custo** (custo por
repositório, evolução mensal e horas por repositório) só aparece para o **admin** do cliente. **Não**
inclui horas agênticas, custo de IA, mesas de trabalho nem faturas do dono (dados internos). Serviço em
`src/features/orcamentos/server/portal-dashboard.ts` (agregações puras em `portal-aggregate.ts`);
detalhes em `modules/orcamentos.md`.
