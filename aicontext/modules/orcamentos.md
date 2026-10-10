# Módulo: Orçamentos (portal do cliente)

Integração **Orçamentos** (`orcamentos`, rota `/integracoes/orcamentos`): o dono cadastra **clientes**
e cada cliente ganha uma **URL fixa com token** para um **portal próprio, somente leitura**, sem
sidebar, com o **mesmo kanban/tabela** das Tarefas (restrito aos repositórios escolhidos). O cliente
pode **enviar uma nova tarefa** descrevendo o pedido; a IA gera uma **prévia** (título, tipo,
prioridade, resumo e especificação técnica) e, em seguida, uma **estimativa de horas**, que o cliente
**aprova ou corrige**. A aprovação cria a tarefa de verdade (com issue no GitHub, como no app).

Fonte de verdade do cálculo: a IA estima as **horas reais (H)**; o **cliente** vê `H × fator de lucro`
e o **faturamento** = `(H × fator) × custo por hora` (sempre em R$); o **app** mostra a estimativa
real (H).

## Modelo (`src/lib/db/models/Orcamento.ts`)

- `OrcamentoClient` (`orcamento_clients`): `{ name, token, tokenHash, tokenPrefix, projectIds[],
  hourlyRate, profitFactor, active }`. O **token** (`cli_…`) é gravado em claro (`token`) para montar
  a **URL copiável** no painel; a autenticação usa o **hash SHA-256** (`tokenHash`) e o **prefixo
  visível** (`tokenPrefix`) é o que aparece na lista.
- `OrcamentoDraft` (`orcamento_drafts`): `{ clientId, projectId, description, correction, preview,
  estimatedHours, model, status: "draft" | "approved", taskId }`. `preview` = `{ title, taskType,
  priority, technicalSpec, summary }` (1ª fase da IA); `estimatedHours` (H) é gravado na 2ª fase.
- `DevTask.estimate` (subdocumento, `null` fora do portal): `{ hours, clientHours, billingBrl, factor,
  hourlyRate, model, generatedAt }` — snapshot no momento da aprovação. Ver `modules/tasks.md`.

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
  **Fator de lucro** (≥ 1) e **Cliente ativo**.
- Token: criar e regenerar devolvem o valor em claro + a URL (`ClientTokenDialog`); regenerar invalida
  o anterior na hora.
- Regras: repositório precisa existir (400 `PROJECT_NOT_FOUND`); mutações auditadas
  (`ClienteOrcamento`) e publicam `orcamentos-updated { scope: "clients" }` em `private-app`.

## Portal (`/cliente`)

Fora do grupo `(app)` — **sem sidebar** (`src/app/cliente/layout.tsx`, largura total com padding
enxuto), com `robots: noindex`.

- `/cliente?t=` — **lista** (`ClienteTasksPage`): cabeçalho com o nome do cliente, **Nova tarefa**,
  **Kanban | Tabela**, Atualizar e filtros (busca, Repositório, Coluna, Prioridade, Tipo). Mesmo
  visual das Tarefas, porém **somente leitura** (sem arrastar, sem editar, sem excluir). O filtro de
  Repositório fica **limitado** aos repositórios do cliente. Cada card/linha mostra a estimativa do
  cliente (`EstimateBadge` modo `client`: `H × fator` h e `R$ faturamento`).
- `/cliente/nova?t=` — **nova tarefa** (`ClienteNovaTarefaPage`): repositório (só os permitidos) +
  **descrição** em Markdown (`MarkdownField`). Ao avançar, cria o rascunho e vai para a revisão.
- `/cliente/revisao/[draftId]?t=` — **revisão** (`ClienteRevisaoPage`), em duas colunas
  (`lg:grid-cols-4`):
  - **Coluna principal** (3/4): card com o **nome gerado pela IA como título**, o **resumo como
    subtítulo discreto** e, abaixo, a **descrição** do cliente (Markdown); card da **especificação
    técnica**. Enquanto a prévia é gerada, mostra carregamento/streaming.
  - **Metadados** (1/4, e **acima** no mobile via `order`): **repositório**, **tipo + prioridade** e
    **horas e custo estimados** (`EstimateCard`). O card de horas tem um **carregamento animado**
    enquanto a 2ª fase roda; ao concluir, os valores entram com `AnimatedNumber` (`H:mm` e `R$`); em
    erro, mostra "Tentar novamente".
  - Card **"Ajustar ou aprovar"** em **largura total** abaixo do grid: **Solicitar correção** (texto
    que entra no próximo prompt) e **Aprovar tarefa**. **Não** há botão "Gerar novamente" — a
    geração é automática (prévia → estimativa).

## IA em duas fases

- Feature **Orçamentos** em Provedores de IA (`ai_feature_settings`, `feature: "budget-preview"`),
  schema `budgetPreviewSettingsSchema` — ver `modules/ai.md`.
