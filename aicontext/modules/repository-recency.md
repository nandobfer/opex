# Módulo: Repositórios usados recentemente

Ordenação dos seletores de **repositório** por "selecionado recentemente", compartilhada pelas telas
do mesmo ator. Vale para os **filtros de Tarefas**, o **formulário de tarefa** (`/tarefas/nova` e a
edição inline) e o **formulário de prévia** — no app do **dono** e no **portal do cliente**.

O histórico é **por ator** (o dono ou o usuário do portal), guardado no **servidor** e compartilhado
entre os navegadores e dispositivos do mesmo ator. Ele só define a **ordem** das opções: nunca concede
acesso nem acrescenta repositórios à lista de um seletor.

## Modelo

`RepositorySelection` (`repository_selections`, `src/lib/db/models/RepositorySelection.ts`):
`{ actorId, projectId, lastSelectedAt }`, com índice **único** em (`actorId`, `projectId`).

- `actorId` é a **identidade confiável resolvida no servidor**: `LOCAL_USER_ID` (`local`) para o dono
  e o id do usuário para o portal. Nunca vem do navegador.
- Cada escolha faz **upsert** (só atualiza `lastSelectedAt`); não há histórico de eventos nem
  auditoria — é preferência de interface, não mutação de negócio.
- Não há migração: o histórico começa vazio (sem histórico, os seletores mantêm a ordem atual).
- Registros de repositórios removidos ou fora do contexto atual são **ignorados na leitura**.

## Regras

- **Leitura restrita ao contexto**: o dono vê todos os repositórios vinculados; o portal só vê os do
  **cliente em escopo** (`OrcamentoClient.projectIds`).
- **Registro só por inclusão**: escolher um repositório no `SearchPicker` (clique ou teclado) e
  **adicionar** um repositório no filtro múltiplo registram o uso. Desmarcar, limpar os filtros e
  restaurar o estado salvo **não** contam.
- **Ordenação estável** (`orderByRecency`, `ordering.ts`): os usados recentemente vêm primeiro (na
  ordem do histórico) e os demais mantêm a ordem original (a alfabética dos filtros). A lista
  recebida não é mutada.
- **Busca**: as opções entram no fuse.js já ordenadas; com um termo digitado, a **relevância**
  prevalece e a ordem de recência decide apenas os empates. Sem termo, a lista sai na ordem do
  histórico.
- **A seleção inicial não muda**: o `TaskForm` reordena apenas a lista do seletor; o repositório
  padrão do formulário e o `form.reset` continuam usando a lista original de projetos.

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/tasks/repo-recents` | Histórico do **dono** (`requireAdminSession`) |
| `POST /api/tasks/repo-recents` | Registra o uso (`{ projectId }`); recusa com `PROJECT_NOT_ALLOWED` fora do contexto |
| `GET /api/cliente/repo-recents` | Histórico do **usuário do portal** no cliente em escopo (`requireClientActor`) |
| `POST /api/cliente/repo-recents` | Registra o uso (`{ projectId }`) |

Resposta `RepoRecentsDto`: `{ projectIds: string[], channel: string }` — `projectIds` do mais recente
para o mais antigo e `channel` o canal privado de tempo real do ator. O `POST` devolve a lista já
reordenada, então o cliente **não** refaz a consulta a cada escolha.

São rotas **internas** (sessão): não entram na especificação OpenAPI pública (`/api/v1/*`).

## Tempo real

Canal privado por ator, `private-repo-recents-{actorId}` (`repoRecentsChannel`), autorizado em
`src/lib/pusher/channel-auth.ts`: o dono só assina `private-repo-recents-local` e o usuário de cliente
só o do seu `userId` — o histórico de um usuário nunca chega a outro. O servidor publica
`repo-recents-updated` (`{ projectId }`) depois de persistir; o cliente invalida a consulta
(`useRepoRecentsSource`), cobrindo outra aba ou dispositivo do mesmo ator.

## Cliente

- `hooks.ts`: `useRepoRecentsSource(api, path, scope)` (consulta + registro **otimista** com reversão
  e aviso em falha + assinatura do canal) e `useOwnerRepoRecents()`.
- `src/features/orcamentos/portal/hooks.ts`: `useClienteRepoRecents()` (axios do portal; cache por
  `cliente:{clientId}` no TanStack Query).
- Componentes: `TaskFiltersBar` e `ClienteFiltersBar` (filtro múltiplo, só inclusões) e o campo
  Repositório de `TaskForm`, `OwnerPreviewFormPage` e `ClienteNovaTarefaPage` (`orderItems` do
  `SearchPicker`).

## Arquivos

- `src/lib/db/models/RepositorySelection.ts` — modelo.
- `src/features/repository-recency/` — `constants.ts`, `types.ts`, `schemas.ts`, `ordering.ts` (puro),
  `hooks.ts`, `server/service.ts`.
- `src/app/api/tasks/repo-recents/route.ts` e `src/app/api/cliente/repo-recents/route.ts`.
- `src/components/ui/search-picker.tsx` — prop opcional `orderItems`.
- `src/lib/pusher/channel-names.ts` e `channel-auth.ts` — canal por ator.

## Testes

`__tests__/features/repository-recency/`: `ordering` (ordenação estável e "só inclusões"), `service`
(leitura restrita ao contexto, upsert sem duplicar, recusa fora do escopo, evento), `repo-recents-route`
(identidade resolvida no servidor, validação e autorização) e `search-picker-order` /
`task-form-recents` (ordem no `SearchPicker`, busca por relevância e registro da escolha). O canal por
ator é coberto em `__tests__/lib/pusher/channel-auth.test.ts`.
