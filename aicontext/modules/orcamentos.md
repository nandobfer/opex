# Módulo: Orçamentos (clientes e portal do cliente)

Integração **Clientes** (`orcamentos`, rota `/integracoes/clientes`): o dono cadastra **clientes** e
cada cliente ganha um **usuário padrão** e uma **URL** para um **portal próprio**, agora **autenticado
por sessão** (`/cliente`) com **sidebar** (Dashboard, Tarefas e, para o **admin** do cliente,
Financeiro e Usuários). O cliente acompanha as tarefas que solicitou (quase todo somente leitura — a
edição do cliente é a **prioridade**), pode **enviar uma nova tarefa** (a IA gera prévia, tags e
estimativa, que ele aprova ou corrige) e, sendo admin, vê o **custo** e gere **usuários**.

Logins e sessões: `aicontext/modules/auth.md`.

## Papéis e terminologia

- **Dono**: vê **"Faturamento"** e as **horas reais**; administra todos os clientes e usuários.
- **Cliente**: vê **"Custo"**; as horas são sempre **infladas** (`H × fator de lucro`) e o
  `custo = horas infladas × custo/hora`. Nunca vê horas reais, fator, custo/hora, modelo de IA,
  histórico interno ou horas apontadas.
- **Não-admin do cliente**: vê apenas as horas infladas — **nenhum valor em R$**; o menu **Financeiro**
  e a aba **Usuários** ficam ocultos e as rotas correspondentes são bloqueadas no servidor.
- **Admin do cliente**: vê o custo e a aba Usuários (CRUD dos usuários do cliente).

## Modelos

- `OrcamentoClient` (`orcamento_clients`): `{ name, token, tokenHash, tokenPrefix, projectIds[],
  hourlyRate, profitFactor, active }`. Os **repositórios são opcionais** (`projectIds` pode ficar vazio).
  O **token** (`cli_…`) é gravado em claro (`token`) para montar a
  **URL copiável**; a autenticação usa o **hash SHA-256** (`tokenHash`) e o **prefixo visível**
  (`tokenPrefix`).
- `User` (`users`, `src/lib/db/models/User.ts`): usuários **globais** de cliente —
  `{ username (único), email (único quando presente), passwordHash (scrypt; nulo = só entra por URL),
  memberships: [{ clientId, admin }], token/tokenHash/tokenPrefix, defaultForClientId, active }`.
  A flag **admin é por vínculo**. O **usuário padrão** (`defaultForClientId` preenchido) não guarda
  token próprio: entra pelo **token do cliente**.
- `OrcamentoDraft` (`orcamento_drafts`): `{ clientId, estimateClientId, projectId, description,
  correction, preview, estimatedHours, model, status, taskId }`. `clientId` identifica o **dono do
  rascunho**: preenchido = pedido pelo cliente; `null` = prévia do dono em `/tarefas/previa`.
  `estimateClientId` é o cliente **opcional** que o dono escolhe só para o **cálculo do custo**.
- `DevTask.estimate` (subdocumento; `null` = ainda não estimada, independe de cliente): `{ hours,
  clientHours, billingBrl, factor, hourlyRate, model, generatedAt }` — **snapshot** gravado na
  aprovação do portal, na edição manual das horas, na estimativa por IA ou ao definir/trocar o cliente
  da tarefa (sem cliente: fator 1, custo 0, só as horas reais). Mudar fator/custo/hora **não**
  recalcula tarefas antigas.
- `DevTask.clientId`: o cliente de orçamento da tarefa (`null` = sem cliente) — define a lista do
  portal. Ver `aicontext/modules/tasks.md`.

## Usuários de cliente (`server/users.ts`)

- Todo cliente **nasce com o usuário padrão**: `username = slug(name)` (sufixo **alfabético curto** em
  colisão), `memberships = [{ clientId, admin: true }]`, **sem email e sem senha**, entrando pela URL
  do cliente. Editável depois (email/senha/username) pelo dono e pelo admin do cliente.
- **Senha** com scrypt (`src/features/auth/server/password.ts`), **sem regra mínima** e **sem
  "esqueci a senha"** (o dono/admin redefine). Email é **opcional** e único quando presente.
- **URL por usuário**: cada usuário tem token próprio (`usr_…`) e **Copiar URL**; regenerar invalida o
  anterior na hora. O **usuário padrão** usa o token do cliente — regenerá-lo é feito na aba **Token**
  do cliente (e é **recusado** na lista de usuários).
