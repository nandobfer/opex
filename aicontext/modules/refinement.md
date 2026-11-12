# Módulo: Refinar tarefa (refinamento de tarefa pelo Agente Refinador)

Na página da tarefa, no cabeçalho, o botão de ícone **Refinar tarefa** seleciona a
aba **"Especificação técnica"** e **inicia** o refinamento (se ainda não houver): um agente do
**OpenCode** lê a tarefa inteira, faz **perguntas de esclarecimento** (uma rodada por vez, usando o
**mesmo sistema de perguntas da mesa de trabalho** — os formulários do OpenCode) e vai
**reescrevendo a especificação técnica** da tarefa até ela ficar clara. Abrir a aba pelo próprio
clique apenas mostra o conteúdo (não inicia). Inspirado na skill *grill-me* e no *clarify* do speckit.

É uma sessão **longa e retomável**: o turno roda **em segundo plano no servidor** (sair da aba não
interrompe o agente) e voltar reconecta de onde parou. O painel do refinamento fica **dentro da aba
"Especificação técnica"**, **abaixo** da especificação já salva (o antigo modal foi removido para
dar espaço de leitura às perguntas).

Código: `src/features/refinement/` (domínio + servidor + UI). Reaproveita o cliente oficial
`@opencode/client`, o **runner genérico de turno** `src/lib/ai/opencode-run.ts` (compartilhado com a
mesa) e o **mesmo barramento de eventos** das mesas (`agentic/server/hub.ts` + `agentic_events`,
chaveado pelo id do refinamento). Modelo em `src/lib/db/models/Refinement.ts`.


Página `/agente-refinador` (categoria **Agentes** da sidebar, OPE-122): Visão geral (% concluídos,
perguntas e tempo até a especificação, registrados pelos eventos `refinement-*`) e Histórico — ver
`modules/agent-metrics.md`.

## Refinamento na mesa de trabalho (OPE-137)

O mesmo refinamento também roda **na mesa de trabalho** (`/desenvolvimento`): o botão **Refinar tarefa**
da tela inicial abre a mesa na etapa **Refinamento** ("Refinando" / "Especificação pronta" — regras e
fluxo em `modules/agentic-dev.md`, "Refinamento na mesa"). Continua sendo **um único refinamento por
tarefa**: a mesa e a aba "Especificação técnica" mostram a mesma conversa e o mesmo estado, e responder
ou agir num lado reflete no outro em tempo real (`refinement-updated` e `agentic-updated` em
`private-app`; `useRefinementRealtime` também escuta o `agentic-updated` da tarefa).

- Vínculo pelo `taskId` (`server/workbench-link.ts`): cada mudança do refinamento (`publishRefinement`)
  dispara, em segundo plano, a sincronização da mesa (`syncLinkedWorkbench` → `agentic/server/refinement-stage.ts`).
- **Concluído** = `resolved` ou **encerrado** (`closedAt`, `refinementConcluded`). **Encerrar refinamento**
  (`POST .../actions/close`, só com a mesa em "Refinando"; 409 `REFINEMENT_CLOSE_UNAVAILABLE`) para o
  agente, dispensa as perguntas abertas e mantém a especificação salva. Um turno novo limpa `closedAt`.
- **Primeiro prompt com informações adicionais**: o texto e os anexos do campo da tela inicial vão numa
  seção "Informações adicionais do dono" (`withAdditionalInfo`) e aparecem como mensagem do usuário.
- **Continuar** escolhe o prompt pelo estado: pedido que aguardou vaga (nenhum turno) → primeiro prompt;
  concluído/encerrado → "O dono quer continuar o refinamento…" na mesma sessão; sem a sessão anterior
  (excluída ao concluir sem mesa) → a tarefa inteira com a especificação atual
  (`buildRefinementFreshContinuePrompt`); interrompido/falho → retomada; parado sem especificação → consolidação.
- **Sessão**: com a mesa no refinamento, concluir **não** exclui a sessão (o "Continuar refinamento" a
  retoma); `releaseRefinementSession` a exclui quando a mesa sai do refinamento. **Recomeçar** agora
  também manda a sessão atual para a exclusão pendente.
