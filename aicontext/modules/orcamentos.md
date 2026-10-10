# Módulo: Orçamentos (portal do cliente)

Integração **Orçamentos** (`orcamentos`, rota `/integracoes/orcamentos`): o dono cadastra **clientes**
e cada cliente ganha uma **URL fixa com token** para um **portal próprio, somente leitura**, sem
sidebar, com o **mesmo kanban/tabela** das Tarefas, restrito aos repositórios escolhidos e **apenas
às tarefas que o cliente solicitou**. O cliente pode **enviar uma nova tarefa** descrevendo o pedido; a IA gera uma **prévia** (título, tipo,
prioridade, resumo e especificação técnica); em seguida a IA **classifica a tarefa com tags**
(feature "Tags de tarefas") e **estima as horas por tarefas semelhantes** — uma única chamada, sem
agente —, que o cliente **aprova ou corrige**. A aprovação cria a tarefa de verdade (com issue no GitHub, como no app).

Fonte de verdade do cálculo: a IA estima as **horas reais (H)**; o **cliente** vê `H × fator de lucro`
e o **faturamento** = `(H × fator) × custo por hora` (sempre em R$); o **app** mostra a estimativa
real (H). Na **página da tarefa** o **cliente é editável** (adicionar/trocar/remover) e as horas
estimadas também; ao salvar ou trocar o cliente, o servidor recalcula o orçamento com o fator de lucro
e o custo/hora do cliente **da tarefa** (`DevTask.clientId`; sem ele — dados legados —, o
`OrcamentoClient` ativo cujo `projectIds` inclui o repositório). Ver `modules/tasks.md`.

## Modelo (`src/lib/db/models/Orcamento.ts`)

- `OrcamentoClient` (`orcamento_clients`): `{ name, token, tokenHash, tokenPrefix, projectIds[],
  hourlyRate, profitFactor, active }`. O **token** (`cli_…`) é gravado em claro (`token`) para montar
  a **URL copiável** no painel; a autenticação usa o **hash SHA-256** (`tokenHash`) e o **prefixo
  visível** (`tokenPrefix`) é o que aparece na lista.
- `OrcamentoDraft` (`orcamento_drafts`): `{ clientId, projectId, description, correction, preview,
  estimatedHours, model, status: "draft" | "approved", taskId }`. `preview` = `{ title, taskType,
  priority, technicalSpec, summary, tags }` (1ª fase da IA + tags da feature "Tags de tarefas");
  `estimatedHours` (H) é gravado na 2ª fase.
- `DevTask.estimate` (subdocumento; `null` **quando a tarefa não tem cliente**): `{ hours, clientHours,
  billingBrl, factor, hourlyRate, model, generatedAt }` — snapshot gravado na aprovação do portal ou
  ao **definir/trocar o cliente na página da tarefa**. Ver `modules/tasks.md`.
- `DevTask.clientId`: o **cliente de orçamento da tarefa** (`OrcamentoClient._id`; `null` = sem
  cliente) — tanto o que **solicitou** pelo portal quanto o que o dono **atribuiu/atualizou na página
  da tarefa**. É o que define a **lista do portal** (o cliente só vê as tarefas com o seu `clientId`;
  trocar/remover o cliente na tarefa muda o que o portal mostra). Ver `modules/tasks.md`.

## Autenticação do portal (`server/token.ts`)

- `newClientTokenValue()` gera `cli_<base64url>`; `hashClientToken` = SHA-256.
- `requireClient(req)` lê o token do header **`x-client-token`** (preferido) ou da query **`?t=`**;
  401 `UNAUTHENTICATED` sem token ou token inválido/desativado. Páginas do portal recebem o token por
  `?t=` e o repassam.
- O middleware libera `/cliente` e `/api/cliente` sem sessão (ver `modules/auth.md`).

## Clientes (tela `/integracoes/orcamentos`, `server/clients.ts`)

- Aba **Clientes** (`OrcamentosEditorForm`, integração sem campos públicos nem segredos — toda a
  configuração são os clientes). Lista com nome, prefixo do token, custo/hora, fator e repositórios;
  ações **Copiar URL**, **Editar**, **Token** (regenerar, com confirmação) e **Excluir**
  (confirmação).
- **Copiar URL** (`CopyPortalUrlButton`): copia `${origem}${withBasePath(portalPath)}` — a URL do
  portal **sem trocar o token** — com feedback visual (Check + toast). O `portalPath` (`/cliente?t=…`)
  vem no DTO de administração; a regeneração é a única ação que troca o token.
