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
  as **memórias** (`adversarialMemoryContext()` — canais `opex` e `agentes/adversario` do Engramind, com cache de reserva e aviso na mesa —, seção `memoriesSection` de
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
- **Memórias**: a lista `adversarial` do módulo de memórias dos agentes, no universo único do agente
  `opex/adversario` (OPE-148, `MemoryUniverseSection`, com as Memórias do Opex;
  coleção `agent_memories`, sem limite de quantidade; as gravadas pelo Agente Mentor mostram o selo
  "Mentor · <tarefa>", campo `origin`; ver `ai.md`, "Memórias"). A lista é o canal
  `agentes/adversario` do Engramind (o título é do Redator do Engramind); com o aprendizado autônomo o
  próprio Adversário grava nela pelo MCP `opex_memorias`. O Agente Opex também lê e edita esta lista
  pelas ferramentas de memórias.
- **Revisões**: as 50 rodadas mais recentes (tarefa, ciclo, rodada, nível, achados por severidade,
  decisão, custo, duração); **Ver** abre achados, contestações e o relatório completo.

## Páginas `/agente-adversario` e `/agente-mentor` (OPE-99)

Itens **Adversário** (ícone `Swords`) e **Mentor** (ícone `GraduationCap`) da categoria **Agentes** da
barra lateral. Desde a OPE-122 as duas usam o `AgentPage` compartilhado: a primeira aba (padrão) é a
**Visão geral** com as métricas do agente (`modules/agent-metrics.md`), seguida das abas atuais —
**Revisões** (`?aba=revisoes`) e **Memórias** no Adversário, **Execuções** (`?aba=execucoes`) no
Mentor —, no padrão da página do Agente Revisor (`/agente-revisor`): cabeçalho
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
- **Detalhe da execução** (`MentorRunDialog`, OPE-128; o mesmo na página e na seção Execuções):
  - **Cabeçalho** (`MentorRunHeader`): título com o código da tarefa (link para a mesa) e o selo da
    situação; subtítulo com o título da tarefa; metadados em chips (custo, duração, quando, destino).
  - **Corpo com rolagem**: o erro (quando houver) em destaque no topo e as etapas em seções com ícone e
    título, sem coluna de rótulos (`MentorRunDetails` + `MentorRunSection`): **Gatilhos** (origens,
    tipo da mensagem e pedidos em chips; a mensagem do usuário como citação), **Decisor** (nível e
    nota/limiar; motivo em parágrafo), **Triador**, **Redator** e **Sanitizador**/**Motivo do descarte**.
  - **Memória** (`MentorRunMemory`): primeiro o **resumo** em destaque, que é o título do Engramind lido
    na hora por `GET /api/adversarial/mentor/runs/[id]/memory` (`useMentorRunMemory`, só com
    `memoryId`). Enquanto o resumo está pendente, mostra o texto provisório com "Resumo sendo gerado
    pelo Engramind…" e relê a cada 5 s por até 2 min, contados a cada abertura do detalhe
    (não pelo cache). Se o limite estourar com o resumo ainda pendente, a releitura para e o aviso troca
    para "O resumo ainda não ficou pronto: este é o texto provisório." Sem memória gravada (sugestão, não gravou,
    falhou), mostra um estado vazio discreto. Com a memória excluída ou movida, mostra um aviso; com
    erro, "Tentar novamente". Depois vem o texto completo gravado pelo Mentor, numa área de leitura
    (`max-w-prose`, `leading-relaxed`, rolagem interna até 40vh). Numa sugestão, o destino
    (`OptionTabs`) e o texto editável.
  - **Rodapé**: na sugestão, Descartar (com confirmação) e Aprovar; nos demais casos, **Fechar**
    (`DialogClose`). O X padrão do dialog continua no canto.
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
- Aba **"Aprendizado (N)"** (OPE-165, `MentorLearningTab`/`useMentorLearningTab`, depois de "Arquitetura"):
  aparece quando a mesa tem ao menos uma execução de aprendizado do Agente Mentor (N = execuções). Um card
  por conclusão/tentativa, mais recente primeiro: situação, data da conclusão, merge ou conclusão manual,
  tentativa e duração; o corpo compartilhado `MentorLearningRunBody` mostra o erro com **Tentar novamente**
  (confirmação), a transcrição lida (tamanho, se foi enviada inteira ou compactada e para quanto, eventos,
  forks integrados), o modelo do digestor, o custo contra o orçamento, a contagem das operações e os
  **casos** (situação, natureza, escopo, nota, destino, lição, evidências, como detectar e as operações com
  o link da memória — o mesmo painel de detalhe dos avisos da mesa, `MemoryDetailPopover` +
  `MemoryDetailCard`). Skeleton com a mesma estrutura (`MentorLearningTabSkeleton`); tempo real por
  `adversarial-mentor-updated`.
- Tempo real: `adversarial-review-updated` (`{ workbenchId }`, canal `private-app`) e
  `ai-memories-updated` (`{ agentId: "adversarial" }`) para as memórias.
- Auditoria: `RevisaoAdversaria` (cada rodada, cada decisão e a rodada órfã), `MemoriaAgente` (memórias)
  e a decisão "seguiu mesmo assim" em `MesaDeTrabalho`.

## Agente Mentor (OPE-92; reformulado na OPE-165: aprende na conclusão da mesa)

Transforma as lições das mesas em memórias permanentes — do **Agente Adversário** e do **agente
desenvolvedor** (globais ou da central da mesa) —, sem passar pelo Agente Opex. Código em `mentor/`
(puro) e `server/mentor/`; aba própria **Agente Mentor** em `/integracoes/ia?aba=agente-mentor` (logo
depois de Agente Adversário, ícone `GraduationCap`), documento `{ feature: "adversarial-mentor" }` em
`ai_feature_settings` (`mentorSettingsSchema`, o mesmo na tela e na API; `withMentorDefaults`).

Desde a OPE-165 (decisões do dono de 13/11/2026) o Mentor aprende **uma única vez por conclusão da
mesa**, a partir da **transcrição inteira**: é o único momento em que a lição se distingue do episódio.
Não existe agente novo ("Agente Sonhador" descartado): o Mentor é o veículo.

- **Gatilho único** (`completeWorkbench`, `agentic/server/workflow.ts`): depois de a mesa gravar
  `stage: "done"` e `completedAt`, `notifyMentorDone` chama `mentorOnDone` (`server/mentor/hooks.ts`, via
  `workflow-hook.ts`) em segundo plano. `completeWorkbench` é o ponto único das conclusões normal (merge),
  manual ("Definir etapa" → Concluída) e depois da limpeza; `completionKind` = `manual` quando a mesa tem
  `manualCompletion`, senão `merge`. **Exclusão, cancelamento, "Definir etapa" para outra etapa e mesa
  que não conclui não disparam o Mentor.** Nunca lança e nunca muda a etapa da mesa.
- **Idempotência**: uma execução por conclusão — índice único parcial `{ workbenchId, completedAt,
  attempt }` (só `kind: "learning"`); a segunda chamada para o mesmo `completedAt` cai no `E11000` e é
  ignorada. Reabrir zera `completedAt`; concluir de novo gera outro e, portanto, **outra execução**, agora
  com a história completa.
- **Gatilhos antigos saíram**: mensagens do usuário, turnos da IA, chat ao vivo, revisões do adversário
  e feedback de PR não encerram mais cadeia para o Mentor (o conteúdo deles está na transcrição). Saíram
  `mentorTriggerOf`, `mentorSourcesFor`, `mentorAfterTurns`, `mentorRecordLiveMessage`,
  `mentorDiscardLiveMessages`, `mentorAdversarialTurn`, `selfLearnedMemories`, `notifyMentor` e o
  `LaunchOptions.action` do workflow. As constantes `MENTOR_USER_TRIGGERS`/`MENTOR_SOURCES` ficam só para
  exibir e filtrar o histórico (origem nova `done`, "Conclusão da mesa").
- **Gate** (`mentorSettingsFor`): Mentor ativo + **Aprender ao concluir** (`learnOnDone`, padrão ligado)
  + central no escopo. **Não exige mais o Agente Adversário**: `effectiveTargets` (puro, `schemas.ts`)
  tira o destino `adversarial` quando ele está desativado e o Mentor segue com as listas do
  desenvolvedor; sem nenhum destino que valha, nada roda. Disponibilidade (`mentorAvailability`): digestor,
  decisor, Triador (com mais de um destino que vale) e redator conectados; com o Adversário desativado e o
  destino dele ligado, só avisa (`available: true` com o motivo).
- **Desenvolvedor somente leitura**: com o Mentor aprendendo na central (`mentorLearnsOnDone`: gate e ao
  menos um destino que vale — só o Adversário ligado e desativado não conta, e o desenvolvedor segue gravando), o agente
  desenvolvedor (mesa e forks) não grava memória: a instrução sai sem o "Checklist de fim de turno"
  (`readOnlyReason` em `selfMemoryInstructions`) e o MCP `opex_memorias` recusa as ferramentas de gravação
  (`MENTOR_WRITES_REFUSAL`); contexto, dicas, busca e leitura por id continuam (`modules/ai.md`).
- **Transcrição** (`mentor/transcript.ts`, puro; carga em `server/mentor/transcript.ts`): `flushWorkbenchEvents`
  e depois os eventos de `agentic_events` da conversa principal e dos **forks integrados**
  (`AgenticFork.status === "integrated"`, com o resumo e o destino da integração), em ordem de `seq`, mais
  os dados da mesa: plano aprovado (a última versão, com o pedido do dono de cada versão), PR, conclusão
  manual e motivo e as rodadas do Adversário (achados com a situação na rodada seguinte e as contestações).
  Textos do agente são juntados; a mesma chamada de ferramenta fica com o último estado; `reasoning`,
  `tool-progress`, `pr-watch-step` e `form-closed` ficam de fora.
  - **Compactação determinística** acima de `digest.compactThresholdChars` (padrão 400.000 caracteres),
    por níveis até caber: 1) blocos idênticos viram "×N"; 2) saídas de ferramenta em cabeça + cauda; 3)
    entradas de ferramenta; 4) leituras bem-sucedidas (`read`, `glob`, `grep`…) viram contador; 5) o meio
    dos textos longos do agente (menos o último de cada turno). **Nunca corta** mensagens do dono, o plano,
    vereditos/achados, avisos `warn`/`error`, fim de turno com falha e a conclusão manual. Mesmo no último
    nível acima do limiar, segue marcada (`aboveThreshold`) e o orçamento ainda segura o custo.
  - Sem mensagem do dono nem texto do agente → falha "Transcrição vazia".
- **Digestor** (estágio novo, `mentor/digest.ts`, origem de consumo `adversarial-mentor-digest`; provedor de
  texto, de preferência barato e de contexto longo): extrai os **casos** em JSON validado por Zod —
  `lesson`, `evidence` (trechos citados, obrigatórios), `nature` (`positive`/`negative`), `scope`
  (`any_project`/`this_project`) e `detection` (como detectar de novo, nas negativas). Proibido inferir
  regra de hipótese abandonada, de achado recusado/contestado ou de tentativa desfeita. O digestor recebe,
  depois da transcrição, as memórias de cada lista que vale (id e resumo) e é instruído a escrever **um
  caso por lista de destino** (a parte global, a do projeto e a do revisor em casos separados, com o
  `target` sugerido) e casos de **obsolescência** (o id da memória que ficou errada, o que mudou e a
  evidência, na lista dela). A sugestão chega ao Triador (`listaSugeridaPeloDigestor`), que a segue salvo se
  contrariar a natureza da lição. Textos longos são **cortados, não recusados** (lição 3.000, cada evidência
  1.500, até 8 evidências); casos inválidos ou acima da proteção folgada de 100 por execução saem e são
  contados em `digestDiscarded` (chip "N casos descartados" na execução). Lista vazia → `skipped`.
- **Funil por caso** (em sequência; cada caso em `adversarial_mentor_run_cases`):
  - **Decisor** (rigor): JEV (pergunta `noul` `lesson`) ou provedor de texto (`{score, reason}`), origem
    `adversarial-mentor-decision`, sobre o estado do caso (`buildCaseState`). **Rigor da curadoria**:
    Generoso 35%, Receptivo 50%, **Equilibrado 65%** (padrão), Seletivo 80%, Implacável 90%; abaixo do
    limiar, o caso fica `skipped`.
  - **Triador**: escolhe **UMA lista por caso** entre os destinos que valem (`adversarial`,
    `developer-global`, `developer-central`), pela natureza da lição (OPE-132); JEV (`choice`) ou texto
    (`{target, confidence, reason}`), origem `adversarial-mentor-router`. Com um destino só, não é chamado.
    **Uma execução grava em quantas listas precisar**: casos diferentes caem em listas diferentes.
  - **Redator** (`mentor/operations.ts`, origem `adversarial-mentor-writer`): recebe a lista de destino
    (memórias **ativas**, com id, versão e se é do dono) e os resumos das outras listas, e responde com as
    **operações nessa lista**: `create` (com categoria opcional, conferida no Engramind — fora da lista, a
    padrão), `update`, `merge` (`into` + `absorb`: a que recebe é atualizada e as absorvidas são arquivadas)
    e `archive` (obsoleta, com motivo); ou `skip` (`covered` com o id de uma memória **da lista de destino**,
    ou `no_lesson`). **Excluir não existe.** `resolveWriterOps` confere tudo com a **versão lida** (nunca a
    do modelo): `update` com id inexistente vira `create`; id fora da lista, a mesma memória em duas
    operações, mais de 40 operações num caso (proteção folgada, `MENTOR_WRITER_MAX_OPERATIONS`), **memória
    do dono arquivada ou absorvida** → recusa com o motivo e nova tentativa
    (`MENTOR_WRITER_ATTEMPTS`); recusado de novo, o caso fica `discarded`. Memória do dono pode ser
    atualizada e receber uma fusão. Sem cap de quantidade (decisão do dono): o rigor e a preferência por
    atualizar/fundir seguram o acúmulo.
  - **Sanitizador** (`sanitizeMemoryText`) em todo texto de `create`/`update`/`merge`, com o contexto da
    lista (`allowPaths` e `text_max` do canal; código de tarefa, `#N`, URL, rota, projeto, repositório e
    título recusados). Não pode copiar 6 palavras seguidas das **mensagens do dono** nem, fora da central,
    das **evidências** do caso.
  - **Aplicação automática** (`server/mentor/apply.ts`): sem proposta e sem aprovação, como o agente
    `opex/mentor` (token próprio; `agent: { consumer: "mentor", label: "Mentor · <tarefa>" }`), origem
    `Mentor · <tarefa>` e auditoria `MemoriaAgente` com `ator: agente:mentor`, execução, mesa, tarefa,
    destino e operação. Uma operação que falha (ex.: 409 de versão) fica registrada nela; as demais seguem.
    Depois de cada caso aplicado, a lista do destino é relida para o próximo caso.
- **Orçamento** (`digest.budgetUsd`, padrão US$ 0,30, faixa 0,01–20): conferido depois de cada chamada; passar
  dele interrompe a execução (`failed`, `abortReason: "budget"`, "Orçamento de US$ X excedido"), mantendo o
  que já foi aplicado. **Prazo total** (`MENTOR_RUN_MAX_MS`, 60 min): uma etapa que não responde (Engramind,
  banco, provedor) faz a execução falhar com o motivo, para o batimento e libera a fila da mesa; o que ainda
  rodar em segundo plano não grava nem aplica mais nada. Em qualquer interrupção (orçamento, prazo, erro),
  os casos ainda pendentes viram `failed` "Não processado: <motivo>" (nunca ficam "Aguardando"). O custo do JEV não é somado (a resposta não traz custo).
- **Execução** (`adversarial_mentor_runs`, `kind: "learning"`): mesa, código, `completedAt`,
  `completionKind`, `attempt`/`retryOf`, transcrição (`originalChars`, `sentChars`, `compacted`, `level`,
  `aboveThreshold`, `eventCount`, `forkCount`), `digestModel`, `caseCount`, `operationCounts` (por operação e
  `failed`), `targetCounts` (operações aplicadas por lista), `budgetUsd`, custo, duração e erro. Status
  `queued → running → learned | skipped | failed` (`learned` = "Aprendizado aplicado": ao menos uma
  operação aplicada; `failed` também quando todos os casos que chegaram ao redator falharam). Falha do
  Mentor (provedor, orçamento, transcrição vazia) **nunca muda a etapa da mesa**. Ao fim, um aviso discreto
  na Saída da IA cita as memórias criadas/atualizadas/fundidas (referências, nunca o texto) e manda para a
  aba Aprendizado. Auditoria `MentorAgenteAdversario` (EXECUTAR) e evento `adversarial-mentor-updated`
  (`{ runId }`) em `private-app` ao entrar na fila, iniciar, avançar, concluir e falhar.
- **Fila e batimento** (`server/mentor/queue.ts`): corrente por mesa em memória (uma por vez), mas a
  execução viva é decidida por **batimento no banco** (`heartbeatAt` a cada 15 s desde a fila): sem batimento
  por 90 s, `recoverOrphanMentorRuns` (no máximo 1×/min por processo, ao enfileirar e ao listar) marca
  `failed` "interrompida" — nunca pelo mapa em memória, porque a prévia usa o mesmo banco. Execuções antigas
  (sem `kind`) presas em `queued`/`running` também viram `failed`.
- **Tentar novamente** (`retryMentorLearning`, `POST /api/adversarial/mentor/runs/[id]/retry`): só a
  tentativa mais recente que falhou de uma conclusão, sem outra em andamento (`retryableRunIds`); cria
  `attempt + 1` com o mesmo `completedAt` e a configuração atual (as memórias gravadas pela tentativa
  anterior já aparecem nas listas). Fora disso, 409 `MENTOR_RUN_NOT_RETRYABLE`; Mentor desligado, 409
  `MENTOR_DISABLED`.
- **Configuração** (aba enxuta, seções **Geral**, **Execuções** e **Reorganização**): ativação e
  disponibilidade; **Aprendizado na conclusão da mesa** (`MentorHowItWorksCard`: as etapas e a chave
  "Aprender ao concluir a mesa"); **Digestor, orçamento e transcrição** (`MentorDigestCard`: provedor/modelo,
  orçamento, tempo máximo do digestor 30–900 s e limiar de compactação); Decisor e rigor; Triador e destinos;
  **Redator e sanitizador** (instruções adicionais e o tempo máximo das demais chamadas, 15–600 s); Centrais.
  Saíram os cards **Gatilhos**, a seção **Contexto** e o modo **Sugerir e aguardar aprovação**. Configuração
  salva antes da OPE-165 é lida sem erro: `triggers`, `context` e `saveMode` são descartados e o digestor
  nasce com o provedor e o modelo do redator (`withMentorDefaults`).
- **Execuções antigas** (antes da OPE-165, `kind` ausente, uma lição por cadeia): continuam no histórico e
  na página `/agente-mentor` com o detalhe antigo (decisor, Triador, redator, sanitizador, memória). As
  **sugestões antigas** (`suggested`) ainda podem ser aprovadas ou descartadas (`approve`/`discard`,
  reivindicação atômica `suggested → running`, 409 `MENTOR_RUN_NOT_SUGGESTED`; central excluída → 409
  `MENTOR_CENTRAL_GONE`).
- **Detalhe** (`MentorRunDialog`): no aprendizado, o corpo compartilhado `MentorLearningRunBody` (o mesmo da
  aba Aprendizado da mesa, lido ao abrir por `GET /api/adversarial/mentor/runs/[id]`, que devolve os casos);
  a lista mostra "N casos · M operações" no lugar da nota.

## Reorganização do acervo (OPE-132)

Na seção **Reorganização** da aba, o botão **"Reorganizar memórias"** revisa **todas as memórias que o
Mentor enxerga** — as listas ligadas em `targets` (Adversário, globais do desenvolvedor e as centrais do
escopo do Mentor), só as memórias **ativas** (as arquivadas ficam de fora da revisão, da estimativa e
das candidatas a fusão) — e monta um **Plano de reorganização**. É só uma prévia: **nada é gravado** até o
dono aprovar (tudo ou item a item). Não exige o Mentor ativo: exige o Triador (quando há mais de uma
lista) e o redator configurados.

- **Confirmação do recorte** (`MentorReorgStartDialog`): listas e centrais marcáveis (sem central
  marcada, todas as do escopo), número de memórias, chamadas de IA (`memórias × (2 com mais de uma
  lista, 1 com uma)`) e o custo médio por memória das últimas revisões (`preview-count`). Só habilita
  com ao menos uma memória.
- **Pipeline por memória** (`server/mentor/reorganize.ts`, o mesmo `generate`/limites do Mentor):
  1. **Triagem** (`routeMemory`): o Triador em modo revisão escolhe a lista de destino; as opções
     incluem cada central pelo id e nome do projeto (`developer-central:<centralId>`). Com uma opção
     só, o Triador não é chamado. Origem de consumo `adversarial-mentor-reorg-router`.
  2. **Redação** (`writeMemory`): o redator recebe a memória e as memórias da lista de destino e
     responde `keep` (manter), `rewrite` (mesma lista, texto novo) ou `merge` (fundir numa memória da
     lista de destino). Origem `adversarial-mentor-reorg-writer`. Texto proposto passa pelo
     sanitizador com o contexto do destino (recusa o nome do projeto da central de origem quando o
     destino é global/Adversário; aceita caminhos só na lista de uma central); recusa → uma nova
     tentativa; recusada de novo → o item vira `keep` com o motivo.
  3. **Ação final** (`planItemAction`, puro): manter na mesma lista = `keep`; reescrever noutra lista =
     `move` (com o texto novo); fundir = `merge` (a memória absorvida é **arquivada**, nunca excluída).
  4. **Conciliação** (`reconcileReorgPlan`, puro): sem fusão cruzada (A→B e B→A), em cadeia (A→B e B→C),
     duas fusões no mesmo destino nem fusão da memória nela mesma; a primeira vence e a outra vira
     `keep` com o motivo. Quem recebe uma fusão também fica na lista.
  5. **Mover sem texto novo**: o texto atual também passa pelo sanitizador do destino (nome do projeto
     da central de origem, caminhos quando o destino é global/Adversário, limite do canal). Se for
     recusado, o item vira `keep` com o motivo, em vez de levar a regra específica para a outra lista.
  6. **Falha por memória**: resposta inválida do modelo numa memória não invalida o plano — ela vira um
     item `keep` com o erro registrado e a revisão segue. `failed` fica para configuração ausente ou
     falha de infraestrutura antes/depois do laço.
- **Plano** (`adversarial_mentor_reorganizations` + `adversarial_mentor_reorg_items`): a execução
  guarda status (`queued → running → ready | failed | cancelled`; depois `applying → applied |
  partial | discarded`), recorte, total/revisadas, custo e duração; cada item guarda a memória de
  origem (`resumo`, `texto`, `versao`, `owner`), a ação, o destino, o texto proposto, a memória da
  fusão, o motivo, a confiança do Triador, o motivo do sanitizador, os avisos (`moveBlocked` — o token
  do Mentor não alcança origem/destino; `ownerMemory`) e a decisão (`pending | approved | applied |
  failed | discarded`) com o erro. Ler o plano **não** grava nada.
- **Fila** (`reorg-queue.ts`): uma reorganização por vez (`globalThis.__opexMentorReorg`), com o slot
  reservado de forma síncrona antes de qualquer `await` (dois cliques/abas não iniciam duas); a segunda
  recebe 409 `MENTOR_REORG_RUNNING`. Todas as chamadas de IA da revisão (inclusive o JEV do Triador)
  respeitam o tempo máximo configurado. Cancelar (`AbortController`) interrompe a revisão e mantém o que já
  foi revisado, sem aprovação. Reinício do app marca a execução em andamento como `failed`. Cada item
  revisado publica `adversarial-mentor-reorg-updated` (`{ reorgId }`) em `private-app`; a aba também
  relê a cada 2 s enquanto a execução está ativa.
- **Aplicar** (`applyMentorReorg`): item a item, com reivindicação atômica (`pending → approved`), para
  duplo clique/duas abas não aplicarem duas vezes. `keep` só muda o status. `rewrite` usa
  `updateAgentMemory` com a `versao` lida no plano (`MEMORY_VERSION_CONFLICT` → item `failed` com
  "gere outro plano"). `move` confere a versão, usa `moveAgentMemory` (o `POST
  /v1/memories/{id}/move` do Engramind, que exige `write` nos dois canais) e, se houver texto novo,
  reescreve depois. `merge` atualiza a memória que fica (com a versão dela) e **arquiva** a absorvida;
  se a absorvida for **do dono**, o item exige `confirmOwner` (`MENTOR_OWNER_CONFIRM_REQUIRED`) e o
  arquivamento é gravado como o dono (sem o token do agente). **Aprovar tudo** não arquiva memória do
  dono sem confirmação: o diálogo do lote pede a confirmação explícita (com a contagem) e a envia por
  item; um item de fusão do dono aprovado sem ela fica **pendente** (não vira falha definitiva) e pode
  ser decidido depois. Falha num item não derruba os outros: `applied` (tudo resolvido), `partial`
  (algo falhou ou falta decidir) ou `discarded`.
  - **Sem fallback para o token admin** no mover: o token do Mentor não alcança o canal → 403
    `MEMORY_MOVE_FORBIDDEN`, identificado pelo **código** do Engramind, com a orientação de ajustar as
    assinaturas do agente `opex/mentor` (decisão da OPE-132; exceção consciente à regra de credencial
    restrita, porque a tarefa pede sinalizar em vez de ampliar o alcance).
- **Auditoria** `MentorReorganizacao` (EXECUTAR ao iniciar, APROVAR ao aplicar, DEVOLVER ao descartar)
  e, nas memórias, `MemoriaAgente` com `origem: "Reorganização do Mentor"`, `reorganizacao` e
  `ator: agente:mentor` (no arquivamento confirmado do dono, `confirmadoPeloDono: true`).
- **Interface** (`components/mentor/reorg/`): `MentorReorgSection` (botão + histórico), `MentorReorgStartDialog`,
  `MentorReorgProgress` (situação, "x de N", custo animado, duração, cancelar), `MentorReorgPlan`
  (**Plano de reorganização**: progresso, filtros por ação, lista virtualizada acima de 50 itens,
  Aprovar/Descartar por item e em lote com confirmação) e `MentorReorgItem` (origem, ação, destino,
  texto editável, motivo, avisos de escopo e de memória do dono, decisão). Skeleton com a estrutura do
  plano e animações em Framer Motion.
- **Limitações registradas**: (1) o plano é um retrato — uma memória editada depois dele é protegida
  pela `versao` no reescrever e no mover, mas uma edição concorrente no meio da aplicação de outro item
  não é revalidada; (2) reiniciar o processo durante a revisão perde o trabalho em andamento (o que já
  foi revisado fica, mas a execução vira `failed` e não pode ser aprovada); (3) o custo é o das
  chamadas de IA (triagem + redação por memória, e uma nova tentativa quando o sanitizador recusa).

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
| `GET /api/adversarial/mentor/runs/[id]` | Uma execução com os casos (`MentorLearningRunDto`, `getMentorLearningRun`; 404 `MENTOR_RUN_NOT_FOUND`): detalhe e painel da sugestão no aviso da mesa |
| `POST /api/adversarial/mentor/runs/[id]/retry` | Tentar novamente o aprendizado que falhou (OPE-165): `{ id }` da nova tentativa; 409 `MENTOR_RUN_NOT_RETRYABLE`/`MENTOR_DISABLED`/`MENTOR_NO_TARGETS` |
| `GET /api/adversarial/workbenches/[id]/mentor-runs` | Execuções de aprendizado da mesa com os casos (aba "Aprendizado"; marca as órfãs antes de listar) |
| `GET /api/adversarial/mentor/runs/[id]/memory` | Resumo (Engramind) da memória gravada pela execução: `{ state: "none" \| "ok" \| "missing", resumo, resumoPendente, atualizadaEm }` (`getMentorRunMemory`) |
| `POST /api/adversarial/mentor/runs/[id]/approve` `{ text?, target?, extraText?, includeExtra? }`, `POST …/discard` | Aprovar (texto editável; a parte separada também) ou descartar uma sugestão (409 `MENTOR_RUN_NOT_SUGGESTED`) |
| `GET/POST /api/adversarial/mentor/reorganizations` | Histórico (20 mais recentes + centrais) / inicia a revisão `{ targets?, centralIds? }` (409 `MENTOR_REORG_RUNNING`) |
| `GET /api/adversarial/mentor/reorganizations/preview-count?targets&centralIds` | Estimativa do recorte: `{ memories, calls, averageCostUsdPerMemory }` |
| `GET /api/adversarial/mentor/reorganizations/[id]` | Plano de reorganização com os itens e os totais |
| `POST …/reorganizations/[id]/apply` `{ itemIds?, overrides? }` | Aprova tudo ou os itens escolhidos (`overrides[id] = { text?, confirmOwner? }`) |
| `POST …/reorganizations/[id]/discard` `{ itemIds? }`, `POST …/cancel` | Descarta (sem gravar) / cancela a revisão em andamento |

## Dados

- Coleção `adversarial_reviews` (índices no primeiro uso, `adversarialDb`).
- Documentos `{ feature: "adversarial-agent" }` e `{ feature: "adversarial-mentor" }` em
  `ai_feature_settings`; coleções `adversarial_mentor_runs` e `adversarial_mentor_run_cases` (`mentorDb`),
  `adversarial_mentor_reorganizations` e `adversarial_mentor_reorg_items` (`reorgDb`).
- Consumo `adversarial-agent`/`adversarial-mentor-digest`/`adversarial-mentor-decision`/`adversarial-mentor-router`/
  `adversarial-mentor-writer`/`adversarial-mentor-reorg-router`/`adversarial-mentor-reorg-writer` (o JEV
  registra o uso com a feature `adversarial-mentor-decision` ou `adversarial-mentor-router`).
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
- Agente Mentor: `mentor/` (puros: `constants.ts`, `schemas.ts`, `types.ts`,
  `sanitize.ts`, `decision.ts`, `prompt.ts`, `reorg.ts`, `transcript.ts`, `digest.ts`, `operations.ts`), `server/mentor/` (`models.ts`, `settings.ts`, `queue.ts`,
  `run.ts`, `steps.ts`, `hooks.ts`, `learn.ts`, `apply.ts`, `transcript.ts`, `reorg-models.ts`, `reorganize.ts`, `reorg-queue.ts`), `hooks/useMentor.ts`,
  `hooks/useMentorReorg.ts` e `components/mentor/` (`MentorAgentTab`,
  `MentorHowItWorksCard`, `MentorDigestCard`, `MentorDeciderCard`, `MentorRouterCard`, `MentorWriterCard`, `MentorModelFields`, `MentorCheckbox`,
  `MentorRunsSection`, `MentorRunDialog`, `MentorRunHeader`, `MentorRunDetails`, `MentorLearningRunBody`, `MentorRunCases`,
  `MentorRunOperation`, `MentorRetryButton`,
  `MentorRunMemory`, `MentorRunSection`, `MentorRunBadge` e `reorg/` com `MentorReorgSection`,
  `MentorReorgStartDialog`, `MentorReorgProgress`, `MentorReorgPlan`, `MentorReorgItem`, `MentorReorgHistory`
  e `format.ts`).
- Lista virtualizada compartilhada: `src/components/list/VirtualStack.tsx` (movida do Agente Opex).
- `hooks/useAdversarial.ts`; `components/` (`FindingList`, `ReviewBadges`, `ReviewDetailDialog`,
  `ReviewFindingsBody`, `VerdictCard`, `settings/*`, `workbench/*`).
- `src/lib/ai/opencode-run.ts`: campo opcional `files` (`{ uri, name }[]`) em `TurnRequest`.

## Testes

`__tests__/features/adversarial-agent/` (`verdict`, `rounds`, `permission-policy`, `context-prompt`,
`review`, `reviews`, `workflow` (inclui "Agente Mentor no fluxo da mesa": turnos não o chamam), `adversarial-ui`,
`rounds-tab`, `list-query`, `filters`, `adversarial-reviews-page`, `mentor-runs-page`, `mentor-sanitize`, `mentor-decision`, `mentor-prompt`,
`mentor-run`, `mentor-hooks`, `mentor-ui`, `mentor-tab`, `mentor-reorg`, `mentor-reorganize`, `mentor-settings`,
`mentor-transcript`, `mentor-digest`, `mentor-operations`, `mentor-learn`, `mentor-learning-tab`,
`mentor-reorg-section`, `mentor-reorg-routes`) e casos em
`__tests__/features/agentic/{actions-route,dev-center-filters,logic,stage-steps,timeline,ActionBar,WorkbenchView,workflow-manual-stage,workflow-deletion,developer-memories}`
e `__tests__/features/ai/memories.test.ts` e `__tests__/features/ai/agent-memory-move.test.ts`. `__tests__/setup.ts` deixa o adversário de fora por
padrão (mock de `server/workflow-hook` com `adversaryApplies` → `false` e o Mentor inativo:
`mentorOnDone` → `null`).