- **Mesa do planejamento em diante** (item 18): a disponibilidade fica bloqueada com o motivo **"A tarefa
  já está em desenvolvimento na mesa de trabalho"** (dica do botão e painel da aba); iniciar, continuar e
  recomeçar respondem 409 `REFINEMENT_WORKBENCH_ADVANCED`. Com a mesa em "Especificação pronta",
  Continuar e Recomeçar pela página passam pela mesa (respeitam a vaga da central).
- **Modelo do Refinamento** trocado na mesa vale para os turnos enquanto a mesa refina; o DTO do estado
  traz `workbench: { id, stage }` e `refinerModel` (modelo da aba Agente Refinador).
- O painel da aba mostra **Encerrar refinamento** só com a mesa em "Refinando"; os controles (Parar,
  Continuar, Reconectar, Recomeçar, Encerrar) são compartilhados com a barra da mesa
  (`useRefinementControls`, `RefinementDialogs`).

## Configuração (Integrações › Inteligência Artificial › aba "Agente Refinador")

- `ai_feature_settings` (`feature: "task-refinement"`), schema `taskRefinementSettingsSchema`:
  ativa, **modelo** e **agente** do OpenCode, variante, **origem das instruções**, instruções de texto,
  skill e o que enviar (comentários, histórico). **Exclusiva do OpenCode** (como "Estimar prazos"),
  porque depende da sessão longa e dos formulários. Ativar exige modelo (vale para as duas origens);
  modelo/variante/agente são conferidos no catálogo. O agente
  padrão é o **`plan`** (somente leitura e com a ferramenta de perguntas habilitada); subagentes como
  `general` e `explore` **não** conseguem perguntar pela ferramenta nativa e não devem ser usados.
- A aba se chama **"Agente Refinador"** (id `refinar-tarefa` na URL); o botão da página da tarefa
  continua **Refinar tarefa**.

### Origem das instruções: Texto ou Skill do OpenCode

- Seletor **Origem das instruções** (`OptionTabs`, `RefinementInstructionsCard`): **Texto**
  (`instructionsSource: "text"`, padrão, campo de até 8.000 caracteres com "Restaurar padrão") ou
  **Skill do OpenCode** (`instructionsSource: "skill"`, `skill` = id da skill).
- Os dois valores são **sempre guardados**: trocar de origem não apaga o texto nem a skill. O texto é
  também o **fallback** da skill. Configurações antigas (sem os campos) carregam como "Texto".
- A lista vem do próprio OpenCode (`GET /api/ai/skills` → `GET /api/skill` do servidor, diretório da
  integração; nenhum id fixo no código), no seletor genérico `OpencodeSkillSelect` (busca, descrição,
  **Atualizar lista**). Skills **vazias** aparecem marcadas e não podem ser escolhidas; a skill salva
  fora da lista aparece como "(não encontrada)". Sem nenhuma skill: estado vazio orientando a instalar
  uma skill ou **Usar instruções de texto**; erro ao listar: "Tentar novamente".
- **Ao salvar** com origem "Skill": é obrigatório escolher a skill ("Selecione a skill"); o servidor
  confere no OpenCode que ela existe (`AI_SKILL_NOT_FOUND`, 400) e não está vazia (`AI_SKILL_EMPTY`,
  400). **Não há limite de tamanho do conteúdo**, por decisão do dono no planejamento da OPE-94: a skill
  é ativada pelo mecanismo nativo do OpenCode (não é colada pelo Opex no prompt) e o tamanho das skills
  instaladas é responsabilidade de quem as instala; por isso o Opex só recusa a skill vazia. OpenCode desconectado só recusa (409) com a feature
  ativa.
- **Aviso na tela**: o `GET` devolve `skill: { status, name, message }` (`ok` | `not_found` | `empty`
  | `unavailable`; `null` com origem "Texto", regra pura em `features/ai/refinement-skill.ts`). Fora
  de `ok`, o topo da aba mostra a mensagem: o refinamento vai usar as instruções de texto.
- **No refinamento**: a cada execução de turno o servidor lista as skills **no diretório da sessão**
  (`sessionDirectory ?? central.directory`; `listOpencodeSkillsAt` sobre `client.skill.list`), decide o plano (`planRefinementInstructions`, puro, em
  `prompt.ts`) e, com a skill disponível, **ativa a skill na sessão** (`client.session.skill`,
  `resume: false`) — **uma vez por sessão/skill** (`activeSkill { sessionId, skillId }` no documento;
  Continuar/consolidação na mesma sessão não reativam; Recomeçar, sessão recriada ou troca de skill
  ativam de novo; Reconectar não ativa nada e, sem a skill já ativa naquela sessão, mantém as instruções
de texto). A entrada durável `opex-refinement` passa a levar só o
  aviso de que as instruções são as da skill + o **protocolo fixo**, que continua valendo.
