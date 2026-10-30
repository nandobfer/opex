# Módulo: Agente Adversário (`src/features/adversarial-agent/`)

Etapa extra do desenvolvimento agêntico, **estritamente na mesa de trabalho** (nunca no Agente Opex
nem fora de uma mesa). Ao fim de **toda implementação** (a primeira, as correções da prévia/PR, a
reabertura e as correções pedidas pelo próprio adversário), um agente do OpenCode **com contexto
limpo** revisa o código antes da prévia (ou do PR, no fluxo PR automático). Ele não rodou a
implementação e não vê a conversa do implementador. Portado do my-tasks (beta `adversarial-agent`,
OPE-87) sem o sistema de betas: a aplicação depende só da ativação da própria feature e do escopo.

## Fluxo

```
implementing ─► adversarial_review ─┬─ aprovado ─────────────► build_queued | building (GitHub) | opening_pr
                                    ├─ bloqueou + automático ─► implementing (correção) ─► adversarial_review (rodada N+1)
                                    ├─ bloqueou + confirmação ► adversarial_blocked
                                    ├─ limite de rodadas ─────► conforme config (padrão: adversarial_blocked)
                                    └─ falha ─────────────────► conforme config (padrão: para com Tentar novamente / Seguir mesmo assim)
adversarial_blocked ─┬─ Corrigir (texto opcional, achados desmarcáveis) ─► implementing ─► adversarial_review
                     ├─ Revisar de novo ─────────────────────────────────► adversarial_review
                     └─ Seguir mesmo assim (confirmação) ────────────────► build_queued | building (GitHub) | opening_pr
```

- **Aplicação** (`adversaryApplies`, `server/settings.ts`): "Agente Adversário" ativo + central no
  escopo (`scope.all` ou `scope.centralIds`). Sem isso o fluxo é idêntico ao de sempre. Nunca lança
  (na dúvida, segue sem revisão). Não entra em `resolving_conflicts` nem `fixing_ci` (o Agente Revisor
  cobre o PR aberto).
- **Fim da implementação** (`afterImplementation` em `agentic/server/workflow.ts`): a sessão é movida
  para o worktree; com o adversário aplicado, o turno encadeado é `adversarial_review` (o texto é a
  resposta do implementador, que traz as contestações de uma correção). Aprovado/seguir: PR
  automático → `opening_pr`; prévia **GitHub** → turno `building` remoto (sem fila); prévia **local**
  → `build_queued`.
- `adversarial_review` ocupa vaga (`RUNNING_STAGES`); `adversarial_blocked` não
  (`SLOT_EXEMPT_STAGES`). As decisões que saem do bloqueio usam `launchOrQueue` (aguardam vaga com as
  ações pendentes `adversarial-fix`/`adversarial-skip`/`adversarial-rerun`, na fila FIFO de retomadas
  com prioridade); seguir para a prévia usa a espera **"Gerar a prévia"** (`enterBuildQueueOrWait`,
  o mesmo helper da chave Gerar prévia).
- **Revisão que falhou**: **Tentar novamente** (refaz a rodada numa sessão nova, com a resposta do
  implementador guardada em `lastPrompt`), **Seguir mesmo assim** ou **Voltar ao planejamento**. Sem
  Reconectar (a sessão do adversário já foi excluída) e **sem chat durante a execução** (o adversário
  revisa sem interferência: o campo some na tela e `sendLiveMessage` responde 409
  `WORKBENCH_ADVERSARIAL_REVIEW`).
- **Reinício do app durante a revisão**: a reconciliação da mesa (`reconcile`) marca a mesa como
  interrompida e a rodada `running` como **falha** (`failOrphanReviews`: `state/decision: failed`, a
  sessão vira `pendingSessionDeletion`). Assim o "Tentar novamente" repete a **mesma** rodada.
