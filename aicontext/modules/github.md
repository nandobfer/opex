# Módulo: GitHub (Integrações › GitHub e rascunhos de tarefas)

Liga repositórios do GitHub a produtos do Go! Sipal: **issues novas** de autores escolhidos viram
**rascunhos de tarefas** no quadro dO Opex (coluna pessoal de entrada); enviar um rascunho cria
a tarefa no Go! Sipal. Depois do envio (ou quando uma tarefa já cita a issue), issue e tarefa ficam
**vinculadas**: botão para abrir a issue, issue fechada → tarefa para Validação e tarefa em
Validação → issue fechada.

Sem webhook nem GitHub Actions: o app não é exposto à internet. Tudo é **polling** pela rotina
`github-issue-sync` dos Crons, com ETag (resposta 304 não gasta o limite de uso). Toda configuração
fica em `/integracoes/github` (sem `.env`).

## Configuração (catálogo `github`)

- Segredo **`token`** (PAT, obrigatório). Fine-grained: Issues (leitura e escrita), Contents, Pull
  requests e Metadata (leitura). Clássico: escopo `repo`.
- **URL da API** (`apiUrl`, padrão `https://api.github.com`; GHES = `https://host/api/v3`). A URL
  web dos links (commit/issue) sai de `htmlBaseOf`.
- **Comentar na issue ao criar a tarefa** (`commentOnCreate`, padrão ligado).
- Teste de conexão: `GET /user` (quem está conectado), escopos (`x-oauth-scopes`; sem `repo` →
  amarelo) e `GET /rate_limit` (≤ 100 restantes → amarelo).
