# Módulo: Refinar tarefa (refinamento de tarefa por agente)

Na página da tarefa, ao lado de **Entender tarefa**, o botão de ícone **Refinar tarefa** abre um
modal em que um agente do **OpenCode** lê a tarefa inteira, faz **perguntas de esclarecimento**
(uma rodada por vez, usando o **mesmo sistema de perguntas da mesa de trabalho** — os formulários
do OpenCode) e vai **reescrevendo a especificação técnica** da tarefa até ela ficar clara. Inspirado
na skill *grill-me* e no *clarify* do speckit.

É uma sessão **longa e retomável**: o turno roda **em segundo plano no servidor** (fechar o modal
não interrompe o agente) e reabrir reconecta de onde parou.

Código: `src/features/refinement/` (domínio + servidor + UI). Reaproveita o cliente oficial
`@opencode/client`, o **runner genérico de turno** `src/lib/ai/opencode-run.ts` (compartilhado com a
mesa) e o **mesmo barramento de eventos** das mesas (`agentic/server/hub.ts` + `agentic_events`,
chaveado pelo id do refinamento). Modelo em `src/lib/db/models/Refinement.ts`.

## Configuração (Integrações › Provedores de IA › aba "Refinar tarefa")

- `ai_feature_settings` (`feature: "task-refinement"`), schema `taskRefinementSettingsSchema`:
  ativa, **modelo** e **agente** do OpenCode, variante, instruções e o que enviar (comentários,
  histórico). **Exclusiva do OpenCode** (como "Estimar prazos"), porque depende da sessão longa e
  dos formulários. Ativar exige modelo; modelo/variante/agente são conferidos no catálogo. O agente
  padrão é o **`plan`** (somente leitura e com a ferramenta de perguntas habilitada); subagentes como
  `general` e `explore` **não** conseguem perguntar pela ferramenta nativa e não devem ser usados.
- A aba traz um card **Diretório da sessão** explicando (e listando as centrais) que a sessão é
  criada no diretório da **central de desenvolvimento do projeto da tarefa** — não no diretório da
  integração OpenCode. Ver `modules/agentic-dev.md`.

## Sessão e disponibilidade

- A sessão do OpenCode é criada com `location.directory = <diretório da central do projeto>` e
  retomada nas rodadas seguintes (`sessionId` guardado no documento).
- **Disponibilidade** do botão (`GET /api/tasks/[id]/refinement`, campo `availability`):
  feature ativa + OpenCode conectado; tarefa com repositório (projeto) vinculado; e uma **central de
  desenvolvimento ativa** para o projeto. Sem central ou com a central desativada, o botão fica
  **bloqueado com o motivo** (a sessão nunca usa o diretório da integração OpenCode).

## Fluxo do refinamento

1. Abrir o modal **inicia** o refinamento (idempotente: se já existir, apenas devolve o estado) e
   dispara um **turno** com a tarefa em Markdown + o protocolo.
2. O agente faz as perguntas pela **ferramenta nativa de perguntas do OpenCode, `question`** — a
   mesma que abre um formulário (mesmos campos da mesa: texto, número, sim/não, opções, múltipla
   escolha). A ferramenta pausa o turno até a resposta. O protocolo **proíbe** o agente de escrever
   as perguntas como texto. As perguntas pendentes aparecem no modal para **Responder** ou
   **Dispensar**.
3. O usuário responde; a resposta vai para a **mesma sessão** (`session.form.reply`) e o agente
   continua.
4. Ao final de **cada rodada** o agente reescreve a especificação técnica completa sob o título
   exato `## Especificação técnica`. O servidor **extrai** esse trecho (`extractTechnicalSpec`,
   `logic.ts`, puro — tolerante a nível de título, caixa e acento) e **grava no campo `technicalSpec`
   da tarefa** (`updateTask`) — a cada rodada e no fim do turno.
5. O ciclo continua até o agente julgar a especificação esclarecida ou o usuário parar. O protocolo
   fixo garante que a especificação cubra **critérios de aceite**, **localização da mudança**
   (rotas/URLs, telas, módulos, integrações, arquivos) e **casos de borda**.

**Conclusão (`resolved`)**: um turno só é marcado como esclarecido quando ele termina (`succeeded`)
**e** o texto do agente traz a especificação técnica — que é então gravada na tarefa. Se o turno
termina sem a especificação, o refinamento fica `idle` com o aviso *"O agente terminou sem produzir a
especificação técnica. Use Continuar."* e o modal oferece **Continuar** (o `runState` nunca fica
"resolvido" sem a especificação).