- **Exclusão/conclusão**: excluir a mesa durante a revisão aborta o turno (o OpenCode interrompe a
  sessão do adversário e o `finally` da rodada a exclui) e `finalizeDeletion` ainda exclui as sessões
  que rodadas da mesa seguram (`removeWorkbenchReviewSessions`, melhor esforço; as revisões ficam no
  histórico). Exclusão pedida durante a revisão não avança a etapa. A conclusão nunca acontece com a
  revisão em curso (a mesa só conclui no merge).

## Execução (`server/review.ts`)

- Cada rodada abre uma **sessão nova** do OpenCode no worktree da mesa
  (`metadata: { app: "opex", kind: "adversarial-review" }`), com permissões só de leitura
  (`permission-policy.ts`: nega `edit`, `task` e comandos de teste/build/lint/typecheck/instalação,
  escrita no git, `gh`, `rm`/`mv`/`cp`…; o resto é liberado). Pedidos que ainda chegarem são decididos
  na hora pelo mesmo critério; perguntas são canceladas. A sessão é excluída no fim (falha →
  `pendingSessionDeletion`, tentada de novo na próxima rodada da mesa).
- Instruções duráveis da sessão (`buildAdversarialInstructions`, chave `opex-adversarial`): regras
  invioláveis (nunca rodar testes/checks — "considere tudo verde"; nunca alterar nada), o nível de
  criticidade, o guia de severidades, "não bloqueie à toa", o formato JSON, as instruções adicionais e
  as **memórias** (`agentMemoryTexts(["adversarial"])`, seção `memoriesSection` de
  `src/features/ai/memories-prompt.ts`, compartilhada com o Agente Opex).
- Pedido da rodada (`buildReviewPrompt`): `git -C <worktree> diff origin/<base>...HEAD`, o que não foi
  commitado e os arquivos novos, mais o **contexto configurado**. A partir da 2ª rodada: conferir os
  achados anteriores (`previous`), aceitar contestações com evidência e não trocar de objetivo.
- Agente, modelo, variante e **modelos de fallback** da configuração (`runWithFallback` da mesa);
  tempo máximo configurável. Saída na **Saída da IA** da mesa (turno "Agente adversário · rodada N")
  e consumo em `ai_consumption_logs` com origem `adversarial-agent` ("Agente Adversário" no painel;
  custo e tokens também somam no uso da mesa).

## Criticidade e veredito (`verdict.ts`, `rounds.ts`)

- O modelo **classifica**; o **app decide**. Severidades `critical > high > medium > low > nit`.
- Slider de 5 níveis: **Liberal** (bloqueia a partir de Crítico), **Tolerante** (Alto),
  **Equilibrado** (Médio, padrão), **Rigoroso** (Baixo), **Implacável** (Detalhe).
- Travas contra bloqueio desnecessário (no limiar, mas não bloqueia): estilo fora do Implacável; fora
  do diff (`inDiff: false`); sem arquivo, evidência e cenário; na rodada 2+, achado novo que não é
  crítico nem criado pela correção. Abaixo do limiar = **sugestão** (não volta ao implementador).
- Ciclos e rodadas (`planRound`): ciclo novo a cada implementação; correção (automática ou pedida) e
  "Revisar de novo" continuam o ciclo; repetir uma rodada que falhou não conta como nova.
- `decideRound`: sem bloqueio → segue; correção **automática** → pedido de correção
  (`buildFixPrompt`, só os bloqueantes, com contestação opcional `{"disputes":[{"id","reason"}]}` no
  fim da resposta do implementador); **pedir confirmação** → `adversarial_blocked`; rodadas
  **limitadas** (1–20, padrão 3) ou **sem limite**; no limite, **Pausar e perguntar** (padrão) ou
  **Seguir com aviso**. Falha do adversário (erro, tempo esgotado, resposta sem o JSON): **Pausar**
  (padrão) ou **Seguir com aviso**.

## Contexto (tudo configurável, `context.ts`)