- Formulário (`ClienteDialog`): **Nome**, **Repositórios** (múltipla escolha só entre os projetos
  vinculados — `GET /api/tasks/options`), **Custo por hora** (`MoneyInput`, 2 casas decimais),
  **Fator de lucro** (≥ 1) e **Cliente ativo**. O seletor de **Repositórios** é o
  `CadastroMultiSelect` (o **mesmo componente dos filtros das Tarefas**), com busca e as opções no
  `GithubRepoLabel` real (avatar/descrição/privado) via `useGithubRepoIndex` da sessão.
- Token: criar e regenerar devolvem o valor em claro + a URL (`ClientTokenDialog`); regenerar invalida
  o anterior na hora.
- Regras: repositório precisa existir (400 `PROJECT_NOT_FOUND`); mutações auditadas
  (`ClienteOrcamento`) e publicam `orcamentos-updated { scope: "clients" }` em `private-app`.

## Portal (`/cliente`)

Fora do grupo `(app)` — **sem sidebar** (`src/app/cliente/layout.tsx`, largura total com padding
enxuto), com `robots: noindex`.

Os repositórios do portal (opções e rascunho) chegam **enriquecidos com os dados do GitHub**
(avatar, descrição e privacidade) no próprio DTO do portal: o servidor casa `repo` com o índice de
`listGithubRepos()` (cache de 5 min) em `server/portal.ts`, **best-effort** — sem token/API fora, o
rótulo cai na inicial (o portal é público e não chama os endpoints de sessão do GitHub). Todos os
pontos que exibem repositório no portal usam o `GithubRepoLabel` real (`repoLabel`/`repoLabelIndex`
+ `repoLabelFrom` de `logic.ts`): o formulário, o filtro, o card/linha da lista, o card da revisão e a
aba **Clientes** (esta usa o `useGithubRepoIndex` da sessão).

- `/cliente?t=` — **lista** (`ClienteTasksPage`): cabeçalho com o nome do cliente, **Nova tarefa**,
  **Kanban | Tabela**, Atualizar e filtros (busca, Repositório, Coluna, Prioridade, Tipo). Mostra
  **somente as tarefas que o cliente solicitou** (filtro por `clientId` no servidor), com o mesmo
  visual das Tarefas, porém **somente leitura** (sem arrastar, sem editar, sem excluir). O filtro de
  Repositório fica **limitado** aos repositórios do cliente. Cada card/linha é um **link** para a
  página da tarefa e mostra o repositório com o `GithubRepoLabel` (avatar/descrição/privado) e a
  estimativa do cliente (`ClienteEstimateBadge`: `H × fator` h e `R$ faturamento` — nunca as horas
  reais).
- `/cliente/tarefa/[id]?t=` — **página da tarefa** (`ClienteTaskDetailPage`), somente leitura, com os
  detalhes equivalentes aos do dono, **exceto Histórico e Horas apontadas** (dados internos: auditoria,
  horas reais apontadas, tokens, custo em USD e modelo agêntico). Abas próprias (`ClienteTaskTabs`):
  **Descrição**, **Especificação técnica** e **Comentários** (o cliente pode comentar — ver abaixo).
  Acima do conteúdo, o **Resumo (IA)** em card próprio (`TaskSummaryCard`). Coluna lateral
  (`ClienteTaskSidebar`): prioridade (badge, sem edição), tipo, repositório, criada/atualizada e a
  **estimativa** (`ClienteEstimateCard`): o cliente vê **só o prazo inflado** (`H × fator`) e o
  faturamento; **não** vê as horas reais, o fator, o custo/hora nem o modelo. Acesso validado por
  `clientId` (tarefa de outro cliente devolve 404 `TASK_NOT_FOUND`). Sem Pusher: o portal é público e
  atualiza pelo botão **Atualizar** (e revalida o detalhe ao comentar).
- **Comentários** no portal (`ClienteCommentsSection`): lista (Markdown) e formulário. Cada comentário
  mostra o **nome do autor** — o nome do cliente (comentário do portal) ou o do dono
  (`APP_OWNER_NAME`/`getLocalUser()`, comentário do app). A origem vai gravada em `TaskComment`
  (`authorType`/`authorName`); o formulário interno (`CommentsSection`) exibe o mesmo nome.
- `/cliente/nova?t=` — **nova tarefa** (`ClienteNovaTarefaPage`): repositório (só os permitidos, no
  `SearchPicker` com o `GithubRepoLabel` real) + **descrição** em Markdown (`MarkdownField`). Ao
  avançar, cria o rascunho e vai para a revisão.
