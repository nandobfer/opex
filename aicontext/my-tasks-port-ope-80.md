# Port do My Tasks → Opex (OPE-80)

Mapeamento das implementações do My Tasks (`~/code/sipal/my-tasks`) que ainda não existem no Opex,
com a especificação de port validada pelo dono. Comparação feita sobre os commits do My Tasks a
partir do último port (`29aa64e`, v1.0.0) até `3d4ee61` (v1.15.0), contra o Opex 2.55.0.

> Documento de **planejamento**: nenhum item abaixo está implementado. Cada bloco vira uma tarefa
> própria (implementar → documentar no módulo → testar) e, ao ser entregue, sai daqui e passa a ser
> descrito em `modules/agentic-dev.md` / `modules/ai.md`.

Regras do port (decisão do dono): port **seletivo**, nunca cherry-pick integral; adaptar
"produto/Go! Sipal" para repositório/projeto local; marcadores `<!-- opex:… -->` em vez de
`my-tasks:`; componentes reaproveitados são extraídos para componentes compartilhados.

## Já existe no Opex (nada a portar)

| Commit My Tasks | Recurso | Opex |
|---|---|---|
| d880286 | "Todos os projetos", "Todos" nas colunas, filtro "Estado da mesa" | `CentralPicker`, `TaskFilters`, `dev-center-filters.ts` |
| 2b8b4e9 | Builder do Docker na central | `DockerBuilderField`, `docker-builders.ts` |
| 42dc3bc | Revisão automática de PR | `src/features/pr-review` |
| 70a2eec | Modo Vim, Ctrl+J/Ctrl+E | OPE-78 (`modules/editor-mode.md`) |
| d7c1977 | Mesas paradas não ocupam vaga; `pendingTurn` | `server/slots.ts` |
| e36661f | Reconexão automática (mesa e refinamento) | OPE-77 |
| 32b527e | Exclusão de mesa limpa o ambiente | OPE-68 |
| 677ee1f, 5300930 | Forks da conversa e fork de fork | `server/forks.ts`, `ForkActionBar` |
| ef29d48 | Foco na descrição, Enter no SearchPicker, Vitest no CI | OPE-73, `search-picker.tsx`, job `vitest` do `ci-cd.yml` |

## Fora do escopo (intencional)

- **068935d** — remover o backup do MongoDB: o Opex mantém o backup **opcional** (OPE-72).
- **0697dfe** — "só tarefas atribuídas a mim": depende do Go! Sipal; o Opex tem um único dono.
- **f6bd0ec** — recursos beta: revertido no próprio My Tasks (23bb000).

## Blocos aprovados

Ordem sugerida: **E → D → C → B → A**, com **F** independente (pode correr em paralelo).

### A — Corrigir CI falho (`fixing_ci`) — bc915ca

> **Entregue na v2.61.0** (OPE-81) — descrito em `modules/agentic-dev.md`, "CI falho". Decisão: além
> da central, há **padrão global** (`AgenticSettings.ci`), herdado pelas centrais novas e pelas antigas
> sem valor próprio (`git.inheritCi`, mesmo modelo das colunas globais da OPE-79); o limite é um
> número opcional (`ciFixLimit`, vazio = sem limite).

- Central (aba Git e PR): `git.fixCi` (padrão ligado) e `git.ciFixLimit` (opcional, 1–20; vazio =
  sem limite), com `parseCentralConfig` preenchendo centrais antigas; também padrão na configuração
  global da OPE-79.
- `src/features/agentic/ci.ts` (puro): `ciFailureState` espera todas as verificações terminarem,
  considera a última execução de cada uma; falha = `failure`, `timed_out`, `startup_failure`,
  `action_required` e status `failure`/`error` (`cancelled`/`skipped` não contam);
  `describeCiState` para o relato do bloco B.