| Grupo | Chave | Padrão |
|---|---|---|
| Tarefa | Dados básicos (código, título, tipo, prioridade, projeto), Descrição, Especificação técnica | ligados |
| Tarefa | Resumo e tags (Opex; tags pelo rótulo da taxonomia), Comentários (autor = `authorName`), Histórico, Apontamentos | desligados |
| Tarefa | Anexos: Não enviar / Só os nomes (padrão) / Nomes e arquivos (até 10 MB cada, 20 MB no total, anexados à mensagem como `data:` URI) | Só os nomes |
| Mesa | Plano aprovado, Versões anteriores do plano, Pedido de correção do ciclo, Instruções da central | desligados |
| Rodadas | Achados bloqueantes da rodada anterior + contestações (desligar avisa o impacto) | ligado |

Os anexos vêm de `listAttachments(ownerAttachmentActor(), { taskId })` e o conteúdo de
`readAttachmentContent(actor, id, { download: true })` (`server/attachments.ts`; a `TaskDetailDto`
só traz o contador). Anexo que não baixa fica só com o nome.

## Configuração (`/integracoes/ia?aba=agente-adversario`)

Aba "Agente Adversário" (ícone `Swords`) com seções `OptionTabs` **Geral · Contexto · Memórias ·
Revisões**, formulário acima delas e um Salvar (erro de validação leva à seção do campo). Documento
`{ feature: "adversarial-agent" }` em `ai_feature_settings` (schema `adversarialSettingsSchema`, o
mesmo na tela e na API; `withDefaults` completa campos novos).

- **Geral**: ativação + disponibilidade; **Criticidade** (`Slider` com marcas em texto e painel
  "Bloqueia / Não bloqueia" animado); **Bloqueios e falhas**; **Agente do OpenCode**
  (`AgentConfigFields`: agente, modelo, variante, fallbacks; tempo máximo; instruções adicionais);
  **Centrais** (todas ou escolhidas).
- **Contexto**: as chaves acima e a lista "Seções enviadas" (`plannedSectionTitles`).
- **Memórias**: a lista `adversarial` do módulo de memórias dos agentes (`AgentMemoriesCard`,
  coleção `agent_memories`, sem limite de quantidade; as gravadas pelo Agente Mentor mostram o selo
  "Mentor · <tarefa>", campo `origin`; ver `ai.md`, "Memórias"). O texto passa pelo **Resumo de
  memórias** global (sem modelo próprio). O Agente Opex também lê e edita esta lista pelas
  ferramentas de memórias.
- **Revisões**: as 50 rodadas mais recentes (tarefa, ciclo, rodada, nível, achados por severidade,
  decisão, custo, duração); **Ver** abre achados, contestações e o relatório completo.

## Páginas `/agente-adversario` e `/agente-mentor` (OPE-99)

Itens **Agente Adversário** (ícone `Swords`) e **Agente Mentor** (ícone `GraduationCap`) da seção
**Agentes** da barra lateral, no padrão da página do Agente Revisor (`/agente-revisor`): cabeçalho
`AgentPageHeader` com **Configurar** (leva à aba da configuração), aviso de indisponibilidade
(`AvailabilityNotice`), filtros `ListFilters` **na URL** (`useUrlFilters`, valores inválidos
descartados), lista paginada pela API com rolagem infinita e "Carregar mais (x de y)" de reserva
(`InfiniteListView`), vazio com e sem filtro ("Limpar filtros"), erro com Tentar novamente e tempo
real (`adversarial-review-updated` / `adversarial-mentor-updated` invalidam as páginas).