- `/cliente/revisao/[draftId]?t=` — **revisão** (`ClienteRevisaoPage`), em duas colunas
  (`lg:grid-cols-4`):
  - **Coluna principal** (3/4): card com o **nome gerado pela IA como título**, o **resumo como
    subtítulo discreto** e, abaixo, a **descrição** do cliente (Markdown); card da **especificação
    técnica**. Enquanto a prévia é gerada, mostra um **skeleton** (o JSON cru da IA nunca é exibido).
  - **Metadados** (1/4, e **acima** no mobile via `order`): **repositório** (com o
    `GithubRepoLabel` real no `RepoMetaCard`), **tipo + prioridade** e **horas e custo estimados**
    (`EstimateCard`). O card de horas tem um **carregamento animado** enquanto o agente pensa/consulta
    o banco (mostra o progresso, ex.: "Consultando (banco)…"); ao concluir, os valores entram com
    `AnimatedNumber` (`H:mm` e `R$`); em erro, mostra "Tentar novamente".
  - Card **"Ajustar ou aprovar"** em **largura total** abaixo do grid: **Solicitar correção** (texto
    que entra no próximo prompt) e **Aprovar tarefa**. **Não** há botão "Gerar novamente" — a
    geração é automática (prévia → estimativa). Ao **solicitar a correção**, a tela volta a exibir
    **skeleton** na prévia e na estimativa (via `selectReviewView` de `useBudgetReview`) até chegarem
    os novos valores — nunca reaproveita o resultado anterior do cache do rascunho.

## IA em duas fases

- **Fase 1 — prévia** (`POST /api/cliente/drafts/[id]/preview`), feature **Orçamentos**
  (`budget-preview`): monta a entrada, roda o `streamAi` (NDJSON), valida o JSON com Zod
  (`parseDraftPreview`) e grava `preview` no rascunho no `done`, **zerando `estimatedHours` e as
  tags** (nova correção ⇒ nova estimativa e novas tags). No cliente, a geração mostra um **skeleton de carregamento** — o JSON
  cru nunca é exibido — e, na correção, prévia **e** estimativa voltam a skeleton até chegarem os
  novos valores.
- **Fase 2 — estimativa** (`POST /api/cliente/drafts/[id]/estimate`, disparada automaticamente
  depois da prévia), feature **Estimar prazos** (`estimate-hours`): exige a prévia (409
  `DRAFT_WITHOUT_PREVIEW`); garante as **tags** do rascunho (feature "Tags de tarefas"), pré-busca em
  `dev_tasks` as **tarefas semelhantes** por tags (fallback por tipo/projeto, `server/similar.ts`) —
  **só tarefas com horas reais apontadas** (`TimeLog`), descartando as sem apontamento — e faz **uma
  única chamada** ancorada na **mediana** do histórico: provedor de texto (valida
  `{ estimatedHours }`, `parseEstimateHours`) ou **JEV** (um `score` fracionário de tempo de execução
  interpolado para horas). Ao concluir grava as horas **e o modelo** que as gerou
  (`saveDraftEstimate` → `H × fator × custo/hora`) e devolve as **tags** no `done`. O rascunho mostra
  o progresso ("Classificando…", "Buscando tarefas semelhantes…").
- A revisão exibe as **tags** da prévia em um card próprio (`PreviewTagsCard`, com os rótulos
  resolvidos no servidor por `resolveTagViews`).
- `preview-prompt.ts` (puro): contratos de saída das duas fases
  (`buildBudgetPreviewInstructions`/`buildBudgetEstimateInstructions`), prompts
  (`buildBudgetPreviewPrompt`/`buildBudgetEstimatePrompt` — este último recebe as tarefas semelhantes
  e a **âncora do histórico**, `estimateAnchor`), parsers e helpers do JEV (`buildJevEstimateQuestions`,
  `mapJevEstimateScore`).
- Cada geração grava uma linha em `ai_usage_logs` (`feature: "budget-preview"` na prévia;
  `"estimate-hours"` na estimativa).

## Criação da tarefa (`server/portal.ts` → `createTaskWithIssue`)

Aprovar exige a **prévia** (409 `DRAFT_WITHOUT_PREVIEW`) e usa `createTaskWithIssue` (mesma rota do
app: **cria a issue no GitHub antes de persistir** — falha do GitHub bloqueia) com
`origin: "client"` e **`clientId` do cliente** (o que define a lista do portal), além das **tags** do
rascunho (`tags` de `createTask`, sem gerar de novo). Quando há estimativa,
envia o `estimate` (snapshot: horas reais, horas do cliente, faturamento, fator, custo/hora e modelo);
**sem estimativa, a tarefa nasce sem o `estimate`**. O rascunho vira `approved` com `taskId` e registra
auditoria (`RascunhoOrcamento`, ação `APROVAR`). A tarefa nasce na **coluna de entrada** do projeto
(`entryColumnKey`). Tarefas pedidas **antes** da marcação por `clientId` são retroalimentadas pela
migração `backfill-task-client-id` (a partir dos rascunhos aprovados).