- **De onde vem a lista em cada caminho (OPE-158)**: a aba e o salvar leem `GET /api/skill` no
  diretório da **integração** OpenCode (`listAiSkills` → `listOpencodeSkills`, com cache curto), sempre
  carregado; o turno lê o diretório da **sessão**. O OpenCode carrega as skills de um diretório aos poucos
  quando ele é aberto (ou reaberto depois de descarregado): as primeiras leituras voltam **sem nenhuma
  skill** e depois **só com as nativas**, e a lista completa chega cerca de 1 s depois. Era por isso que a
  aba dizia `ok` e o turno, criado logo depois de `session.create`, caía sempre em "não está instalada".
  `listOpencodeSkillsAt` (`src/lib/ai/opencode-skill-list.ts`) repete a leitura a cada 300 ms (até 14
  leituras, ≈ 4 s) e para assim que a skill configurada aparece; se ela não aparecer, para quando a lista
  fica igual e não vazia por 4 leituras seguidas (a lista parcial das nativas já se repetiu em 2 leituras no host real). Erro de rede continua sendo "OpenCode sem listar".
- **Casamento da skill** (`matchOpencodeSkill`, puro, `src/lib/ai/opencode-skills.ts`, usado pela aba, pelo
  salvar, pelo turno e pelo motor OpenCode dos rotineiros): `id` exato → `name` exato → `id`/`name`
  normalizados (sem espaços nas pontas, minúsculas, só o último segmento de id qualificado `a/b` ou
  `a:b`). Mais de um candidato no passo normalizado não casa nada. `settings.skill` continua guardando o id
  mostrado no seletor, e a ativação usa sempre o `id` devolvido pelo OpenCode.
- **Fallback explícito**: skill ausente no diretório da sessão, vazia, OpenCode sem listar ou falha ao
  ativar → o turno usa as **instruções de texto + protocolo** (como a origem "Texto"), registra
  `log.warn` e publica um aviso (`notice` warn) na saída do refinamento explicando o motivo. Skill ausente
  no turno tem motivo próprio, com o diretório consultado e as skills encontradas: "A skill "x" não foi
  encontrada no OpenCode para o diretório da sessão (/caminho): o refinamento usa as instruções de texto.
  Skills encontradas: a, b." (o log leva também `ids` e `attempts`). A aba mantém a mensagem "não está
  instalada no OpenCode". O log da ativação registra a skill e o diretório. O refinamento nunca quebra
  por causa da skill.
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

1. O botão do cabeçalho abre a aba **já com a intenção de iniciar**; o painel **inicia** o refinamento
   (idempotente: se já existir, apenas devolve o estado) e dispara um **turno** com a tarefa em
   Markdown — **inteira, sem cortes** (`buildTaskContextPrompt` com `fullText`) — + o protocolo.
   Sem a intenção do botão (abrir a aba clicando nela), não inicia.
2. O agente faz as perguntas pela **ferramenta nativa de perguntas do OpenCode, `question`** — a
   mesma que abre um formulário (mesmos campos da mesa: texto, número, sim/não, opções, múltipla
   escolha). A ferramenta pausa o turno até a resposta. O protocolo **proíbe** o agente de escrever
   as perguntas como texto. As perguntas pendentes aparecem no painel, **abaixo da saída do agente**,
   para **Responder** ou **Dispensar**; as **opções** viram uma lista de linhas selecionáveis com a
   **descrição** de cada uma (mesmo card genérico da mesa).
   Cada linha da saída do agente tem **Citar no campo de resposta** (`ReplyTargetProvider`): insere
   `> linha` na resposta de texto da pergunta pendente; sem pergunta aberta, copia a linha (toast).
   Selecionando texto, o botão no fim da seleção cita só o trecho.
3. O usuário responde; a resposta vai para a **mesma sessão** (`session.form.reply`) e o agente
   continua.