- **Agente Adversário** (`components/page/AdversarialReviewsPage.tsx`): abas `OptionTabs`
  **Revisões · Memórias**, com a aba na URL (`?aba=memorias`; padrão omitida, troca sem perder os
  filtros).
  - **Revisões**: rodadas de todas as mesas, mais recentes primeiro (`AdversarialReviewList`, a mesma
    lista da seção Revisões da configuração; **Ver** abre o detalhe). Filtros: busca (código ou
    título da tarefa), **Situação** (Revisando, Concluída, Falhou, Interrompida), **Decisão**,
    **Criticidade**, **Central** e **Período**.
  - **Memórias**: a lista `adversarial` (`MemoriesSection`, o mesmo componente da configuração).
- **Agente Mentor** (`components/mentor/MentorRunsPage.tsx`): execuções, mais recentes primeiro
  (`MentorRunList`, a mesma da seção Execuções; **Ver/Decidir** abre o detalhe e, numa sugestão,
  Aprovar/Descartar). Filtros: busca, **Situação**, **Origem** (mensagem do usuário, turno da IA,
  pedido do desenvolvedor — casa quem tem ao menos uma), **Gatilho**, **Central** e **Período**.
- O filtro **Central** (`page/CentralFilter.tsx`) lista as centrais existentes (`centrals` da
  resposta); central filtrada que deixou de existir continua como opção para poder desmarcar.
- As seções **Revisões**, **Memórias** e **Execuções** das abas de configuração continuam, lendo a
  primeira página da mesma API (50 rodadas / 100 execuções).

## Mesa

- Passo **"Revisão adversária"** na trilha (`StageSteps` + `workbenchSteps`) quando o adversário se
  aplica à mesa — campo `adversarial` do `WorkbenchDto`, calculado no servidor por `adversaryApplies`
  — ou a mesa está numa etapa dele.
- Card do veredito na **Saída da IA** (evento gravado `adversarial-verdict`: rodada, nível, desfecho,
  resumo, achados com a trava aplicada). Na mesa, o botão do card é **Ver na aba** (abre a aba
  "Adversário" na rodada, via `AdversarialTabNavProvider`); sem a aba, **Detalhes** (diálogo).
- Aba **"Adversário (N)"** depois de "Plano vN" (`AdversarialRoundsView`; N = total de rodadas da mesa;
  aparece sempre que a mesa tiver rodadas). Mostra a mais recente; com mais de uma, um seletor
  "Ciclo C · rodada R" ("(atual)" na mais recente). Acima, data, custo e duração; a rodada aparece no
  **mesmo card da Saída da IA** (`VerdictCard`, cor pelo desfecho), com erro, resumo, achados
  (bloqueantes primeiro, sugestões com o motivo), contestações e a orientação do usuário
  (`ReviewFindingsBody`). Rodada em andamento: "Revisando…" com skeleton, atualizada pelo Pusher. O
  relatório completo fica no botão **Relatório completo** (diálogo).
- No bloqueio (`AdversarialActions`, na `ActionBar`): achados com caixa (desmarcar = não corrigir),
  orientação opcional, **Corrigir (N)**, **Revisar de novo** e **Seguir mesmo assim** (confirmação).
  Na revisão que falhou, **Seguir mesmo assim** ao lado de Tentar novamente. Motivo de espera "O agente
  adversário bloqueou: decida como seguir" (filtro "Requer interação"); as duas etapas contam como
  "Implementando" nos filtros da central.
- Tempo real: `adversarial-review-updated` (`{ workbenchId }`, canal `private-app`) e
  `ai-memories-updated` (`{ agentId: "adversarial" }`) para as memórias.
- Auditoria: `RevisaoAdversaria` (cada rodada, cada decisão e a rodada órfã), `MemoriaAgente` (memórias)
  e a decisão "seguiu mesmo assim" em `MesaDeTrabalho`.

## Agente Mentor (OPE-92, portado da MT-27 do my-tasks)

