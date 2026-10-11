# Módulo: Financeiro (`/financeiro`)

Visão de **faturamento das tarefas concluídas, agrupadas por cliente**, por período. Item próprio no
menu (seção "início", ícone `Banknote`, logo após "Horas agênticas"). É **somente leitura** e é
complementar a Horas agênticas (`/tarefas/horas`, que trata do tempo de execução das mesas). Código em
`src/features/finance/`.

## Regras de negócio

1. **Valor (R$).** O valor de cada tarefa é o **snapshot** `DevTask.estimate.billingBrl` (horas do
   cliente × custo/hora, já com o fator de lucro da época). O total do cliente é a **soma** dos
   snapshots no período. **Não** recalcula com fator/custo atuais nem usa horas apontadas.
2. **"Concluída".** Tarefa cujo `columnId` está entre as **colunas de conclusão** dos vínculos do
   GitHub: `concludedColumnKeys()` (`src/features/tasks/server/service.ts`, derivado de
   `Project.closedColumnKey`). Sem vínculo configurado, não há conclusões.
3. **Data de conclusão (derivada da auditoria).** Não existe campo `completedAt`. A data é o **maior
   `timestamp`** de um evento de auditoria da tarefa (`entidade: "Tarefa"`) que a moveu **para dentro**
   de uma coluna de conclusão:
   - ação `MOVER` → o destino está em `dadosNovos.coluna` como **nome** da coluna → casado com a key
     pela tabela nome → key do quadro;
   - ação `ATUALIZAR` → o destino está em `dadosNovos.coluna` como **key** → casado direto com as
     keys de conclusão.
   Tarefa concluída **sem** evento correspondente é **ignorada**.
4. **Período.** O intervalo `[from, to]` (inclusivo; na URL em `yyyy-MM-dd`, convertido para
   `startOfDay`/`endOfDay` ISO) filtra pela **data de conclusão**. Padrão ao abrir: **mês corrente**
   (dia 1 → hoje) — sem atalho novo no `PresetDateRangeFilter`.
5. **Cliente.**
   - Agrupa por `DevTask.clientId`; o nome vem de `OrcamentoClient`.
   - Cliente **inativo** (registro existe) → agrupa pelo **nome real**.
   - `clientId` **sem registro** (excluído) → grupo **"Cliente removido"** (`clientId: null`; todos os
     órfãos caem nesse único grupo).
   - Tarefa concluída **sem cliente** (`clientId` nulo) → **oculta**.
6. **Arquivadas.** `archived: true` fica **de fora**, mesmo concluída.
7. **Ordenação e totais.** Grupos por `totalBillingBrl` **desc**, desempate por nome; dentro do grupo,
   tarefas por **data de conclusão desc**. A tela mostra os **totais gerais** do período (faturamento
   R$, horas do cliente e quantidade de tarefas) e, em cada grupo, os totais equivalentes.
8. **Horas.** Em cada tarefa, aparecem as **duas**: `hours` (H real) e `clientHours` (H × fator).

Candidatas da busca: `DevTask` com `columnId ∈ colunas de conclusão`, `archived ≠ true`,
`clientId ≠ null` e `estimate ≠ null`.

## Contrato (`types.ts`)

`FinanceTaskDto` (`{ id, code, title, project, hours, clientHours, billingBrl, completedAt }`),
`FinanceClientGroupDto` (`{ clientId, clientName, taskCount, totalHours, totalClientHours,
totalBillingBrl, tasks }`), `FinanceTotalsDto` e `FinanceByClientDto` (`{ from, to, groups, totals }`).

## Backend

- `schemas.ts` — `financeQuerySchema` (`from`/`to` ISO opcionais) e `FINANCE_PATH`.
- `logic.ts` (**puro**, testável sem banco):
  - `completionTimestamps(logs, closedKeys, nameToKey)` — reduz os logs de auditoria ao maior
    timestamp "para dentro de conclusão" por tarefa;
  - `aggregateFinance(tasks, clientsById, range)` — agrupa, resolve nome/"Cliente removido", soma,
    arredonda a 2 casas e ordena grupos e tarefas.
- `server/service.ts` — `listFinanceByClient({ from, to })`: `dbConnect()` → `concludedColumnKeys()`
  (vazio ⇒ vazio) → `TaskBoardColumn` (nome → key) → tarefas candidatas → `AuditLog` (MOVER/ATUALIZAR,
  `timestamp ≤ to`) → `completionTimestamps` → filtro `[from, to]` → `OrcamentoClient` (nomes) →
  `aggregateFinance`. Reusa `concludedColumnKeys` de `features/tasks/server/service.ts` e `ProjectRef`
  de `features/tasks/types.ts`.
- Rota `GET /api/financeiro?from&to` (`src/app/api/financeiro/route.ts`, `withRoute` + `ok`), protegida
  pelo middleware (não é API pública por token e **não** entra no OpenAPI `/api/v1/*`).

## Frontend

- `src/app/(app)/financeiro/page.tsx` — envolve a página no `RepoIndexProvider` (para o
  `GithubRepoLabel` real) e renderiza `<FinancePage/>`.
- `hooks/useFinance.ts` — `useFinanceByClient` (TanStack Query sobre `/financeiro`) e
  `useFinanceRealtime` (assina `private-app`; invalida o cache em `tasks-updated` e
  `orcamentos-updated` — nunca publica eventos).
- `components/FinancePage.tsx` — período na URL (`useUrlFilters`; padrão = mês corrente), card com
  `PresetDateRangeFilter` e totais (`AnimatedNumber`), botão Atualizar e estados
  loading/erro/vazio/lista (Framer Motion).
- `components/FinanceClientGroup.tsx` — grupo de cliente **expansível** (recolhido por padrão;
  abertura animada por Framer Motion, respeitando movimento reduzido): nome, contagem, horas do
  cliente e faturamento.
- `components/FinanceTaskRow.tsx` — cada tarefa concluída: código (link para `/tarefas/{id}`), título,
  repositório (`GithubRepoLabel`), data de conclusão e os valores (horas reais, horas do cliente e R$).
- `format.ts` (**puro**) — `formatBillingBrl` (`R$ 1.234,56`) e `formatHours` (`H:mm h`).

## Testes

`__tests__/features/finance/`: `finance-logic` (derivação da conclusão por nome/key, maior timestamp,
agrupamento, "Cliente removido", ordenação e totais), `finance-service` (agrupamento pelo snapshot,
vazio sem colunas de conclusão, filtro pelo período, tarefas arquivadas/sem cliente/sem evento
ignoradas, cliente removido) e `finance-page` (totais, expansão do cliente, vazio e erro). A navegação
é coberta em `__tests__/features/layout/navigation.test.ts`.