- Cliente (`src/features/github/client.ts`, só servidor): `githubRequest`/`githubRequestFull`
  (ETag, `next` do `Link`, `rateRemaining`), `githubPaginate`, `githubDownload` (imagens, até 10 MB;
  token só para `github.com`). `GithubError` com `code` (`NOT_CONFIGURED`, `UNAUTHENTICATED`,
  `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `REJECTED`, `UNAVAILABLE`) → `toGithubDomainError`
  (409 `GITHUB_NOT_CONFIGURED`/`GITHUB_TOKEN_INVALID`, 403, 404, 429, 400, 502).

## Página da integração (abas)

Abas genéricas (`src/features/integrations/components/tabs/`, copiadas do Orquestrador WhatsApp do
CRM): aba na URL (`?aba=`, a padrão é omitida), troca animada e "Descartar alterações?" ao sair
de uma aba com mudanças. Sem o token, as abas (exceto Geral) mostram o aviso para cadastrá-lo.

| Aba | Conteúdo |
|---|---|
| **Geral** | Ambiente/debug, token, URL da API, comentar na issue, documentação. Rodapé Desfazer/Salvar |
| **Vínculos** | Lista (repo → produto, autores, coluna de entrada, padrões, última leitura, rascunhos pendentes). Novo/Editar (`GithubLinkDialog`) e Remover (`RemoveLinkDialog`) |
| **Mapeamento** | Regras de tipo e de prioridade (`useFieldArray`), "Valores iniciais", Desfazer/Salvar |
| **Pessoas** | Login do GitHub → desenvolvedor do Go! Sipal; "Buscar no GitHub", "Sugerir correspondências", aceitar uma/todas; filtro Todas/Sem correspondência/Com sugestão. Selo com quantos faltam |
| **Sincronização** | Estado da rotina, "Sincronizar agora" (rota dos Crons), resultado por vínculo e **Rascunhos descartados** (busca + Restaurar) |

Seletores com busca: `SearchPicker` (`src/components/ui/search-picker.tsx`) para repositório (lista
do token, cache de 5 min), produto (sugerido pelo `repositoryUrl`; o já vinculado a outro repo fica
desabilitado), autores (vários, chips; conhecidos + busca no GitHub com 2+ letras), coluna de entrada
(só pessoais) e desenvolvedor. Labels e Issue Types aparecem como sugestões (`datalist`), aceitando
valor livre. Tempo real: `github-updated { scope }` em `private-integration-github`
(`useGithubRealtime`).

## Vínculos (`github_repo_links`)

- `{ repo (owner/name, minúsculas), productId, productName, authors[], entryColumnKey, defaultType,
  defaultPriority, enabled }` + cursor (`initialImportAt`, `since`, `etag`) e `lastSync`.
- **Um para um**: índice único em `repo` e em `productId` (409 `LINK_REPO_TAKEN` /
  `LINK_PRODUCT_TAKEN`). Assim `#N` numa tarefa do produto é sempre deste repositório.
- Coluna de entrada só **pessoal** (`custom-…`); excluir uma coluna usada por um vínculo → 409
  `COLUMN_IN_USE` (e coluna com rascunhos → 409 `COLUMN_NOT_EMPTY`).
- Editar com outro repositório ou autores novos recomeça pela importação das issues abertas. Trocar
  o produto leva os rascunhos pendentes para o novo produto.
- Remover com rascunhos pendentes pergunta **Manter** (continuam enviáveis, sem atualizar pela issue)
  ou **Descartar**. Auditoria `VinculoGithub`.

## Mapeamento issue → tarefa

| Issue | Tarefa (Go! Sipal) | Regra |
|---|---|---|
| `title` | Título | Direto |
| `body` | Descrição | Corpo + rodapé `---\nIssue: <url>\nAberta por Nome (@login) em dd/MM/yyyy` (`buildTaskDescription`) |
| Issue Type, depois labels | Tipo | `typeRules` (Issue Type vale mais; entre labels, a primeira regra que casar); sem regra → padrão do vínculo |
| labels | Prioridade | `priorityRules` (primeira que casar); sem regra → padrão do vínculo |
| `assignees` | Responsável | Primeiro assignee com pessoa mapeada (aba Pessoas); sem nenhum → sem responsável |
| `milestone` | Pacote de trabalho | Pacote do produto com o mesmo nome (sem caixa/acento) |
| imagens do corpo | Anexos | No envio (ver abaixo) |
| checklists, comentários | — | Ficam na descrição / aparecem só na página do rascunho (a plataforma não aceita critérios de aceite pela API) |

Valores iniciais (`DEFAULT_TYPE_RULES`/`DEFAULT_PRIORITY_RULES` em `logic.ts`): `Bug`/`bug` →
Correção, `Feature`/`enhancement`/`feature` → Nova Funcionalidade, `Task`/`documentation`/
`analysis` → Análise, `test`/`testing` → Testes, `ci`/`devops`/`infra` → DevOps, `automation` →
Automação; `urgent`/`P0`/`priority: critical` → Urgente, `P1`/`priority: high` → Alta, `P2`/
`priority: medium` → Média, `P3`/`priority: low` → Baixa. Cada campo guarda a **origem**
(`origins`, ex.: `label "bug"`) mostrada no rascunho. Salvar o mapeamento ou mudar pessoas
reaplica nos rascunhos pendentes (`remapPendingDrafts`), sem tocar nos campos editados.

## Pessoas (`github_people`)

- `{ login, name, avatarUrl, email, developerId, developerName, suggestion, repos[] }`. Autores e
  assignees vistos pela rotina entram sozinhos como "sem correspondência".
- "Buscar no GitHub": `GET /repos/{repo}/assignees` de cada vínculo + autores, e o perfil público
  (`GET /users/{login}`) de quem ainda não tem nome.
- Sugestão (`suggestDeveloper`): e-mail público igual → nome completo igual → primeiro + último
  nome (único) → login parecido com o e-mail. Fica pendente até aceitar. Auditoria `PessoaGithub`.

## Rotina `github-issue-sync` (`server/sync.ts`)

Interna nos Crons, padrão **a cada 2 min**. Pula sem token do GitHub ou sem sessão do Go! Sipal.
Para cada vínculo ativo:

1. **1ª execução**: `GET /repos/{repo}/issues?state=open` (até 10 páginas) — importa as abertas.
2. Depois: `?state=all&sort=updated&direction=asc&since=<cursor>` com `If-None-Match` (304 = nada).
   PRs (`pull_request`) são ignorados.
3. Cada issue (`processIssue`):
   - **já vinculada a uma tarefa**: atualiza o estado; se acabou de fechar → "Issue fechada"
     (abaixo);
   - **tem rascunho** (pendente, enviado ou descartado): atualiza os campos da issue e reaplica o
     mapeamento só no que não foi editado; issue fechada só marca o rascunho (selo "issue
     fechada"). **Rascunho descartado nunca é recriado**;
   - **nova**, de autor configurado e aberta: se uma tarefa do produto (`GET
     /api/dev-center/tasks?productId=…&includeArchived=true`) já cita a issue (`mentionsIssue`: URL,
     `owner/repo#N` ou `#N` — `#999` não casa com `#9990` nem com âncoras de Markdown como
     `[Seção](#9-titulo)`, comuns em sumários de especificações) → só grava o vínculo (`detected`); senão
     cria o rascunho na coluna de entrada.
4. Registra `lastSync` por vínculo, tenta de novo as issues fechadas "aguardando commit" e fecha as
   issues das tarefas que chegaram em Validação direto no Go! Sipal. Avisa o quadro
   (`tasks-updated`) e a integração (`github-updated`).

## Rascunhos (`task_drafts`)

- Únicos por `repo + number`. Estado `draft` → `sending` → `sent` (com `goTaskId`/`goTaskCode`) ou
  `discarded`. Campos da issue (`issueTitle`, `issueBody`, labels, Issue Type, milestone,
  assignees, estado) separados dos valores do rascunho; `edited[]` diz o que foi editado à mão.
- No quadro (`listBoardDrafts`, somado em `listTasks`): tarefa com id `draft-{id}`, código
  `repo#N`, `localColumn` = coluna do rascunho e `draft`/`issue` preenchidos (ver `modules/tasks.md`).
- `server/drafts.ts`: `updateDraft` (edita e marca editado; `restore` volta ao valor da issue),
  `moveDraft` (só colunas pessoais), `discardDraft`/`restoreDraft` (volta para a coluna em que
  estava ou a de entrada), `getDraftDetail` (com prévia das imagens por URLs assinadas do
  `body_html`, comentários da issue e pacotes do produto) e `sendDraft`.
- **Envio** (`sendDraft`, status Backlog/Priorizado/Especificação/Desenvolvimento — os únicos em que
  a plataforma cria):
  1. aplica os valores do modal (viram editados) e grava `sending`;
  2. `POST /api/dev-center/tasks` com título, descrição (com o rodapé), produto, status, tipo,
     prioridade, responsável e pacote;
  3. imagens do GitHub no corpo (`extractIssueImages`) são baixadas (URLs assinadas do `body_html`
     quando as quantidades batem; 4 por vez; até 10 MB) e enviadas como anexo
     (`issue-{N}-imagem-{i}.{ext}`); a descrição troca cada uma por `📎 Imagem i (anexo …)` (`PUT`).
     Falha numa imagem mantém o link original;
  4. comenta na issue ("Tarefa **GO-DEV-x** criada no Go! Sipal: link"), se ligado;
  5. grava `sent` e o vínculo issue ↔ tarefa (`source: "draft"`).
  - **Sem duplicar**: sem resposta do Go! Sipal (`UNAVAILABLE`) o rascunho fica `sending`; a nova
    tentativa procura no produto a tarefa que cita a issue e a adota. Recusa (4xx) volta para `draft`.
- Auditoria `RascunhoTarefa` (`ATUALIZAR`/`ATRIBUIR`, `MOVER`, `EXCLUIR` = descartar, `CRIAR` = envio).

## Issue ↔ tarefa (`github_issue_links`, `server/issue-links.ts`)

- `{ repo, number, url, goTaskId, goTaskCode, source: draft|detected, issueState,
  issueStateReason, pendingCommitUntil, notice }`. `listTasks`/`getTask` juntam `issue` às tarefas
  vinculadas (`issueRefsFor`) → botão "Abrir issue" e aviso (`notice`) no card/linha/página.
- **Issue fechada** (`handleClosedIssue`), só se a tarefa estiver em **Desenvolvimento**:
  - `not_planned` → não move; aviso "Issue fechada como não planejada";
  - tipos sem código → Validação sem commit;
  - senão procura o commit (`resolveIssueCommit` + `planIssueCommit` na timeline): 1) commit que
    fechou a issue; 2) PR mergeado que cita a issue (commit de merge); 3) último commit que cita
    `#N`; 4) último PR que cita a issue (último commit dele). Commit vindo de PR leva também o
    `pullRequestUrl`. Move com `moveTask(..., "github", { skipIssueSync: true })`;
  - sem commit → `pendingCommitUntil` (+24 h) e aviso "aguardando o commit"; a rotina tenta de novo;
    vencido, aviso para mover à mão.