Transforma lições das mesas em memórias permanentes — do **Agente Adversário** ou do **agente
desenvolvedor** (globais ou da central da mesa; OPE-97) —, sem passar pelo Agente Opex. Código em `mentor/` (puro) e `server/mentor/`; aba própria **Agente Mentor** em
`/integracoes/ia?aba=agente-mentor` (logo depois de Agente Adversário, ícone `GraduationCap`),
documento `{ feature: "adversarial-mentor" }` em `ai_feature_settings` (`mentorSettingsSchema`, o mesmo
na tela e na API; `withMentorDefaults`).

- **Gate** (`mentorSettingsFor`): Agente Adversário ativo + Mentor ativo + central no escopo do Mentor
  (todas ou as escolhidas). Nunca lança: na dúvida, a mesa segue sem ele. Disponibilidade
  (`mentorAvailability`): exige o Adversário ativo e os modelos do decisor e do redator conectados.
- **Duas portas, um funil**: o Mentor **observa sozinho** os turnos configurados e o **agente
  desenvolvedor pede** quando julga relevante. As duas passam por decisor → Triador → redator →
  sanitizador; se o
  mesmo fim de cadeia tiver as duas, roda **uma** execução com tudo no contexto.
  - **Mensagens do usuário** (padrão: todas ligadas), avaliadas ao fim da cadeia de turnos que a
    mensagem originou: revisão do plano, informações ao implementar, correção da prévia, feedback do
    PR (inclusive comentários do GitHub), reabertura, orientação do bloqueio adversário e chat ao vivo
    (fim do turno em andamento). O mapa ação → tipo é `mentorTriggerOf`.
  - **Turnos da IA** (padrão: desligados): planejamento e implementação/correções.
  - **Pedidos do desenvolvedor** (padrão: ligado, etapa implementação): o pedido do turno ganha a
    instrução `LESSON_INSTRUCTION` (`withLessonInstruction`); o agente termina a resposta com
    ` ```opex-lesson {"problem","shouldHaveCaught","evidence?","why"} ``` ` (no máximo um, só lições
    relevantes). A cerca própria não colide com os blocos ` ```json ` das etapas, e `takeLessonBlock`
    retira o bloco antes de a mesa interpretar o turno (vale o último válido). Bloco inválido sem outro
    gatilho vira execução `failed` com o motivo. Chave "Pedidos do desenvolvedor pulam o decisor"
    (padrão: desligada).
- **Sem limites de quantidade** (nem de memórias, nem por mesa/dia): o rigor do decisor e a fusão pelo
  redator seguram o acúmulo.
- **Decisor**: pergunta se o caso vale virar regra permanente **do revisor ou do desenvolvedor**. JEV
  (`askJevSystemOne`, pergunta `noul` `lesson`; a nota é a probabilidade) ou qualquer
  provedor de texto (`streamAi`, JSON `{score, reason}`), origem de consumo
  `adversarial-mentor-decision`. **Rigor da curadoria** (slider com painel "Grava / Não grava"):
  Generoso 35%, Receptivo 50%, **Equilibrado 65%** (padrão), Seletivo 80%, Implacável 90%; abaixo do
  limiar → `skipped`.
- **Triador** (OPE-97; card **Triador e destinos**, entre o decisor e o redator): escolhe UMA lista
  entre os **destinos** ligados (`targets`, os três ligados por padrão, ao menos um obrigatório):
  - `adversarial` — **Agente Adversário**: o que verificar/detectar numa revisão;
  - `developer-global` — **Agente desenvolvedor — globais**: como fazer o trabalho, em qualquer projeto;
  - `developer-central` — **Agente desenvolvedor — da central**: convenção, comando ou preferência do
    projeto (grava na lista da central da mesa).

  Na dúvida entre revisor e desenvolvedor, prefere o desenvolvedor; nunca as duas. JEV (pergunta
  `choice` `target`, uma opção por destino ligado com o critério; registra a escolha, a `confidence` e
  as `probabilities`) ou qualquer provedor de texto (JSON `{target, confidence, reason}`,
  `parseRouterAnswer`), com **instruções adicionais** opcionais; recebe o caso e os **resumos** de cada
  lista ligada. Destino desligado ou resposta inválida → `failed` com o motivo. Com um destino só, o
  Triador não é chamado (e o provedor dele não é exigido). Origem de consumo
  `adversarial-mentor-router`. Configuração salva antes do Triador nasce com o provedor e o modelo do
  decisor e os três destinos ligados (`withMentorDefaults`).
- **Redator** (`streamAi`, origem `adversarial-mentor-writer`, instruções adicionais configuráveis):
  escreve para a lista escolhida (ao revisor: classe de erro, como detectá-la e que teste a teria
  pegado; ao desenvolvedor: o que fazer ou evitar, quando e por quê). Recebe o caso, **todas as
  memórias** da lista de destino (com ids) e só os **resumos** das outras listas ligadas, e responde
  `create` / `update` (fundir com o id de uma da MESMA lista) / `skip` (inclusive quando outra lista já
  cobre a lição). O caso é tratado como dado (nunca vira instrução nem é copiado). `update` com id
  inexistente ou de outra lista vira `create`. Uma execução grava no máximo uma memória.
- **Sanitizador** (`sanitizeMemoryText`, determinístico): recusa código de tarefa, `#N`, URL, rota
  (`/api/…`, `/app/…`; aceita caminhos e rotas na lista da central — `allowPaths`, convenções do
  projeto), nome do projeto, do repositório e o título da tarefa (termos de 4+ caracteres),
  a regra acima do tamanho máximo de uma memória (`MEMORY_TEXT_MAX`, 2.000 caracteres: "reescreva em
  até 2.000"), e a regra que **copia um trecho do caso**: 6 palavras seguidas iguais (minúsculas, sem acento nem
  pontuação, `copiedExcerpt`) à mensagem do usuário, às respostas do agente ou aos pedidos do
  desenvolvedor. Recusa → nova tentativa do redator com o motivo; recusada de novo → `discarded`.
