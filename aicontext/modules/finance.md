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
9. **Filtros de cliente e repositório (multisseleção).** Dois filtros opcionais, aplicados **na API**
   (não no navegador):
   - **Clientes** — ids de `OrcamentoClient` (inclui clientes **inativos**);
   - **Repositórios** — ids de `Project` (repositório vinculado, o `DevTask.projectId`).
   Sem seleção, o filtro significa **todos**. Dentro de um filtro as opções somam (**OU**) e filtros
   diferentes se cruzam (**E**), sempre combinados com o período. As seleções ficam na **URL**
   (`clientIds`/`projectIds`, ids separados por vírgula) junto do período, e cada mudança refaz a
   consulta. Os **totais** (gerais e por grupo) refletem só o que passou pelos filtros.
   O grupo **"Cliente removido"** continua aparecendo quando **não** há filtro de clientes; com filtro
   de clientes ele não é oferecido como opção (não há registro para selecionar).

Candidatas da busca: `DevTask` com `columnId ∈ colunas de conclusão`, `archived ≠ true`,
`clientId ≠ null`, `estimate ≠ null` e, quando houver seleção, `clientId ∈ clientIds` e/ou
`projectId ∈ projectIds`.

## Contrato (`types.ts`)

`FinanceTaskDto` (`{ id, code, title, project, hours, clientHours, billingBrl, completedAt }`),
`FinanceClientGroupDto` (`{ clientId, clientName, taskCount, totalHours, totalClientHours,
totalBillingBrl, tasks }`), `FinanceTotalsDto` e `FinanceByClientDto` (`{ from, to, groups, totals }`).

## Backend

- `schemas.ts` — `financeQuerySchema` (`from`/`to` ISO opcionais; `clientIds`/`projectIds` como
  **listas de ids separadas por vírgula**, com deduplicação e id malformado recusado) e `FINANCE_PATH`.
- `logic.ts` (**puro**, testável sem banco):
  - `completionTimestamps(logs, closedKeys, nameToKey)` — reduz os logs de auditoria ao maior
    timestamp "para dentro de conclusão" por tarefa;
  - `aggregateFinance(tasks, clientsById, range)` — agrupa, resolve nome/"Cliente removido", soma,
    arredonda a 2 casas e ordena grupos e tarefas.
- `server/service.ts` — `listFinanceByClient({ from, to, clientIds, projectIds })`: `dbConnect()` →
  `concludedColumnKeys()` (vazio ⇒ vazio) → `TaskBoardColumn` (nome → key) → tarefas candidatas
  (aplicando `$in` de `clientId`/`projectId` quando há seleção) → `AuditLog` (MOVER/ATUALIZAR,
  `timestamp ≤ to`) → `completionTimestamps` → filtro `[from, to]` → `OrcamentoClient` (nomes) →
  `aggregateFinance`. Reusa `concludedColumnKeys` de `features/tasks/server/service.ts` e `ProjectRef`
  de `features/tasks/types.ts`. Os filtros são **opcionais** (o dashboard chama só com `from`/`to`).
- Rota `GET /api/financeiro?from&to&clientIds&projectIds` (`src/app/api/financeiro/route.ts`, `withRoute`
  + `ok`), protegida pelo middleware (não é API pública por token e **não** entra no OpenAPI `/api/v1/*`).

## Frontend

- `src/app/(app)/financeiro/page.tsx` — envolve a página no `RepoIndexProvider` (para o
  `GithubRepoLabel` real) e renderiza `<FinancePage/>`.
- `hooks/useFinance.ts` — `useFinanceByClient(filters)` (TanStack Query sobre `/financeiro`, com a
  chave de cache derivada da consulta normalizada) e `useFinanceRealtime` (assina `private-app`;
  invalida o cache do financeiro **e as opções dos filtros** em `tasks-updated` e `orcamentos-updated`
  — nunca publica eventos).
- `filters.ts` (**puro**) — `FinanceFilters` (período + `clientIds`/`projectIds`), `FINANCE_FILTER_SCHEMA`
  (codecs da URL), `defaultFinanceFilters` (mês corrente), `financeQuery`/`financeHttpParams`
  (normalização dos ids e parâmetros da API) e os construtores das opções (`financeClientOptions`,
  `financeRepoOptions`).
- `components/FinanceFiltersBar.tsx` — `ListFilters` do projeto com os grupos **Período**
  (`PresetDateRangeFilter`), **Clientes** e **Repositórios** (`CadastroMultiSelect` com busca); Limpar
  restaura o mês corrente e zera as seleções.
- `components/FinancePage.tsx` — filtros na URL (`useUrlFilters`; padrão = mês corrente), cartão de
  totais (`AnimatedNumber`), botão Atualizar e estados loading/erro/vazio/lista (Framer Motion). O
  vazio distingue "sem conclusões no período" de "sem resultados para os filtros" (com ação de limpar a
  seleção). As opções vêm de `useOrcamentoClients` (clientes) e `useTaskOptions` (projetos).
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
ignoradas, cliente removido e os **filtros de cliente/repositório** — OU dentro do filtro, E entre
filtros e seleção sem resultado), `finance-filters` (normalização dos ids, parâmetros HTTP, período ISO
em início/fim do dia e opções ordenadas), `finance-schemas` (listas por vírgula sem duplicatas e id malformado), `finance-route` (encaminhamento dos parâmetros e 400 para id malformado) e `finance-page` (totais,
filtros de clientes/repositórios, seleção lida da URL, vazio com filtros, expansão do cliente, vazio e
erro). A navegação é coberta em `__tests__/features/layout/navigation.test.ts`.

## Financeiro do **cliente** (portal)

O portal tem a sua versão (`/cliente/financeiro`, `GET /api/cliente/financeiro`, só para o **admin** do
cliente) com o **mesmo padrão** desta tela: **custo** das tarefas concluídas agrupado por
**repositório** (o cliente já é o da sessão, então não há filtro de clientes), filtros no `ListFilters`
(**Período** com `PresetDateRangeFilter` e **Repositórios** com `CadastroMultiSelect`) com
`from`/`to`/`projectIds` na **URL** (`useUrlFilters`, período padrão = **mês corrente**), cartão de
totais (**Custo**, Horas e Tarefas), botão Atualizar e grupos **expansíveis** por repositório. O
período em ISO é convertido para início/fim do dia (`clienteFinanceQuery`, em
`src/features/orcamentos/portal/filters.ts`, que reusa `currentMonth`/`financeQueryRange`/`normalizeIds`
daqui) e entradas inválidas devolvem **400**.

Reusa a mesma regra de conclusão (`completionTimestamps`) e o snapshot (`clientHours`/`billingBrl`), mas
**nunca** expõe horas reais, fator ou custo/hora — o termo é **"Custo"** e as horas mostradas são as
infladas. Serviço em `src/features/orcamentos/server/portal-finance.ts` (`groupCostByProject` é puro e
testado); apresentação em `src/features/orcamentos/portal/{ClienteFinanceiroPage,components/ClienteCost*}`;
detalhes em `modules/orcamentos.md`.
