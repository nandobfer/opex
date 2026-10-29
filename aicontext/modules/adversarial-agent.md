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

## APIs (só o dono; sem OpenAPI)

| Rota | Uso |
|---|---|
| `GET/PUT /api/ai/features/adversarial-agent` | Configuração e disponibilidade |
| `GET /api/adversarial/reviews`, `GET /api/adversarial/reviews/[id]` | Histórico e detalhe |
| `GET /api/adversarial/workbenches/[id]` | Última rodada da mesa (responde mesmo com o adversário desativado) |
| `GET /api/adversarial/workbenches/[id]/reviews` | Rodadas da mesa, da mais antiga para a mais nova, com detalhes (aba "Adversário") |
| `POST /api/agentic/workbenches/[id]/actions/adversarial-fix` `{ text?, excluded? }` | Corrigir |
| `POST …/actions/adversarial-skip`, `…/actions/adversarial-rerun` | Seguir mesmo assim / Revisar de novo |
| `/api/ai/agents/adversarial/memories*` | Memórias (rotas do módulo de memórias dos agentes) |

## Dados

- Coleção `adversarial_reviews` (índices no primeiro uso, `adversarialDb`).
- Documento `{ feature: "adversarial-agent" }` em `ai_feature_settings`.
- Memórias em `agent_memories` com `agentId: "adversarial"`.
- Mesas com `stage` `adversarial_review`/`adversarial_blocked` e `pendingTurn.action`
  `adversarial-*`; eventos `adversarial-verdict` em `agentic_events`.

## Arquivos

- Módulos puros: `constants.ts`, `schemas.ts`, `types.ts`, `verdict.ts`, `rounds.ts`,
  `permission-policy.ts`, `context.ts`, `prompt.ts`.
- `server/`: `models.ts`, `settings.ts` (inclui `adversaryApplies`), `reviews.ts`, `review.ts`,
  `attachments.ts`, `workflow-hook.ts` (único ponto que o fluxo da mesa importa, import dinâmico e
  memorizado).
- `hooks/useAdversarial.ts`; `components/` (`FindingList`, `ReviewBadges`, `ReviewDetailDialog`,
  `ReviewFindingsBody`, `VerdictCard`, `settings/*`, `workbench/*`).
- `src/lib/ai/opencode-run.ts`: campo opcional `files` (`{ uri, name }[]`) em `TurnRequest`.

## Testes

`__tests__/features/adversarial-agent/` (`verdict`, `rounds`, `permission-policy`, `context-prompt`,
`review`, `reviews`, `workflow`, `adversarial-ui`, `rounds-tab`) e casos em
`__tests__/features/agentic/{actions-route,dev-center-filters,logic,stage-steps,timeline,ActionBar,WorkbenchView}`
e `__tests__/features/ai/memories.test.ts`. `__tests__/setup.ts` deixa o adversário de fora por
padrão (mock de `server/workflow-hook` com `adversaryApplies` → `false`).