- **Gravação**: **Gravar direto** (padrão) ou **Sugerir e aguardar aprovação**. Gravar usa o serviço
  de memórias dos agentes (`createAgentMemory`/`updateAgentMemory(<destino>, …)`, com o `centralId` da
  mesa em `developer-central`; o Resumo de memórias gera o título), com
  `origin { source: "mentor", label: "Mentor · <tarefa>" }` e a auditoria `MemoriaAgente` com origem,
  execução, mesa, tarefa e destino. A mesa recebe um aviso discreto (`notice` info) na Saída da IA,
  citando a lista. O desenvolvedor segue a memória nova a partir do próximo turno.
- **Execução** (`adversarial_mentor_runs`, `server/mentor/models.ts`): fila em memória por mesa
  (`globalThis.__opexMentorQueue`, uma por vez), status
  `queued → running → skipped | discarded | suggested | created | updated | failed`, com nota/limiar,
  destino do Triador (`target`, `routerConfidence`, `routerReason`, `routerProbabilities`), motivos do
  decisor/redator/sanitizador, proposta (com `target` e `centralId`; antigas sem destino são do
  adversário), memória, erro, custo e duração. Execuções de antes
  de um reinício viram `failed` ("interrompida") no primeiro uso. Auditoria `MentorAgenteAdversario`
  (EXECUTAR em cada fim; APROVAR/DEVOLVER nas decisões) e evento `adversarial-mentor-updated`
  (`{ runId }`) em `private-app`.
- **Mesa** (`agentic/server/workflow.ts`): `action` em `LaunchOptions` (repassada por `launchOrQueue` e
  `startPendingTurn`), `mentorPrepareTurn`/`mentorTakeLesson` em volta do `runStageAgent` em
  `executeTurns`, `notifyMentor` (fim da cadeia, no `finally` do `launchTurn`; nunca na reconexão nem
  na limpeza) e `mentorRecordLiveMessage` em `sendLiveMessage`. A mesa nunca espera o Mentor e uma
  falha dele não muda a etapa.