- `pr-watch.ts` consulta `commits/{sha}/check-runs` + `commits/{sha}/status` só com
  `mergeable: true` e `mergeable_state` `unstable`/`blocked` (ou para zerar a contagem). Prioridade:
  feedback → conflito → CI → merge automático. Respeita o limite de vagas (`runInCentral`).
- Etapa nova `fixing_ci` (agente da etapa Pull Request, sem aprovação) em `constants.ts`,
  `logic.ts`, `WorkbenchStageBadge`, filtros e barra de ações. `ciFixPrompt`: `gh run view
  --log-failed`, corrigir o mínimo (sem desativar testes), validar, commitar e `git push` (nunca
  force-push/rebase), comentar no PR. Falha de infraestrutura pode só ser reexecutada
  (`gh run rerun <run> --failed`, resposta `{"ok": true, "rerun": true}`), apenas na 1ª tentativa
  do commit.
- PR da mesa: `ciFixKey` (`sha:ids`, dedup), `ciFixAttempts` (zera quando o CI passa),
  `ciFixLimitNotified` (avisa uma vez no limite). Concluído, volta a `pr_open` (push invalida a
  prévia; rerun não). Falha: **Tentar novamente**/**Voltar ao planejamento**.
- Testes: `ci.test.ts`, `workflow-pr-ci.test.ts`, `pr-watch.test.ts`, `prompts.test.ts`.

### B — PR acompanhado ao vivo — ff0ecd0

> **Entregue na v2.60.0** (OPE-81) — descrito em `modules/agentic-dev.md`, "Acompanhamento do PR ao
> vivo". O CI aparece por ora só como passo informativo (`describeChecks`, gancho para o bloco A).

- `pr-watch-report.ts`: cada varredura vira um bloco **"Verificação do PR #N"** na Saída da IA
  com passos e horário (consulta, estado de merge, revisões/comentários, revisão automática via
  `gate.reviewStatus`, conflito, CI, merge automático, aguardando vaga) e desfecho
  `idle`/`action`/`error`.
- Eventos `pr-watch-step` (transitório) e `pr-watch` (gravado); o relato fecha **antes** da ação;
  falha do relato nunca derruba a varredura. `dropIdlePrWatchEvents`: só a última `idle` fica.
- `GET /api/agentic/pr-watch` (`loadPrWatchSchedule`: `CronJobState.nextRunAt` + rotina ligada).
- UI: `PrWatchItem` (em andamento e mais recente abertas, anteriores recolhidas) e
  `PrWatchCountdown` ("Próxima verificação em m:ss" / "Verificando o PR agora…" /
  "Acompanhamento automático do PR desligado"), com Framer Motion.
- Testes: `pr-watch-report`, `pr-watch-schedule`, `timeline-pr-watch`, `PrWatchItem`, `hub`,
  `pr-watch`, `gate`.

### C — Fork: modo Plan/Build e somente leitura — 836cb9d, 90bb384

> **Entregue na v2.58.0** (OPE-81) — descrito em `modules/agentic-dev.md`, "Forks da conversa"
> (ação de trava chamada `lock`).

- Fork guarda `readOnly` e o modo (`plan`/`build`); o modo inicial vem do agente (plan = somente
  leitura; demais = permissões do agente).
- `ForkModeSelect`: troca com o agente parado, refazendo permissões/protocolo da sessão e avisando
  o agente na próxima mensagem. Caixa **Somente leitura** na abertura (`ForkComposer`) ou trava
  posterior com confirmação, sem volta. Fork de fork não herda a trava.
- Rotas: opções em `forks/route.ts`; ações `set-mode`/`lock` em `forks/[forkId]/actions/[action]`.
- Testes: `ForkModeSelect`, `fork-logic`, `forks`, `forks-route`.

### D — Fork: "Pausar conversa" e integração no corpo — e2a42f3, 072fb79

> **Entregue na v2.57.0** (OPE-81) — descrito em `modules/agentic-dev.md`, "Forks da conversa".

- "Encerrar fork" → **"Pausar conversa"**, status "Encerrado" → **"Pausado"**, aviso com o
  próximo passo.
- Uma única área rolável: resumo/destino/ajuste da integração, resumo integrado (`ForkIntegrated`)
  e aviso de concluído no fim da conversa; botões da integração na barra inferior do fork.
- Testes: `ForkPanel`, `forks`.

### E — Atalhos da barra da mesa — 7c1bab8, 8482b0e

> **Entregue na v2.57.0** (OPE-81) — descrito em `modules/agentic-dev.md`, etapa da prévia.

- `ActionBar`: **"Abrir em nova guia"** como primeiro botão e **"Ver PR #N"** (`GitPullRequest`)
  quando há PR.
- Testes: `ActionBar.test.tsx`.

### F — Provedores Anthropic, OpenAI e DeepSeek — 3d4ee61

> **Entregue na v2.56.0.**

- Integrações `ai_anthropic`, `ai_openai`, `ai_deepseek` (API key como campo privado, sem `env`)
  com `@ai-sdk/anthropic`, `@ai-sdk/openai` (API Responses) e `@ai-sdk/deepseek` (validar
  compatibilidade com `ai` v7 no Context7).
- `src/lib/ai/{anthropic,openai,deepseek}.ts`: listagem de modelos e variantes de raciocínio;
  `stream.ts` mapeia a variante para a opção `reasoning` (sem temperatura na Anthropic com
  raciocínio). Testers, `ProviderModelCard`, `task-tags.ts`, `catalog.ts`/`providers.ts`.
- Atualizar `modules/ai.md` e a stack do `AGENTS.md`.
- Testes: `ai-providers`, `ai-stream`, `catalog`, páginas de IA (rede sempre mockada).

### G — Trocar o modelo na mesa e no fork — af504ce

> **Entregue na v2.59.0** (OPE-81) — descrito em `modules/agentic-dev.md`, "Trocar o modelo na mesa
> e no fork".

- Seletor de modelo (variante e "Voltar ao padrão") na barra da mesa (`WorkbenchModelPicker`, papel da
  etapa via `STAGE_MODEL_ROLE`) e do fork (ao lado do Modo), sobre o `ModelSearchPicker` extraído de
  `AgentConfigFields`. Troca só modelo/variante, validada no OpenCode; vale a partir do próximo turno.
- Mesa: `modelOverrides` por papel (`planning`, `implementation`, `build`, `pr`); fork:
  `modelOverride` (fork novo não herda; integrado/concluído → 409).
- Rotas `PUT …/workbenches/[id]/model` e `PUT …/forks/[forkId]/model`; DTO `models`/`model`.
- Ao portar o bloco A, `fixing_ci` entra em `STAGE_MODEL_ROLE` com o papel `pr`.
- Testes: `model-override`, `workflow-model`, `forks-model`, `model-routes`, `ModelOverridePicker`,
  `ActionBar`, `ForkPanel`.

### H — Agente Opex — b434dea, 261d10c

> **Entregue na v2.62.0** (OPE-81) — descrito em `modules/opex-agent.md`.

- Nativo (sem Recursos beta): `src/features/opex-agent/`, rotas `/api/opex/*` e
  `/api/ai/features/opex-agent`, item na barra lateral do dono e aba `agente-opex` em `/integracoes/ia`.
- Arquivos do chat no S3 com upload assinado (rotina `opex-files-cleanup` limpa pendentes em 24 h).
- Ferramentas sem Go! Sipal/beta, com os grupos extras Serviços, Financeiro (leitura) e Clientes, e
  `set_workbench_model` (bloco G).

## Riscos

- `pr-watch.ts` do Opex já combina revisão de PR, merge automático e vagas: A e B exigem port
  manual com testes de prioridade.
- `fixing_ci` precisa entrar em todos os mapas de etapa (filtros, selos, contagem de vagas).
- Prévia em HTTP (contexto não seguro): `randomId()`, nada de `navigator.clipboard`.
- Sem `TooltipProvider` global: cada tooltip novo traz o próprio provider.