- **Regras de gestão**:
  - o **dono** gerencia tudo (credenciais globais, vínculos e tokens);
  - o **admin do cliente** gerencia o próprio vínculo e usuários **exclusivos** do cliente; usuário
    **compartilhado** com outro cliente é somente leitura para ele (`SHARED_USER`);
  - excluir remove o **vínculo**; sem outros vínculos o usuário é **excluído**. O **padrão não pode ser
    excluído** aqui (`DEFAULT_USER`) — só na exclusão do cliente.

## Clientes (tela `/integracoes/clientes`)

- Aba **Clientes**: a lista mostra um **card por cliente**; o **card inteiro é um link** para a página
  de configuração e mantém apenas o botão **Copiar URL** (a URL do **usuário padrão** = token do
  cliente).
- **Página de configuração** (`/integracoes/clientes/[clientId]`) com abas:
  - **Configurações** — dados do cliente (custo/hora, fator, repositórios, situação), **Editar**
    (`ClienteDialog`) e a **zona de risco** com **Excluir** (`RemoveClienteDialog`);
  - **Usuários** — lista + criação/edição/exclusão/copiar URL/regenerar (mesmos componentes do portal);
  - **Token** — prefixo, **Copiar URL** e **Regenerar token** (com aviso: invalida a URL do cliente e
    do usuário padrão).
- **Pré-visualizar portal** no cabeçalho: entra no portal como o cliente (cookie de prévia).
- **Repositórios opcionais**: o cliente pode ser criado e editado **sem nenhum repositório**
  vinculado — útil para configurar o cliente antes de ter acesso aos repositórios dele. Sem vínculo, o
  portal apenas não mostra tarefas (a lista e a página de configuração orientam a vincular um).
- Regras: os repositórios escolhidos, **se houver algum**, precisam existir (`PROJECT_NOT_FOUND`);
  mutações auditadas (`ClienteOrcamento`) e publicam `orcamentos-updated { scope }` em `private-app`.

## Portal (`/cliente`)

- **Entrada** `/cliente`: com `?t=` redireciona para o handler que troca o token por sessão; com
  sessão de cliente e cliente selecionado vai direto ao dashboard; com vários clientes (ou sem
  seleção) ou como **dono** mostra a **escolha de cliente**.
- **Layout autenticado** (`src/app/cliente/(portal)/`): reusa o `AppShell` com a navegação do portal
  (`clienteNav`) — **Dashboard, Tarefas** e, para o admin, **Financeiro e Usuários** — e a **barra de
  contexto** (`ClienteContextBar`): seletor de cliente (troca sem novo login), aviso de
  pré-visualização e atalho de volta ao Opex. Sem itens internos do dono.
- Rotas: `/cliente/dashboard`, `/cliente/tarefas`, `/cliente/tarefa/[id]`, `/cliente/nova`,
  `/cliente/revisao/[draftId]`, `/cliente/financeiro` (admin), `/cliente/usuarios` (admin) e, para o
  **admin**, `/cliente/servicos/[id]` (detalhe de um serviço criado pelo dono).
- **Tarefas**: mesma visão de antes (kanban/tabela somente leitura, **exceto a prioridade**), com
  "Custo" no lugar de "Faturamento". Cada card/linha leva à página da tarefa. O filtro **Repositório**
  lista as opções **por uso recente do usuário** (ver `modules/repository-recency.md`); adicionar um
  repositório registra o uso. No **celular** o
  cabeçalho empilha as ações em linhas inteiras (o atalho de criação, o seletor Kanban/Tabela e
  **Atualizar**), o kanban usa a largura da tela por coluna e a **tabela vira cartões empilhados**
  (mesmo ajuste da tela do dono, sem revelar dados internos).
- **Atalho de criação**: Tarefas e Dashboard usam o **mesmo** botão (`ClienteTaskCreationButton`), que
  abre `/cliente/nova`. No Dashboard ele aparece como **"Nova prévia"** (`outline`, ícone `Sparkles`)
  e em Tarefas como **"Nova tarefa"** (`default`, ícone `Plus`) — só o rótulo e o estilo mudam, a
  navegação é a mesma. O atalho **não** depende de repositório liberado: quem não tem repositório
  segue para a página de criação, onde recebe a orientação (o portal não tem criação manual de
  tarefa; tudo começa pela prévia por IA). O seletor de **Repositório** de `/cliente/nova` lista as
  opções **por uso recente do usuário** (`modules/repository-recency.md`).