4. Ao final de **cada rodada** o agente reescreve a especificação técnica completa sob o título
   exato `## Especificação técnica`. O servidor **extrai** esse trecho (`extractTechnicalSpec`,
   `logic.ts`, puro — tolerante a nível de título, caixa e acento) e **grava no campo `technicalSpec`
   da tarefa** (`updateTask`) — a cada rodada e no fim do turno. O extrator também reconhece o título
   **colado a um texto anterior** na mesma linha (`Segue a especificação:## Especificação técnica` — o
   preâmbulo é descartado) e com **sufixo iniciado por separador** (`— OPE-1`, `: resumo`, `(v2)`);
   "colado" é sem espaço antes dos `#`; menção em prosa (precedida de espaço), entre crases ou com sufixo sem separador (`## Especificação técnica do módulo`) não
   conta. O protocolo continua pedindo o título exato. Quando a gravação só funcionou pela tolerância, o
   serviço registra um `log.info` por turno (`taskId`, `refinementId`). Os blocos de texto do turno
   chegam separados por linha em branco (runner `opencode-run.ts`, `modules/agentic-dev.md`), sem
   mudar o que a tela mostra (OPE-162).
5. O ciclo continua até o agente julgar a especificação esclarecida ou o usuário parar. O protocolo
   fixo garante que a especificação cubra **critérios de aceite**, **localização da mudança**
   (rotas/URLs, telas, módulos, integrações, arquivos) e **casos de borda**.

**Conclusão (`resolved`)**: um turno só é marcado como esclarecido quando ele termina (`succeeded`),
o texto do agente traz a especificação técnica **e** ela é gravada com sucesso no campo
`technicalSpec` da tarefa. As instruções configuradas (texto, ou a skill ativada na sessão) + o protocolo
fixo são aplicados como **entrada durável da sessão** (`session.instructions.entry.put`, chave `opex-refinement`); se o servidor não
aceitar a entrada, o protocolo é reenviado no prompt de cada turno. Quando o turno termina **sem** a
especificação (o agente encerrou só com "tudo esclarecido"), o serviço dispara automaticamente, na
mesma sessão, **até 2 turnos de consolidação** (`buildRefinementFinalizePrompt`) que reescrevem a
especificação completa **sem abrir novas perguntas** — o usuário não precisa clicar em **Continuar**.
Esgotadas as tentativas, o refinamento fica `idle` com o aviso *"O agente terminou sem produzir a
especificação técnica. Use Continuar para finalizá-la."*; nesse estado, **Continuar** também só
consolida (não reabre o interrogatório).

**Exclusão da sessão**: ao concluir, a sessão é **desvinculada** (`sessionId`/`sessionDirectory` =
`null`, preservando todo o histórico do refinamento no Opex — especificação, saída, uso) e **excluída**
no OpenCode (`session.remove`), como nas mesas (`modules/agentic-dev.md`). Se a exclusão falhar (OpenCode
fora do ar etc.), o id fica em `pendingSessionDeletions` e a rotina **`agentic-queue-pump`** (Crons)
retoma; sessão já inexistente conta como excluída (idempotente). **Recomeçar** leva as exclusões
pendentes para o novo refinamento (o id antigo nunca toca a sessão nova).

O texto do agente **não é salvo** na tarefa além da especificação: o diálogo é reconstruído pelos
eventos gravados (`agentic_events`), como na mesa. O turno roda **em segundo plano** com limite de
**6 h** (o refinamento é guiado pelas respostas do usuário; a mesa usa 3 h); reinício do app no meio
vira `interrupted` e o usuário retoma com **Continuar** — ou, com o agente ainda vivo no OpenCode,
acompanha pela **Reconectar** (ver "Reconectar").

## Reconectar (recuperar a pergunta perdida)

A sessão do refinamento é longa: a pergunta do agente (`question`) pausa o turno até uma resposta. Se
a conexão se perder nesse instante, o SSE (que é **só ao vivo**) não entrega mais a pergunta.
`reconnect` (`POST /api/tasks/[id]/refinement/actions/reconnect`) religa o acompanhamento da **mesma
sessão**, **sem** prompt e **sem** trocar agente/modelo, e trata os três pontos de perda:

1. **Queda transitória Opex↔OpenCode durante o turno**: o runner relê o estado da sessão
   (`form.list`/`permission.list`) na reconexão do SSE e republica só as pendências **ainda não
   emitidas**, fechando as que saíram da lista. A timeline atualiza o item pelo id (sem duplicar) e o
   servidor deduplica `pendingForms`/`pendingPermissions` por id.
2. **Reinício do app**: o turno vira `interrupted` (`reconcile`) mas a sessão segue viva; ao
   reconectar, as pendências são restauradas do estado da sessão e a pergunta volta a ser respondida
   **no Opex**.
3. **Queda do navegador**: o stream NDJSON reconecta e reenvia `reset` + histórico; o estado vem do
   banco e, ao reconectar o Pusher, `useRealtimeConnection` invalida as consultas ativas
   (`useRefinementRealtime`) — a pergunta reaparece **sem clique adicional**.

A resposta da ação traz o **desfecho estável** em `reconnect.outcome`: **`attached`** (execução em
andamento, o painel volta a **running**), **`recovered`** (terminou na queda: recupera o resultado do
histórico e aplica o fim de turno normal — grava a especificação e marca `resolved`, consolida até 2
turnos quando terminar sem ela, ou registra a falha), **`nothing`** (sessão inexistente ou nada
rodando) ou **`transient`** (OpenCode indisponível no momento). Sem sessão, fora de `failed`/
`interrupted` ou com a feature/central indisponível, responde 409; com um turno vivo no processo, é
no-op.

O painel mostra **Reconectar** (mesmo componente/botão da mesa: `ReconnectButton`) **ao lado de**
**Continuar** quando há sessão e o refinamento está falho/interrompido; **Continuar** segue sendo o
caminho de "novo prompt" (retomar/consolidar) e **Recomeçar** não mudou. O botão compartilhado traz o
**ciclo automático** (`useAutoReconnect`): tentativas em **1 s → 2 s → 4 s → 8 s → 16 s** (máximo 5),
indicador **“Reconectando…”**, aviso discreto ao esgotar e clique manual a qualquer momento (tenta na
hora e reinicia a contagem). Não há ciclo automático depois de um **Parar** do usuário
(`stopRequestedAt`), nem reinício por oscilação de estado do mesmo episódio (`turnStartedAt`).


## Estado e ações

- Documento `task_refinements` (um por tarefa): `runState` (`idle`|`running`|`failed`|`interrupted`),
  `resolved`, `closedAt` (Encerrar na mesa), `queuedStart` (pedido do "Refinar tarefa" sem vaga), `finalizing` (turno de consolidação em andamento), `error`, `spec` (última especificação
  gravada), `pendingForms`/`pendingPermissions`, `pendingSessionDeletions` (sessões do OpenCode ainda
  pendentes de exclusão), `activeSkill` (skill já ativada na sessão: `{sessionId, skillId}`), `turnStartedAt` (marco do turno; episódio do ciclo de reconexão),
  `stopRequestedAt` (Parar do usuário; desliga a reconexão automática), `reconnect` (`{outcome,
  message, at}` — desfecho estável para o cliente), `usage`, `sessionId`, `sessionDirectory`,
  `centralId`, `projectId`.
- O `usage` acumula tokens/custo do refinamento; cada passo também vai para `ai_consumption_logs`
  (origem `refinement`) para o painel de consumo do OpenCode — ver `modules/ai.md`, "Medição de
  consumo".
- Ações (`POST .../refinement/actions/[action]`): **interrupt** (Parar; marca `stopRequestedAt`),
  **continue** (retoma na mesma sessão um turno interrompido/falho e, quando o refinamento encerrou
  **sem** a especificação, apenas consolida), **restart** (Recomeçar: descarta a conversa e abre uma
  nova sessão; a especificação já salva na tarefa é mantida) e **reconnect** (acompanha a sessão
  existente sem reenviar prompt — ver "Reconectar").