- **Tarefa em Validação (ou além) → fecha a issue** (`PATCH state=closed, state_reason=completed`):
  depois de `moveTask` (tela, lote) via `onTaskStatusChanged` (nunca lança) e, para movimentos feitos
  no Go! Sipal, nas rotinas `go-sipal-task-sync` e `github-issue-sync`
  (`closeIssuesOfValidatedTasks`). Issue já fechada é ignorada — sem laço entre os dois sentidos.

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/integrations/github/repos[?refresh=1]` | Repositórios do token |
| `GET /api/integrations/github/users?q=` | Pessoas conhecidas + busca no GitHub |
| `GET /api/integrations/github/labels` · `/issue-types` | Labels e Issue Types dos vinculados |
| `GET /api/integrations/github/products` | Produtos com `repo` sugerido e `linkedRepo` |
| `GET/POST /api/integrations/github/links` · `PATCH/DELETE …/links/[linkId]` | Vínculos (`DELETE` com `{ drafts: keep\|discard }`) |
| `GET/PUT /api/integrations/github/mappings` | Regras de tipo/prioridade |
| `GET/POST /api/integrations/github/people` · `PATCH …/people/[login]` | Lista / buscar no GitHub / ligar ao desenvolvedor |
| `POST/PUT /api/integrations/github/people/suggestions` | Sugerir / aceitar (`{ logins }`) |
| `GET /api/integrations/github/sync` | Rotina + resultado por vínculo |
| `GET /api/integrations/github/drafts` | Rascunhos descartados |
| `GET/PATCH /api/tasks/drafts/[id]` | Detalhe / edição (`updateDraftSchema`) |
| `POST /api/tasks/drafts/[id]/send` · `/discard` · `/restore` | Enviar (`sendDraftSchema`), descartar, restaurar |
| `POST /api/integrations/crons/jobs/github-issue-sync/run` | "Sincronizar agora" |

## Testes

`__tests__/features/github/` (`github-logic`, `github-drafts`, `github-people`),
`__tests__/features/tasks/task-drafts.test.ts`, casos de rascunho em `task-move-flow.test.tsx` e
`COLUMN_IN_USE` em `task-columns.test.ts`. GitHub e Go! Sipal sempre simulados; coleções em memória
em `__tests__/helpers/memory-model.ts`.