- **Página da tarefa**: detalhes equivalentes aos do dono, **exceto Histórico e Horas apontadas**;
  abas Descrição, Especificação técnica, **Anexos** e Comentários; coluna lateral com prioridade
  editável e a estimativa do cliente (só `H × fator` e o custo). O **autor** dos comentários/ações é o
  **usuário** (não o nome do cliente); em pré-visualização, o dono.
- **Tempo real**: canal privado `private-client-{clientId}` (`src/lib/pusher/channel-auth.ts`).
  Eventos publicados **só pelo servidor**, depois da mutação e da auditoria; o cliente invalida as
  tarefas (`useClienteRealtime`). O dono (e a sincronização do GitHub) publica nos canais dos clientes
  afetados.
- Sem tokens nas URLs internas: as telas usam o **cookie de sessão** (axios do portal com
  `x-client-id`, usado na pré-visualização do dono).

## Anexos no portal

Os anexos são os **mesmos** do dono (`modules/tasks.md`, "Anexos da tarefa") e usam as rotas
compartilhadas `/api/attachments/**`. O middleware libera esse prefixo para a sessão de cliente e a
rota resolve o ator (`resolveAttachmentActor`): cliente → `clientId` do vínculo; dono → tudo. As
regras do portal:

- **Ver e baixar**: o cliente alcança os anexos **do cliente dele** (`clientId` do anexo = cliente
da tarefa ou o do próprio envio). Um anexo de outro cliente responde 404 (não revela existência).
- **Enviar**: o cliente envia na **aba Anexos** da tarefa (`/cliente/tarefa/[id]`) e no formulário de
  **Nova tarefa** (`/cliente/nova`) — neste último os arquivos ficam pendentes e são vinculados ao
  **rascunho** (`attachmentIds` no `POST /api/cliente/drafts`); ao aprovar a prévia eles passam para a
  tarefa criada (`moveAttachmentsToTask`).
- **Excluir**: o portal **não** exclui anexo vinculado. O cliente só remove o que ele mesmo enviou e
  ainda não foi vinculado (na prática, antes de salvar a nova tarefa). Mídia **colada** na descrição
  entra pela mesma fila (`MarkdownField.uploads`) e, portanto, no mesmo rascunho — e o formulário
  **não salva** enquanto houver envio em andamento.
- **Serviços**: os anexos de um **serviço** (`serviceId`) usam as mesmas rotas; o cliente os vê e
  baixa no detalhe `/cliente/servicos/[id]`. A leitura **revalida** o serviço no estado atual:
  arquivar o serviço ou trocar o cliente bloqueia o acesso na hora (`modules/services.md`).
- **Tempo real**: o dono publica `cliente-tasks-updated` no canal do cliente quando os anexos mudam; a
  tela invalida a lista (também ao reconectar).

## Dashboard e Financeiro do cliente

As duas telas do portal **reutilizam a apresentação** do dono (cabeçalho, KPIs, gráficos e o kit de
listas) — os componentes visuais vêm de `src/features/dashboard/` e `src/features/finance/`, só as
consultas e os DTOs são próprios do portal (autorizados e recortados pelo cliente).

- **Dashboard** (`GET /api/cliente/dashboard?from&to&timeZone`): KPIs de tarefas do cliente (ativas,
  criadas e concluídas no período — conclusão derivada da auditoria, colunas de conclusão do GitHub) e
  o bloco **Visão geral de tarefas** com os **mesmos gráficos** do dono: rosca **Por coluna** (cores do
  quadro), barras **Por tipo**, barras ranqueadas **Por projeto** e a linha **Criadas × concluídas**.
  Única diferença: o cartão **Por tipo** conta as **tags** da tarefa (com "Sem tags" para as não
  classificadas), não o tipo — o rótulo da tag é resolvido no servidor pela taxonomia
  (`resolveTagViews`); cada tag conta uma vez por tarefa, então uma tarefa com várias tags aparece em
  várias barras. Para o **admin** entram os KPIs de **Custo** e **Horas** e o bloco **Financeiro**
  (custo por repositório, evolução mensal e horas por repositório), sempre com as horas **infladas**.
  **Sem** horas agênticas, custo de IA ou mesas. Período: as **mesmas opções** do dono
  (`features/dashboard/period.ts` — 7/30/90 dias ou mês atual, padrão 30 dias), persistidas com chave
  própria do portal (`opex:cliente:dashboard:period:v1`); o fuso IANA do navegador define os buckets.