- **Chat durante a execução** (`POST .../refinement/messages {text}`): com o agente refinando e a
  opção ligada (padrão global de Desenvolvimento agêntico + ajuste da central do refinamento;
  `liveChat` no DTO), o painel mostra **Enviar ao agente** abaixo das perguntas
  (`RefinementLiveMessage`) e a mensagem entra no turno em andamento sem interromper. Recusa (409)
  com a opção desligada, parado (`REFINEMENT_NOT_RUNNING`) ou durante a consolidação da
  especificação (`REFINEMENT_FINALIZING`). Regras completas em `modules/agentic-dev.md`, "Chat
  durante a execução".
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
- O painel (`RefinementPanel`, dentro da aba "Especificação técnica", **abaixo** da especificação)
  reusa a **Timeline** da mesa (saída ao vivo) numa **área própria com rolagem** (`h-[40vh]
  min-h-[18rem] max-h-[28rem]`) e o card genérico de perguntas (`components/agent-questions/`,
  compartilhado com a mesa) **logo abaixo**, sem rolagem interna curta. Controles: **Parar**,
  **Continuar**, **Reconectar** (quando há sessão e está falho/interrompido; mesmo botão/ciclo da
  mesa) e **Recomeçar** (com confirmação) e, sem refinamento, **Refinar tarefa** (inicia).
  Durante a consolidação automática o painel indica *"Consolidando a especificação técnica…"*.
  Quando `resolved`, mostra que a especificação foi esclarecida e salva.

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
| `POST /api/tasks/[id]/refinement/actions/[action]` | `interrupt`, `continue`, `restart`, `reconnect`, `close` (Encerrar, só com a mesa em Refinando) |
| `POST /api/tasks/[id]/refinement/messages` `{text, fileIds?}` | Chat durante a execução: mensagem que entra no turno em andamento |
| `GET/PUT /api/ai/features/task-refinement` | Configuração da feature + disponibilidade + situação da skill |
| `GET /api/ai/skills` | Skills instaladas no OpenCode (para a origem "Skill do OpenCode") |

Auditoria: `RefinamentoTarefa` (iniciar, recomeçar, excluir, mensagem durante a execução). A gravação da especificação usa a
auditoria normal da tarefa (`updateTask`, entidade `Tarefa`, `especificacao: "alterada"`); como
`technicalSpec` **não** está entre os campos sincronizados com o GitHub, a gravação **não** empurra
nada para a issue.

## Testes

Refinamento na mesa (OPE-137): `refinement-service.test.ts` ("refinamento na mesa de trabalho": bloqueio
da mesa já em desenvolvimento, informações adicionais no primeiro prompt, pedido sem vaga, modelo trocado
na mesa, sessão mantida com a mesa e liberada ao sair, Encerrar, prompts do Continuar e delegação à mesa
em Especificação pronta), `refinement-route.test.ts` (`close`) e `RefinementPanel.test.tsx` (Encerrar só
com a mesa em Refinando e o motivo do item 18).

`__tests__/features/refinement/`: `logic` (extração da especificação, protocolo e prompts de
consolidação/retomada), `refinement-service` (disponibilidade sem central / desativada / feature off,
ínicio com sessão no diretório da central, aplicação das instruções duráveis, gravação da especificação,
consolidação automática sem exigir **Continuar**, falha de gravação sem marcar como esclarecido,
exclusão da sessão ao concluir, resposta, interrupção, **Continuar** e **Reconectar** (attach sem
prompt, turno recuperado na queda, desfecho definitivo sem turno, 409 sem sessão/estado inválido e
no-op com turno vivo)), `session-cleanup`
(exclusão idempotente, pendências e retomada), `refinement-route`
(rotas NDJSON/ações/formulários, com `reconnect`), `RefineTaskButton` (bloqueio com motivo e `onOpen`) e
`RefinementPanel` (CTA de início, indisponível, saída/perguntas, consolidação, `autoStart`, aviso de
esclarecido e **Reconectar** ao lado de **Continuar**).
O ciclo automático compartilhado é coberto por `__tests__/features/agentic/reconnect.test.ts` (agenda e
máquina do ciclo) e `__tests__/features/agentic/auto-reconnect.test.tsx` (hook).
`__tests__/features/tasks/task-detail-tabs.test.tsx` cobre o slot do refinamento abaixo da
especificação. `__tests__/features/ai/task-refinement-settings.test.ts` cobre a configuração (origem
texto/skill, validação da skill, aviso), `__tests__/features/ai/task-refinement-tab.test.tsx` a aba,
`__tests__/features/ai/opencode-skills.test.ts` a lista de skills e
`__tests__/features/refinement/prompt-skill.test.ts` o plano de instruções; a ativação e o fallback
estão em `refinement-service.test.ts`. O
OpenCode é sempre mockado.