- **Aba**: seções **Geral** (ativação e disponibilidade, Gatilhos, Decisor e rigor, Triador e destinos,
  Redator e gravação
  com tempo máximo por chamada de 15–600 s, Centrais — `ScopeCard` reutilizado com `id`,
  `description` e `listLabel`), **Contexto** (mensagem do usuário, resposta do agente, pedido do
  desenvolvedor, dados básicos da tarefa e último veredito do adversário ligados; plano aprovado
  desligado) e **Execuções** (100 mais recentes, com o selo do destino; **Ver/Decidir** abre o detalhe
  com a linha do Triador — destino, confiança e motivo — e, numa sugestão, o **destino** em
  `OptionTabs` (trocar de lista transforma a fusão em memória nova), Aprovar com texto editável ou
  Descartar com confirmação). Central excluída antes da aprovação → 409 `MENTOR_CENTRAL_GONE` (a
  sugestão volta a aguardar e pode ir para outra lista). Provedor/modelo/variante usam os campos
  compartilhados `ModelPickerField`/`VariantSelectField` (`src/features/ai/components/ModelFields.tsx`).
- **Decisão da sugestão** atômica: aprovar/descartar reivindica a execução (`suggested` → `running`
  num `findOneAndUpdate` filtrado pelo status); a decisão concorrente (duplo clique, outra aba) recebe
  409 `MENTOR_RUN_NOT_SUGGESTED`, e uma falha ao gravar devolve a execução a `suggested`.
- **Chat ao vivo** de uma cadeia que não vai ao Mentor (reconexão, limpeza) é descartado
  (`mentorDiscardLiveMessages`), para não entrar na avaliação da próxima cadeia.

## APIs (só o dono; sem OpenAPI)

| Rota | Uso |
|---|---|
| `GET/PUT /api/ai/features/adversarial-agent` | Configuração e disponibilidade |
| `GET /api/adversarial/reviews?q&states&decisions&levels&centrals&from&to&page&limit` | Rodadas paginadas no recorte (listas em CSV, datas ISO; `limit` padrão 20, máx. 100) → `{ items, page, limit, total, totalPages, centrals }` |
| `GET /api/adversarial/reviews/[id]` | Detalhe da rodada |
| `GET /api/adversarial/workbenches/[id]` | Última rodada da mesa (responde mesmo com o adversário desativado) |
| `GET /api/adversarial/workbenches/[id]/reviews` | Rodadas da mesa, da mais antiga para a mais nova, com detalhes (aba "Adversário") |
| `POST /api/agentic/workbenches/[id]/actions/adversarial-fix` `{ text?, excluded? }` | Corrigir |
| `POST …/actions/adversarial-skip`, `…/actions/adversarial-rerun` | Seguir mesmo assim / Revisar de novo |
| `/api/ai/agents/adversarial/memories*` | Memórias (rotas do módulo de memórias dos agentes; sem limite de quantidade) |
| `GET/PUT /api/ai/features/adversarial-mentor` | Configuração do Agente Mentor |
| `GET /api/adversarial/mentor/runs?q&statuses&sources&triggers&centrals&from&to&page&limit` | Execuções paginadas no recorte (mesmo envelope; marca as órfãs como falhas antes de listar) |
| `POST /api/adversarial/mentor/runs/[id]/approve` `{ text?, target? }`, `POST …/discard` | Aprovar (texto editável) ou descartar uma sugestão (409 `MENTOR_RUN_NOT_SUGGESTED`) |

## Dados

- Coleção `adversarial_reviews` (índices no primeiro uso, `adversarialDb`).
- Documentos `{ feature: "adversarial-agent" }` e `{ feature: "adversarial-mentor" }` em
  `ai_feature_settings`; coleção `adversarial_mentor_runs` (`mentorDb`).