- **Financeiro** (`GET /api/cliente/financeiro?from&to&projectIds`, admin): **custo** das tarefas
  concluídas **e dos serviços criados pelo dono**, agrupado por **repositório** (serviço sem
  repositório → "Sem repositório"), no **mesmo padrão** do Financeiro do dono — filtros no
  `ListFilters` (Período com `PresetDateRangeFilter` e Repositórios com `CadastroMultiSelect`), com
  `from`/`to`/`projectIds` na **URL** (`useUrlFilters`, padrão mês corrente), cartão de totais (Custo,
  Horas, Tarefas e **Serviços**), botão Atualizar e grupos **expansíveis**. Usa o snapshot
  (`clientHours`/`billingBrl`) e reusa a regra de conclusão do Financeiro do dono
  (`completionTimestamps`). Nunca expõe horas reais, fator ou custo por hora. O **detalhe de um
  serviço** (`/cliente/servicos/[id]`, admin, `GET /api/cliente/servicos/[id]`) mostra descrição,
  anexos e custo/horas infladas. Período ou fuso inválido → **400** (`validationError`).
- **Usuários** (`/cliente/usuarios`, admin): CRUD dos usuários do cliente (mesmos componentes do dono),
  com as regras de permissão acima.

## Prioridade do cliente

O cliente **edita a prioridade** das tarefas que solicitou, nos mesmos três pontos onde o dono edita:
**revisão da prévia** (aplicada ao aprovar), **página da tarefa** e **tabela da lista**. O portal chama
`PATCH /api/cliente/tasks/[id]` (`setClientTaskPriority`), que valida a posse (`TASK_NOT_FOUND`),
**reusa o `updateTask`** com `origin: "client"`, grava auditoria (`Tarefa`, ator = **usuário**),
publica `tasks-updated` e empurra a prioridade para a issue do GitHub. No cliente as mutações são
**otimistas** (TanStack Query) com reversão e toast.

## IA em duas fases

- **Fase 1 — prévia** (`POST /api/cliente/drafts/[id]/preview`), feature **Orçamentos**: monta a
  entrada, roda o `streamAi` (NDJSON), valida o JSON com Zod (`parseDraftPreview`) e grava `preview`
  (zerando horas e tags). A saída inclui `clarity` (critérios de aceite e localização), **transitória**
  (não persistida) e usada pelo `ClarityCard`.
- **Fase 2 — estimativa** (`POST /api/cliente/drafts/[id]/estimate`), feature **Estimar prazos**:
  exige a prévia, garante as tags, busca **tarefas semelhantes** por tags (fallback por tipo/projeto,
  só com horas reais apontadas) e faz **uma única chamada** ancorada na mediana do histórico. Grava as
  horas **e o modelo** (`H × fator × custo/hora`).
- Cada geração grava uma linha em `ai_usage_logs`.

## Criação da tarefa (`server/portal.ts` → `createTaskWithIssue`)

Aprovar exige a **prévia** (`DRAFT_WITHOUT_PREVIEW`) e usa `createTaskWithIssue` (**cria a issue no
GitHub antes de persistir** — falha do GitHub bloqueia) com `origin: "client"` e o `clientId` do
cliente, além das **tags** do rascunho. Quando há estimativa, envia o `estimate` (snapshot). O
rascunho vira `approved` com `taskId` e registra auditoria (`RascunhoOrcamento`). A tarefa nasce na
**coluna de entrada** do projeto.

## Migração

A migração `backfill-client-users` (roda no `dbConnect()`, idempotente) cria o **usuário padrão** de
cada cliente existente, preservando os **tokens/URLs** já em uso. Tarefas pedidas antes da marcação por
`clientId` são retroalimentadas por `backfill-task-client-id`.

## APIs

