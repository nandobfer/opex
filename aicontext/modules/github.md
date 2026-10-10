# Módulo: Integração GitHub (`/integracoes/github`)

As **issues** dos repositórios vinculados viram **tarefas dO Opex** (o Opex é a fonte de verdade).
Código em `src/features/github/`. É uma integração normal do catálogo (`github`): token privado
(obrigatório), `apiUrl` (padrão `https://api.github.com`) e `commentOnCreate`.

## Vínculos = Projetos (`server/links.ts`)

A aba **Vínculos** liga um repositório ao Opex e **cria um Projeto** (`lib/db/models/Project.ts`).
Campos do formulário: **repositório**, **coluna de entrada** e **sincronização ativa**. Nome e sigla
saem do repositório (`projectNameFromRepo`, `siglaFromRepo`); o código das tarefas é `{SIGLA}-{n}`.

- `createLink`/`updateLink`/`deleteLink`/`listLinks`; repositório único (409 `LINK_REPO_TAKEN`);
  trocar de repositório reinicia a importação inicial. Audita (`VinculoGithub`) e publica
  `github-updated { scope: "links" }`.
- A **coluna de entrada** precisa existir no quadro (`COLUMN_NOT_FOUND`). Excluir uma coluna usada
  como entrada é bloqueado em `tasks/server/columns.ts` (409 `COLUMN_IN_USE`).

## Mapeamento (`server/mappings.ts`, `logic.ts`, puro)

Regras **Issue Type/label → tipo** e **label → prioridade** (documento `default`; sem documento, os
padrões do código). `mapTaskType` (Issue Type vence label; sem regra, sem tipo) e `mapPriority` (sem
regra, média). Não há autores, pessoas nem produto: removidos.

## Sincronização (`server/sync.ts`)

Rotina **"Sincronizar issues do GitHub"** (`github-issue-sync`, Integrações › Crons, padrão a cada
2 min). Para cada Projeto ativo:

- **1ª leitura**: importa as issues **abertas**; depois, só o que mudou desde `since` (+ ETag; 304
  não gasta limite).
- Issue **nova** → cria a **tarefa** na coluna de entrada, com tipo/prioridade do mapeamento e a
  descrição do corpo + rodapé (`buildTaskDescription`). Sem etapa de rascunho.
- Issue que uma tarefa do projeto **já cita** (URL, `owner/repo#N` ou `#N` — `mentionsIssue`) só
  ganha o **vínculo** (`github_issue_links`), sem criar tarefa.
- Issue que muda de estado atualiza o vínculo (`updateIssueState`); a coluna da tarefa **não** muda
  sozinha (sem transições automáticas).
- O resultado por vínculo é gravado em `Project.lastSync`; `github-updated { scope: "sync" }`.

O vínculo issue ↔ tarefa (`server/issue-links.ts`) é **informativo**: alimenta o botão "Abrir issue"
no card/tabela/página e o dedupe da sincronização.

## APIs

| Rota | Descrição |
|---|---|
| `GET/POST /api/integrations/github/links` | Lista / cria vínculo (= Projeto) |
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

## Testes

`__tests__/features/github/github-logic.test.ts` (leitura da issue, nome/sigla do projeto,
mapeamento e menção da issue).