- Consumo `adversarial-agent`/`adversarial-mentor-decision`/`adversarial-mentor-router`/
  `adversarial-mentor-writer` (o JEV registra o uso com a feature `adversarial-mentor-decision` ou
  `adversarial-mentor-router`).
- Memórias em `agent_memories` com `agentId: "adversarial"`.
- Mesas com `stage` `adversarial_review`/`adversarial_blocked` e `pendingTurn.action`
  `adversarial-*`; eventos `adversarial-verdict` em `agentic_events`.

## Arquivos

- Módulos puros: `constants.ts`, `schemas.ts`, `types.ts`, `verdict.ts`, `rounds.ts`,
  `permission-policy.ts`, `context.ts`, `prompt.ts`, `filters.ts` e `mentor/filters.ts` (filtros
  das páginas na URL → parâmetros da API).
- Listas paginadas: `server/list-query.ts` e `server/mentor/list-query.ts` (filtro do Mongo, puros),
  `server/central-options.ts` (opções do filtro Central); peças comuns em `src/lib/list/query.ts`
  (`csvList`, `isoDate`, `objectIdCsv`, `pageQuery`, `searchPattern`, `createdAtRange`, `mergeAnd`,
  `pageInfo`) e `src/lib/list/day-filter.ts` (período na URL), também usadas pelo Agente Revisor.
- UI compartilhada com o Agente Revisor: `src/components/list/AgentPageHeader.tsx`,
  `src/components/list/InfiniteListView.tsx` e `src/components/feedback/AvailabilityNotice.tsx`.
- `server/`: `models.ts`, `settings.ts` (inclui `adversaryApplies`), `reviews.ts`, `review.ts`,
  `attachments.ts`, `workflow-hook.ts` (único ponto que o fluxo da mesa importa, import dinâmico e
  memorizado; também reexporta os pontos do Mentor).
- Agente Mentor: `mentor/` (puros: `constants.ts`, `schemas.ts`, `types.ts`, `lesson-block.ts`,
  `sanitize.ts`, `decision.ts`, `prompt.ts`), `server/mentor/` (`models.ts`, `settings.ts`, `queue.ts`,
  `run.ts`, `hooks.ts`), `hooks/useMentor.ts` e `components/mentor/` (`MentorAgentTab`,
  `MentorTriggersCard`, `MentorDeciderCard`, `MentorRouterCard`, `MentorWriterCard`, `MentorModelFields`, `MentorCheckbox`,
  `MentorContextSection`, `MentorRunsSection`, `MentorRunDialog`, `MentorRunBadge`).
- `hooks/useAdversarial.ts`; `components/` (`FindingList`, `ReviewBadges`, `ReviewDetailDialog`,
  `ReviewFindingsBody`, `VerdictCard`, `settings/*`, `workbench/*`).
- `src/lib/ai/opencode-run.ts`: campo opcional `files` (`{ uri, name }[]`) em `TurnRequest`.

## Testes

`__tests__/features/adversarial-agent/` (`verdict`, `rounds`, `permission-policy`, `context-prompt`,
`review`, `reviews`, `workflow` (inclui "Agente Mentor no fluxo da mesa"), `adversarial-ui`,
`rounds-tab`, `list-query`, `filters`, `adversarial-reviews-page`, `mentor-runs-page`, `mentor-sanitize`, `mentor-decision`, `mentor-lesson-block`, `mentor-prompt`,
`mentor-run`, `mentor-hooks`, `mentor-ui`, `mentor-tab`) e casos em
`__tests__/features/agentic/{actions-route,dev-center-filters,logic,stage-steps,timeline,ActionBar,WorkbenchView}`
e `__tests__/features/ai/memories.test.ts`. `__tests__/setup.ts` deixa o adversário de fora por
padrão (mock de `server/workflow-hook` com `adversaryApplies` → `false` e o Mentor inativo:
`mentorPrepareTurn`/`mentorTakeLesson` devolvem o texto igual).