## APIs

| Rota | Descrição |
|---|---|
| `GET/POST /api/integrations/orcamentos/clients` | Lista / cria cliente (POST devolve o token) |
| `PATCH/DELETE /api/integrations/orcamentos/clients/[id]` | Edita / exclui cliente e seus rascunhos |
| `POST /api/integrations/orcamentos/clients/[id]/token` | Regenera o token (invalida o anterior) |
| `GET /api/cliente/options` | Nome do cliente, repositórios permitidos e quadro (colunas) |
| `GET /api/cliente/tasks[?includeArchived=true]` | Tarefas **que o cliente solicitou** (por `clientId`), na visão do cliente |
| `GET /api/cliente/tasks/[id]` | Detalhe da tarefa na visão do cliente (sem histórico, horas apontadas nem dados internos da estimativa) |
| `POST /api/cliente/tasks/[id]/comments` | Comentário do cliente (origem marcada pelo nome do cliente) |
| `POST /api/cliente/drafts` | Abre um rascunho (repositório + descrição) |
| `GET /api/cliente/drafts/[id]` | Rascunho (prévia + estimativa) |
| `POST /api/cliente/drafts/[id]/correction` | Registra a correção pedida |
| `POST /api/cliente/drafts/[id]/preview` | Gera a prévia com IA (NDJSON — 1ª fase) |
| `POST /api/cliente/drafts/[id]/estimate` | Estima horas e custo com IA (NDJSON — 2ª fase) |
| `POST /api/cliente/drafts/[id]/approve` | Cria a tarefa conforme a prévia aprovada |

O token do cliente não é um **token de sistema**: o portal **não** entra na especificação OpenAPI
pública (`/api/v1/*`).

## Arquivos

- `src/features/orcamentos/` — `constants.ts` (`clientePortalPath`, `clienteNovaPath`,
  `clienteRevisaoPath`, `clienteTarefaPath`), `logic.ts` (puro: `computeClientEstimate`,
  `formatHoursLabel`), `schemas.ts`, `types.ts`, `preview-prompt.ts` (puro), `hooks/useOrcamentos.ts`,
  `server/similar.ts` (tarefas semelhantes por tags/tipo/projeto para a estimativa; só horas reais),
  `server/tag-views.ts` (resolve ids de tags em `{ id, label }` para o portal), `components/`
  (editor da integração, clientes e `CopyPortalUrlButton`) e `portal/` (contexto, hooks
  — `useBudgetReview` orquestra as duas fases —, páginas e componentes; `portal/components/preview/`
  tem `PreviewTitleCard`, `PreviewSpecCard`, `RepoMetaCard`, `TypePriorityMetaCard`, `EstimateCard` e
  `CorrectionCard`). A visão do cliente tem `ClienteTaskDetailPage`, `ClienteTaskTabs`,
  `ClienteTaskSidebar`, `ClienteEstimateCard`, `ClienteEstimateBadge` e `ClienteCommentsSection`, além
  dos tipos seguros `ClienteTaskDto`/`ClienteTaskDetailDto` (sem horas reais/fator/custo/modelo).
- `src/app/(app)/integracoes/orcamentos/page.tsx`, `src/app/api/integrations/orcamentos/*`,
  `src/app/cliente/*` e `src/app/api/cliente/*`.
- `src/components/ui/markdown-field.tsx` — campo Markdown com barra de formatação e abas
  Escrever/Visualizar (reusado no `TaskForm` e no portal).

## Testes

`__tests__/features/orcamentos/`: `orcamentos-logic`, `orcamentos-preview-prompt` (contratos/parsers
das duas fases), `portal-auth`, `orcamentos-token`, `orcamentos-clients` (token/`portalPath`),
`orcamentos-portal` (prévia, estimativa, aprovar com e sem estimativa, lista/detalhe do cliente por
`clientId` e comentário com origem), `orcamentos-estimate` (estimativa em uma chamada: tags +
semelhantes + provedor de texto/JEV), `orcamentos-similar` (busca por tags com fallback e horas
dos apontamentos), `cliente-revisao` (cards da revisão), `cliente-task-table`,
`cliente-task-card`, `cliente-task-detail` (abas sem Histórico/Horas, estimativa inflada e comentários
com autor), `cliente-dialog` (seletor de repositórios com o `GithubRepoLabel`), `copy-portal-url`,
`markdown-field`. A configuração de "Estimar prazos" em
`__tests__/features/ai/estimate-hours-settings.test.ts`; o `EstimateBadge` (faturamento no dono) em
`__tests__/features/tasks/estimate-badge.test.tsx`.