| Rota | Descrição |
|---|---|
| `GET/POST /api/integrations/orcamentos/clients` | Lista / cria cliente (POST devolve o token) |
| `GET/PATCH/DELETE /api/integrations/orcamentos/clients/[id]` | Detalhe / edita / exclui o cliente |
| `POST /api/integrations/orcamentos/clients/[id]/token` | Regenera o token do cliente (invalida o anterior) |
| `GET/POST /api/integrations/orcamentos/clients/[id]/users` | Lista / cria usuário do cliente (dono) |
| `PATCH/DELETE .../clients/[id]/users/[userId]` | Edita / remove o vínculo do usuário (dono) |
| `POST .../clients/[id]/users/[userId]/token` | Regenera o token próprio do usuário (dono) |
| `GET /api/cliente/session` | Cliente selecionado, usuário, papel e clientes do usuário |
| `GET /api/cliente/options` | Nome do cliente, repositórios permitidos e quadro |
| `GET /api/cliente/tasks[?includeArchived=true]` | Tarefas que o cliente solicitou |
| `GET /api/cliente/tasks/[id]` | Detalhe na visão do cliente |
| `GET/POST /api/cliente/repo-recents` | Repositórios usados recentemente pelo usuário (ver `modules/repository-recency.md`) |
| `PATCH /api/cliente/tasks/[id]` | Prioridade da própria tarefa (`{ priority }`) |
| `POST /api/cliente/tasks/[id]/comments` | Comentário do usuário do portal |
| `GET /api/cliente/dashboard?from&to&timeZone` | Distribuições de tarefas (custo e horas só para admin) |
| `GET /api/cliente/financeiro?from&to&projectIds` | Custo por repositório (admin) — tarefas **e serviços** |
| `GET /api/cliente/servicos/[id]` | Detalhe de um serviço (admin): descrição, anexos e custo |
| `GET/POST /api/cliente/usuarios` | Lista / cria usuário (admin do cliente) |
| `PATCH/DELETE /api/cliente/usuarios/[id]` | Edita / remove vínculo (admin do cliente) |
| `POST /api/cliente/usuarios/[id]/token` | Regenera o token próprio (admin do cliente) |
| `POST /api/cliente/drafts` · `GET .../[id]` · `.../correction` · `.../preview` · `.../estimate` · `.../approve` | Rascunho, prévia e aprovação |

Como o portal é autenticado por **sessão**, ele **não** entra na especificação OpenAPI pública
(`/api/v1/*`). A **prévia do dono** continua nos endpoints internos `/api/tasks/drafts/**`.

## Arquivos

- `src/features/orcamentos/` — `constants.ts` (caminhos e vocabulário, `CLIENTE_COST_LABEL`),
  `logic.ts` (puro: `computeClientEstimate`, `formatHoursLabel`, `usernameFromName`,
  `randomUsernameSuffix`), `clarity.ts`, `schemas.ts`, `types.ts` (DTOs incl. `ClienteUserDto`,
  `ClienteSessionDto`, `ClienteFinanceDto`, `ClienteServiceDto`, `ClienteDashboardDto`),
  `preview-prompt.ts`, `review.ts`, hooks, `server/{clients,drafts,users,token,portal,owner,preview,similar,tag-views,estimate-hours,
  portal-dashboard,portal-aggregate,portal-finance,portal-services}.ts`, `components/` (editor, clientes, **users/**
  compartilhado) e `portal/` (contexto de sessão, shell, picker, páginas Dashboard/Tarefas/Financeiro/
  Usuários/**Serviço**, `period.ts`, `useClientePeriod.ts`, `filters.ts`, `components/`).
- `src/app/cliente/(portal)/**` (layout autenticado e sub-rotas) e `src/app/cliente/page.tsx`
  (entrada); `src/app/api/cliente/**`; `src/app/(app)/integracoes/clientes/[clientId]/page.tsx`.
- `src/lib/db/models/User.ts` e `src/lib/db/migrations/backfill-client-users.ts`.

## Testes

`__tests__/features/orcamentos/`: `orcamentos-logic`, `orcamentos-preview-prompt`, `orcamentos-clarity`,
`clarity-card`, `portal-auth`, `orcamentos-token`, `orcamentos-clients`, `orcamentos-portal`,
`orcamentos-estimate`, `orcamentos-owner-preview`, `orcamentos-review-view`, `orcamentos-similar`,
**`users-service`** (usuário padrão, colisão de username, email duplicado, permissões de vínculo,
padrão não excluível), **`portal-cost`** (custo por repositório), **`portal-period`** (período/marca do
portal e filtros do financeiro), **`portal-dashboard`** (agregações puras: tags e resumo financeiro),
**repositórios usados recentemente** do portal em `__tests__/features/repository-recency/`
(`modules/repository-recency.md`),
**`cliente-dashboard-page`** e **`cliente-finance-page`** (apresentação compartilhada com o dono),
**`cliente-task-creation-button`** (botão de criação compartilhado por Tarefas/Dashboard),
**`cliente-tasks-page`** (tela de Tarefas), `cliente-*` (cards/listas/detalhe), `cliente-dialog`,
`copy-portal-url`, `markdown-field`.