- **Fase 1 — prévia** (`POST /api/cliente/drafts/[id]/preview`): monta a entrada, roda o `streamAi`
  (NDJSON), valida o JSON com Zod (`parseDraftPreview`) e grava `preview` no rascunho no `done`,
  **zerando `estimatedHours`** (nova correção ⇒ nova estimativa).
- **Fase 2 — estimativa** (`POST /api/cliente/drafts/[id]/estimate`, disparada automaticamente depois
  da prévia): exige a prévia (409 `DRAFT_WITHOUT_PREVIEW`), roda o `streamAi` com a prévia + o
  pedido + o **histórico de horas dos agentes** e valida `{ estimatedHours }` (`parseEstimateHours`);
  ao concluir grava as horas e devolve o orçamento (`saveDraftEstimate` → `H × fator × custo/hora`).
- `preview-prompt.ts` (puro): contratos de saída das duas fases (`buildBudgetPreviewInstructions`/
  `buildBudgetEstimateInstructions`), prompts (`buildBudgetPreviewPrompt`/`buildBudgetEstimatePrompt`)
  e parsers. O histórico é **injetado no prompt** (sem ferramenta — o `streamAi` não tem tool
  calling). `estimateStats()` (`server/estimate.ts`) agrega `TimeLog.duration` por `DevTask.taskType`.
- Cada geração (fases) grava uma linha em `ai_usage_logs` (`feature: "budget-preview"`).

## Criação da tarefa (`server/portal.ts` → `createTaskWithIssue`)

Aprovar exige a **prévia** (409 `DRAFT_WITHOUT_PREVIEW`) e usa `createTaskWithIssue` (mesma rota do
app: **cria a issue no GitHub antes de persistir** — falha do GitHub bloqueia) com
`origin: "client"`. Quando há estimativa, envia o `estimate` (snapshot: horas reais, horas do cliente,
faturamento, fator, custo/hora e modelo); **sem estimativa, a tarefa nasce sem o `estimate`**. O
rascunho vira `approved` com `taskId` e registra auditoria (`RascunhoOrcamento`, ação `APROVAR`). A
tarefa nasce na **coluna de entrada** do projeto (`entryColumnKey`).

## APIs

| Rota | Descrição |
|---|---|
| `GET/POST /api/integrations/orcamentos/clients` | Lista / cria cliente (POST devolve o token) |
| `PATCH/DELETE /api/integrations/orcamentos/clients/[id]` | Edita / exclui cliente e seus rascunhos |
| `POST /api/integrations/orcamentos/clients/[id]/token` | Regenera o token (invalida o anterior) |
| `GET /api/cliente/options` | Nome do cliente, repositórios permitidos e quadro (colunas) |
| `GET /api/cliente/tasks[?includeArchived=true]` | Tarefas dos repositórios do cliente |
| `POST /api/cliente/drafts` | Abre um rascunho (repositório + descrição) |
| `GET /api/cliente/drafts/[id]` | Rascunho (prévia + estimativa) |
| `POST /api/cliente/drafts/[id]/correction` | Registra a correção pedida |
| `POST /api/cliente/drafts/[id]/preview` | Gera a prévia com IA (NDJSON — 1ª fase) |
| `POST /api/cliente/drafts/[id]/estimate` | Estima horas e custo com IA (NDJSON — 2ª fase) |
| `POST /api/cliente/drafts/[id]/approve` | Cria a tarefa conforme a prévia aprovada |

O token do cliente não é um **token de sistema**: o portal **não** entra na especificação OpenAPI
pública (`/api/v1/*`).

## Arquivos

- `src/features/orcamentos/` — `constants.ts`, `logic.ts` (puro: `computeClientEstimate`,
  `formatHoursLabel`), `schemas.ts`, `types.ts`, `preview-prompt.ts` (puro), `hooks/useOrcamentos.ts`,
  `components/` (editor da integração, clientes e `CopyPortalUrlButton`) e `portal/` (contexto, hooks
  — `useBudgetReview` orquestra as duas fases —, páginas e componentes; `portal/components/preview/`
  tem `PreviewTitleCard`, `PreviewSpecCard`, `RepoMetaCard`, `TypePriorityMetaCard`, `EstimateCard` e
  `CorrectionCard`).
- `src/app/(app)/integracoes/orcamentos/page.tsx`, `src/app/api/integrations/orcamentos/*`,
  `src/app/cliente/*` e `src/app/api/cliente/*`.
- `src/components/ui/markdown-field.tsx` — campo Markdown com barra de formatação e abas
  Escrever/Visualizar (reusado no `TaskForm` e no portal).

## Testes

`__tests__/features/orcamentos/`: `orcamentos-logic`, `orcamentos-preview-prompt` (contratos/parsers
das duas fases), `portal-auth`, `orcamentos-token`, `orcamentos-clients` (token/`portalPath`),
`orcamentos-portal` (prévia, estimativa, aprovar com e sem estimativa), `cliente-revisao`
(cards da revisão), `copy-portal-url`, `markdown-field` e `cliente-task-table`.
