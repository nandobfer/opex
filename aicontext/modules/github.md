# Módulo: Integração GitHub (`/integracoes/github`)

As **issues** dos repositórios vinculados viram **tarefas dO Opex** (o Opex é a fonte de verdade).
Código em `src/features/github/`. É uma integração normal do catálogo (`github`): token privado
(obrigatório), `apiUrl` (padrão `https://api.github.com`) e `commentOnCreate`.

## Vínculos = Projetos (`server/links.ts`)

A aba **Vínculos** liga um repositório ao Opex e **cria um Projeto** (`lib/db/models/Project.ts`).
Campos do formulário: **repositório**, **coluna de entrada**, **coluna de conclusão** (opcional) e
**sincronização ativa**. Nome e sigla saem do repositório (`projectNameFromRepo`, `siglaFromRepo`);
o código das tarefas é `{SIGLA}-{n}`. A **coluna de conclusão** é a que representa "concluído":
mover a tarefa para lá fecha a issue, e sair dela (ou fechar a issue no GitHub) sincroniza o outro
lado. Excluir uma coluna usada como entrada ou conclusão é bloqueado em `tasks/server/columns.ts`
(409 `COLUMN_IN_USE`).

- `createLink`/`updateLink`/`deleteLink`/`listLinks`; repositório único (409 `LINK_REPO_TAKEN`);
  trocar de repositório reinicia a importação inicial. Audita (`VinculoGithub`) e publica
  `github-updated { scope: "links" }`.
- A **coluna de entrada** precisa existir no quadro (`COLUMN_NOT_FOUND`). Excluir uma coluna usada
  como entrada é bloqueado em `tasks/server/columns.ts` (409 `COLUMN_IN_USE`).

## Mapeamento (`server/mappings.ts`, `logic.ts`, puro)

Regras **Issue Type/label → tipo** e **label → prioridade** (documento `default`; sem documento, os
padrões do código). `mapTaskType` (Issue Type vence label; sem regra, sem tipo) e `mapPriority` (sem
regra, média). O **mapeamento reverso** (`reverseLabels`) usa as mesmas regras: o tipo e a prioridade
da tarefa viram labels na issue (label-kind para o tipo e a primeira regra da prioridade). Não há
autores, pessoas nem produto: removidos.

## Sincronização (`server/sync.ts`, `server/task-sync.ts`)

O vínculo issue ↔ tarefa é **bidirecional com last-write-wins** ("quem foi atualizado por último
vence"). Sincroniza **título, descrição, tipo, prioridade e coluna ↔ aberta/fechada**. O
`issueUpdatedAt` do vínculo é a marca d'água do último `updated_at` conhecido da issue.

- **Tarefa → issue (imediato)**: o disparo é **centralizado no serviço de tarefas**
  (`moveTask`/`updateTask`): mover de coluna ou mudar título/descrição/tipo/prioridade empurra os
  campos para a issue (`pushTaskToIssue`) — a coluna de conclusão fecha a issue e sair dela reabre.
  Vale para **qualquer caminho** — as rotas (`PATCH /api/tasks/[id]`, `/api/tasks/[id]/move`,
  `/api/tasks/bulk`) e a **mesa de trabalho agêntica** (ao abrir, ao abrir o PR, ao concluir e ao
  reabrir). Mudanças que não refletem na issue (especificação técnica, projeto, arquivar) não
  empurram, e a sincronização vinda do GitHub (`origin: "github"`) nunca reempurra. Falha do push
  **não** derruba a mutação: grava um aviso (`notice`) no vínculo e a rotina tenta de novo.
- **Issue → tarefa (rotina)**: para cada issue alterada desde a última leitura, se ela for mais
  recente que a tarefa, aplica na tarefa (`applyIssueToTask`, reusa `updateTask`/`moveTask` com
  `origin: "github"`); se a tarefa for mais recente, empurra. Mudanças do GitHub entram no Histórico
  ("Sincronizada do GitHub: …").
- Rotina **"Sincronizar issues do GitHub"** (`github-issue-sync`, Integrações › Crons, padrão a cada
  2 min): **1ª leitura** importa as issues **abertas**; depois, só o que mudou desde `since` (+ ETag;
  304 não gasta limite).
- Issue **nova** → cria a **tarefa** na coluna de entrada (ou na coluna de conclusão, se a issue já
  vier fechada), com tipo/prioridade do mapeamento e a descrição **verbatim** (sem rodapé). Issue que
  uma tarefa do projeto **já cita** (URL, `owner/repo#N` ou `#N` — `mentionsIssue`) só ganha o vínculo.
- **Criação de tarefa** (`POST /api/tasks`, `server/task-issue.ts`): cria a issue no repositório
  escolhido **antes** de persistir a tarefa; **falha do GitHub bloqueia** a criação. O vínculo já
  nasce com a marca d'água.
- O resultado por vínculo é gravado em `Project.lastSync`; `github-updated { scope: "sync" }`.

## APIs

| Rota | Descrição |
|---|---|
| `GET/POST /api/integrations/github/links` | Lista / cria vínculo (= Projeto; inclui a coluna de conclusão) |
| `PATCH/DELETE /api/integrations/github/links/[linkId]` | Edita / remove |
| `GET/PUT /api/integrations/github/mappings` | Regras de tipo e prioridade |
| `GET /api/integrations/github/sync` | Estado da rotina e resultado por vínculo |
| `GET /api/integrations/github/repos[?refresh=1]` | Repositórios do token (cache 5 min) |
| `GET /api/integrations/github/labels` · `/issue-types` | Opções do mapeamento |

## UI (`components/GithubEditorForm.tsx`)

Abas: **Geral** (token e opções), **Vínculos** (`GithubLinksTab` + `GithubLinkDialog`), **Mapeamento**
(`GithubMappingTab`) e **Sincronização** (`GithubSyncTab`, com "Sincronizar agora" pela rota dos
Crons). As abas recarregam por `github-updated` (`useGithubRealtime`). Removidas as abas **Pessoas** e
os rascunhos descartados.

## Item de repositório compartilhado

`GithubRepoLabel` (`components/shared.tsx`) é o item único de repositório do app: **avatar real** do
GitHub (fallback para a inicial quando não há `ownerAvatarUrl`) + `owner/repo` + descrição + cadeado
quando privado. É usado pelo diálogo de vínculo e, nas tarefas, pelo filtro Repositório, pelo
seletor do formulário, pela tabela, pelo card e pelo painel lateral.

O índice `owner/repo → GithubRepoOption` vem de `useGithubRepoIndex(enabled)` (`hooks/useGithub.ts`,
sobre `useGithubRepos`, cache 5 min) e é distribuído às telas de tarefas por `RepoIndexProvider`
(`components/RepoIndexProvider.tsx`, montado no layout de `/tarefas`); `useRepoIndex()` lê o índice e
`repoLabelOption(repo, index)` devolve os dados do GitHub ou, na ausência, os do projeto (inicial).

## Testes

`__tests__/features/github/github-logic.test.ts` (leitura da issue, nome/sigla do projeto,
mapeamento direto/reverso, coluna ↔ estado e menção da issue), `task-issue.test.ts` (criação com
issue e bloqueio em falha), `github-task-sync.test.ts` (push/pull com last-write-wins),
`github-sync.test.ts` (`processIssue`) e `github-repo-label.test.tsx` (avatar real e fallback).