O texto do agente **não é salvo** na tarefa além da especificação: o diálogo é reconstruído pelos
eventos gravados (`agentic_events`), como na mesa. O turno roda **em segundo plano** com limite de
**6 h** (o refinamento é guiado pelas respostas do usuário; a mesa usa 3 h); reinício do app no meio
vira `interrupted` e o usuário retoma com **Continuar**.

## Estado e ações

- Documento `task_refinements` (um por tarefa): `runState` (`idle`|`running`|`failed`|`interrupted`),
  `resolved`, `error`, `spec` (última especificação gravada), `pendingForms`/`pendingPermissions`,
  `usage`, `sessionId`, `sessionDirectory`, `centralId`, `projectId`.
- Ações (`POST .../refinement/actions/[action]`): **interrupt** (Parar), **continue** (retoma na
  mesma sessão um turno interrompido, falho ou encerrado sem produzir a especificação) e **restart**
  (Recomeçar: descarta a conversa e abre uma nova sessão; a especificação já salva na tarefa é
  mantida).
- Um refinamento "executando" sem turno vivo no processo (o app reiniciou) vira `interrupted` ao ser
  lido (`reconcile`), com **Continuar** disponível.
- Excluir a tarefa apaga o refinamento e a saída gravada (melhor esforço).

## Saída ao vivo

- O refinamento emite os **mesmos eventos** das sessões longas da mesa (`turn`, `text`, `reasoning`,
  `tool`, `notice`, `permission`, `form`, `turn-end`, `user`) no barramento (`hub.ts`) e na coleção
  `agentic_events`, chaveado pelo id do refinamento. `GET /api/tasks/[id]/refinement/events`
  devolve NDJSON (`reset` + gravado + ao vivo, `ping` a cada 15 s). O cliente reconecta sozinho
  (`useRefinementStream` → `useEventStream` genérico) e reconstrói com `applyTimelineLine`.
- Mudanças de estado publicam `refinement-updated { taskId }` em `private-app`; `useRefinementRealtime`
  invalida a consulta do refinamento.
- O modal (`RefineTaskDialog`) reusa a **Timeline** da mesa (saída ao vivo) e o card genérico de
  perguntas (`components/agent-questions/`, compartilhado com a mesa), com **Parar**, **Continuar**,
  **Recomeçar** (com confirmação) e **Fechar**; quando `resolved`, mostra que a especificação foi
  esclarecida e salva.

## Modelo e tipos

- `TaskRefinement` (`task_refinements`, `src/lib/db/models/Refinement.ts`).
- Schemas: `taskRefinementSettingsSchema` (`features/ai/schemas.ts`); respostas de formulário e
  permissão reusam `formReplySchema`/`permissionReplySchema` do agêntico.
- Regras puras: `extractTechnicalSpec`, `refinementWaitingReason` (`src/features/refinement/logic.ts`)
  e o protocolo/constantes (`constants.ts`).

## APIs

| Rota | Uso |
|---|---|
| `GET /api/tasks/[id]/refinement` | Estado do refinamento + disponibilidade (botão) |
| `POST /api/tasks/[id]/refinement` | Inicia o refinamento (idempotente) e dispara o primeiro turno |
| `DELETE /api/tasks/[id]/refinement` | Exclui o refinamento da tarefa |
| `GET /api/tasks/[id]/refinement/events` | Stream NDJSON da saída |
| `POST /api/tasks/[id]/refinement/forms/[formId]` `{answer}` ou `{cancel:true}` | Responde a pergunta |
| `POST /api/tasks/[id]/refinement/permissions/[requestId]` `{decision, message?}` | Responde permissão |
| `POST /api/tasks/[id]/refinement/actions/[action]` | `interrupt`, `continue`, `restart` |
| `GET/PUT /api/ai/features/task-refinement` | Configuração da feature + disponibilidade |

Auditoria: `RefinamentoTarefa` (iniciar, recomeçar, excluir). A gravação da especificação usa a
auditoria normal da tarefa (`updateTask`, entidade `Tarefa`, `especificacao: "alterada"`); como
`technicalSpec` **não** está entre os campos sincronizados com o GitHub, a gravação **não** empurra
nada para a issue.

## Testes

`__tests__/features/refinement/`: `logic` (extração da especificação e montagem do prompt),
`refinement-service` (disponibilidade sem central / desativada / feature off, início com sessão no
diretório da central e gravação da especificação, resposta e interrupção), `refinement-route`
(rotas NDJSON/ações/formulários) e `RefineTaskButton` (bloqueio com motivo).
`__tests__/features/ai/task-refinement-settings.test.ts` cobre a configuração. O OpenCode é sempre
mockado.
