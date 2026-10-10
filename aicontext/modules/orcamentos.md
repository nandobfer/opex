# Módulo: Orçamentos (portal do cliente)

Integração **Orçamentos** (`orcamentos`, rota `/integracoes/orcamentos`): o dono cadastra **clientes**
e cada cliente ganha uma **URL fixa com token** para um **portal próprio, somente leitura**, sem
sidebar, com o **mesmo kanban/tabela** das Tarefas (restrito aos repositórios escolhidos). O cliente
pode **enviar uma nova tarefa** descrevendo o pedido; a IA gera uma **prévia** (título, tipo,
prioridade, especificação técnica, resumo) e uma **estimativa de horas**, que o cliente **aprova ou
corrige**. A aprovação cria a tarefa de verdade (com issue no GitHub, como no app).

Fonte de verdade do cálculo: a IA estima as **horas reais (H)**; o **cliente** vê `H × fator de lucro`
e o **faturamento** = `(H × fator) × custo por hora` (sempre em R$); o **app** mostra a estimativa
real (H).

## Modelo (`src/lib/db/models/Orcamento.ts`)

- `OrcamentoClient` (`orcamento_clients`): `{ name, tokenHash, tokenPrefix, projectIds[], hourlyRate,
  profitFactor, active }`. O **token** (`cli_…`) aparece uma única vez (criar/regenerar); o banco
  guarda só o **hash SHA-256** (`tokenHash`) e o **prefixo visível** (`tokenPrefix`).
- `OrcamentoDraft` (`orcamento_drafts`): `{ clientId, projectId, description, correction, preview,
  model, status: "draft" | "approved", taskId }`. `preview` = `{ title, taskType, priority,
  technicalSpec, summary, estimatedHours }` (saída validada da IA).
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
  ações **Editar**, **Token** (regenerar, com confirmação) e **Excluir** (confirmação).
- Formulário (`ClienteDialog`): **Nome**, **Repositórios** (múltipla escolha só entre os projetos
  vinculados — `GET /api/tasks/options`), **Custo por hora** (`MoneyInput`, 2 casas decimais),
  **Fator de lucro** (≥ 1) e **Cliente ativo**.
- Token: criar e regenerar devolvem o valor em claro (aparece **uma única vez**) + a URL do portal
  (`ClientTokenDialog`); regenerar invalida o anterior na hora.
- Regras: repositório precisa existir (400 `PROJECT_NOT_FOUND`); mutações auditadas
  (`ClienteOrcamento`) e publicam `orcamentos-updated { scope: "clients" }` em `private-app`.

## Portal (`/cliente`)

Fora do grupo `(app)` — **sem sidebar** (`src/app/cliente/layout.tsx`), com `robots: noindex`.

- `/cliente?t=` — **lista** (`ClienteTasksPage`): cabeçalho com o nome do cliente, **Nova tarefa**,
  **Kanban | Tabela**, Atualizar e filtros (busca, Repositório, Coluna, Prioridade, Tipo). Mesmo
  visual das Tarefas, porém **somente leitura** (sem arrastar, sem editar, sem excluir). O filtro de
  Repositório fica **limitado** aos repositórios do cliente. Cada card/linha mostra a estimativa do
  cliente (`EstimateBadge` modo `client`: `H × fator` h e `R$ faturamento`).
- `/cliente/nova?t=` — **nova tarefa** (`ClienteNovaTarefaPage`): repositório (só os permitidos) +
  **descrição** em Markdown (`MarkdownField`). Ao avançar, cria o rascunho e vai para a revisão.
- `/cliente/revisao/[draftId]?t=` — **revisão** (`ClienteRevisaoPage`): abre a prévia (IA em
  streaming) ao entrar quando ainda não houver prévia; mostra título, tipo, prioridade,
  especificação (Markdown), **prazo estimado** (`H × fator` h) e **orçamento** (R$). Botões **Gerar
  novamente**, **Solicitar correção** (texto que entra no próximo prompt) e **Aprovar tarefa** (cria
  a tarefa e volta para a lista).

## IA da prévia

- Feature **Orçamentos** em Provedores de IA (`ai_feature_settings`, `feature: "budget-preview"`),
  schema `budgetPreviewSettingsSchema` — ver `modules/ai.md`.
- `server/preview.ts`: monta a entrada e roda o `streamAi` (NDJSON em
  `POST /api/cliente/drafts/[id]/preview`); valida o JSON com Zod (`parseDraftPreview`) e grava no
  rascunho no `done`; erros viram evento `error` (rascunho vira "sem prévia válida"). Cada geração
  grava uma linha em `ai_usage_logs` (`feature: "budget-preview"`).
- `preview-prompt.ts` (puro): instruções + contrato JSON, prompt com a descrição, a correção e o
  **histórico de horas dos agentes** (injetado, **sem ferramenta** — o `streamAi` não tem tool
  calling). `estimateStats()` (`server/estimate.ts`) agrega `TimeLog.duration` por `DevTask.taskType`.

## Criação da tarefa (`server/portal.ts` → `createTaskWithIssue`)

Aprovar usa `createTaskWithIssue` (mesma rota do app: **cria a issue no GitHub antes de persistir** —
falha do GitHub bloqueia) com `origin: "client"` e o `estimate` (snapshot: horas reais, horas do
cliente, faturamento, fator, custo/hora e modelo). O rascunho vira `approved` com `taskId` e registra
auditoria (`RascunhoOrcamento`, ação `APROVAR`). A tarefa nasce na **coluna de entrada** do projeto
(`entryColumnKey`).

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
| `POST /api/cliente/drafts/[id]/preview` | Gera a prévia com IA (NDJSON) |
| `POST /api/cliente/drafts/[id]/approve` | Cria a tarefa conforme a prévia aprovada |

O token do cliente não é um **token de sistema**: o portal **não** entra na especificação OpenAPI
pública (`/api/v1/*`).

## Arquivos

- `src/features/orcamentos/` — `constants.ts`, `logic.ts` (puro: `computeClientEstimate`,
  `formatHoursLabel`), `schemas.ts`, `types.ts`, `preview-prompt.ts` (puro), `hooks/useOrcamentos.ts`,
  `components/` (editor da integração e clientes) e `portal/` (contexto, hooks, páginas e
  componentes de leitura).
- `src/app/(app)/integracoes/orcamentos/page.tsx`, `src/app/api/integrations/orcamentos/*`,
  `src/app/cliente/*` e `src/app/api/cliente/*`.
- `src/components/ui/markdown-field.tsx` — campo Markdown com barra de formatação e abas
  Escrever/Visualizar (reusado no `TaskForm` e no portal).

## Testes

`__tests__/features/orcamentos/`: `orcamentos-logic`, `orcamentos-preview-prompt`, `portal-auth`,
`orcamentos-token`, `orcamentos-clients`, `orcamentos-portal`, `markdown-field` e
`cliente-task-table`.
