# Módulo: Desenvolvimento agêntico (`/desenvolvimento` + `/integracoes/ia`)

Agentes do **OpenCode** (só ele) trabalham numa tarefa dO Opex do plano ao merge. Cada
uma tarefa tem uma **mesa de trabalho**; cada **projeto** (repositório vinculado no GitHub) tem uma
**central** que aponta o repositório na máquina do OpenCode. OpenCode, Docker das prévias e o Opex
rodam na mesma máquina.

Código: `src/features/agentic/` (domínio), `src/lib/ai/opencode-client.ts` (cliente oficial
`@opencode/client`) e `src/lib/ai/opencode-events.ts` (eventos normalizados, puro). Modelos em
`src/lib/db/models/Agentic.ts`.

## Configuração (Integrações › Provedores de IA › aba "Desenvolvimento agêntico")

- Configuração geral em `ai_feature_settings` (`feature: "agentic-dev"`,
  `agenticSettingsSchema`): **ativa** e o **agente padrão** (agente, modelo `provedor/modelo`,
  variante) de cada etapa: **Planejamento**, **Implementação**, **Build e ambiente** (também faz a
  limpeza) e **Pull Request**. Agentes/modelos são conferidos no OpenCode ao salvar (com a feature
  ativa, exige o OpenCode conectado).
- Disponível = ativa + OpenCode configurado e conectado (`agenticAvailability`).
- A aba tem duas **abas internas** (estado local, não vão à URL; padrão **Agentes**):
  - **Agentes**: card que liga a feature (ativa) + os **agentes padrão** de cada etapa, com os botões
    **Salvar**/**Desfazer** (mesma configuração geral acima).
  - **Centrais de desenvolvimento**: card com a lista das centrais (abaixo).
  Trocar de aba com alterações não salvas pede *"Descartar alterações?"* e restaura os valores
  salvos (mesmo efeito do Desfazer). `AGENTIC_SETTINGS_HREF` (voltar da central, após excluir e
  atalho do `/desenvolvimento`) leva a esta aba na aba interna padrão (Agentes).
- Card **Centrais de desenvolvimento**: lista (projeto, diretório, repositório, mesas, bolinha do
  último teste) e **Nova central** (projeto — repositório vinculado, um por central — e diretório das
  sessões, caminho absoluto, já sugerido como `<raiz dos repositórios>/<repositório>`). Criar leva às
  configurações da central.

### Central (`/integracoes/ia/centrais/[id]`, `agentic_centrals`)

Configuração validada por `centralConfigSchema` (mesmo schema na tela e na API; campos ausentes
caem nos padrões em `parseCentralConfig`). Abas (`?aba=`, "Descartar alterações?"):

| Aba | Campos |
|---|---|
| Geral | ativa, diretório das sessões, pasta dos worktrees (padrão `<diretório das sessões>/worktrees`), mesas abertas ao mesmo tempo (1–10, padrão 2), repositório (do vínculo em Integrações › GitHub) |
| Agentes | cada etapa herda o padrão da aba ou é personalizada (override campo a campo: agente vazio herda; modelo próprio leva a variante própria — `resolveAgent`) |
| Git e PR | branch base, branch de destino do PR, padrões da branch/commit/título (`{code}`, `{title}`, `{slug}`), PR rascunho, revisores, labels, comandos de preparo do worktree e de validação antes do PR |
| Ambiente | arquivo do compose (vazio = padrão do projeto), variável da porta (padrão `PORT`), faixa de portas da prévia (porta inicial/final, padrão 4001–4098), endereço da prévia (host, padrão `localhost`), caminho do teste de saúde, tempo máximo do build |
| Colunas e conclusão | coluna da fila (abre a mesa automaticamente ao receber um card — "Nenhuma" por padrão), coluna ao abrir a mesa (implementação), ao abrir o PR e ao concluir (PR mergeado) — cada uma "Não mover" por padrão; limpeza após o merge (derrubar a prévia, remover o worktree, apagar a branch local) — tudo padrão **sim**; o que vai para o planejador (comentários, histórico) |
| Instruções | texto extra anexado às mensagens de cada etapa |
| Logs | terminal (`IntegrationDebugConsole` da integração `ai` com `scope=agentic:<id>`), sempre gravado (`integrationDebug(..., { always: true })`, 48 h) |
| Mesas | mesas da central com etapa e atalho |

- **Testar central** (`POST /api/agentic/centrals/[id]/test`): pelo `shell` do OpenCode no
  diretório da central confere `git rev-parse --show-toplevel`, `git ls-remote` das branches base e
  de destino, `gh auth status`, `docker compose version`, o arquivo do compose e a pasta dos
  worktrees; mais feature/OpenCode e o vínculo do repositório (aviso). Grava `lastTest`.
- Excluir a central só sem mesas em andamento (apaga as concluídas e a saída delas).

## Fila da central de desenvolvimento

Cada central pode apontar uma **coluna da fila** (`columns.queue`, `null` = desligada; aba "Colunas e
conclusão"). Ao mover um card para essa coluna, a tarefa do projeto entra na fila para abrir a mesa:

- **Vaga livre** (mesas abertas `< maxConcurrent`) → a mesa é criada **na hora** e o planejamento
  começa (o mesmo fluxo de "Abrir mesa e gerar o plano").
- **Sem vaga** → a tarefa **aguarda na fila** e a mesa é criada quando uma mesa conclui (ou é
  excluída). A ordem é a **dos cards no kanban** (`order`); a posição (1-based) aparece na lista de
  tarefas e na mesa como "Na fila · #N".
- O **limite** (`maxConcurrent`, "Mesas abertas ao mesmo tempo", 1–10) conta mesas **não concluídas**
  (`stage != done`). Uma mesa aberta nunca é bloqueada nos próprios turnos.
- A fila é **derivada** (`DevTask` do projeto na coluna, não arquivadas e sem mesa) — não há coleção
  própria. `GET /api/agentic/centrals/[id]/queue` devolve a fila para a tela.
- **Gatilhos**: mudança de coluna da tarefa (criar/atualizar/mover/lote) avisa a central; concluir
  ou excluir uma mesa libera a vaga; mudar a config da central reavalia a fila. A rotina interna
  **`agentic-queue-pump`** (1 min, Crons) cobre reinícios e vagas liberadas fora do processo.
- Sem OpenCode conectado, ou com a feature/central desativada, a tarefa **permanece na fila** e é
  iniciada quando ficar disponível. Mover o card para fora da coluna remove a tarefa da fila.
- Excluir a coluna da fila de uma central é bloqueado (`COLUMN_QUEUE_IN_USE`): troque a coluna na
  central antes.

## Fila do build (um build por vez)

A subida da prévia usa o Docker da máquina e roda **uma por vez em todo o Opex** (global, acima das
centrais). Ao concluir a implementação, a mesa entra na fila em vez de subir direto:

- A mesa vai para a etapa **`build_queued`** ("Na fila do build") e aguarda; a posição (1-based)
  aparece na lista de tarefas e na mesa como "Na fila do build · #N".
- Um **motor** (`build-queue.ts`, `pumpBuildQueue`) inicia o próximo build quando **não há nenhum
  build vivo no processo** (mesa em `building` e executando). A ordem é **FIFO** pela hora de entrada
  (`buildQueuedAt`); a porta da prévia só é reservada quando a vez chega (`startBuildTurn`).
- **Gatilhos**: fim da implementação, fim de cada build (sucesso ou falha/interrupção) e a rotina
  interna **`agentic-queue-pump`** (1 min, Crons), que cobre reinícios e vagas liberadas fora do
  processo.
- **Tentar novamente** num build que falhou **volta para a fila** (`build_queued`) em vez de subir
  direto. Enquanto aguarda, a mesa fica `idle` (o apontamento de horas não corre) e **não** oferece
  ações além de excluir a mesa.
- Um build órfão (o app reiniciou no meio) não trava a fila: só conta como build em andamento o
  turno vivo neste processo; ao ser lida, a mesa órfã vira `interrupted`.

## Central de desenvolvimento (`/desenvolvimento/[central]/[tarefa]`)

- Item próprio no menu. Sem central na URL, abre a primeira. Três colunas:
  **Centrais** | **Tarefas do projeto** | **Mesa de trabalho**.
- Navegar entre tarefas ou centrais **não** anima nem remonta a página inteira (`/desenvolvimento`
  está em `PERSISTENT_PAGE_HREFS` da casca): as colunas ficam paradas (rolagem e filtros mantidos)
  e só o que mudou faz um fade curto — a mesa ao trocar de tarefa, a lista de tarefas ao trocar de
  central (Framer Motion, sem deslocamento com movimento reduzido).
- A partir de `lg`, **Centrais** e **Tarefas** recolhem (botão no cabeçalho de cada uma) para uma
  faixa estreita de 48 px, e a mesa ocupa o espaço liberado (largura animada, `CollapsiblePane`).
  Faixa das centrais: um ícone por central (nome na dica), ainda navegável; faixa das tarefas:
  quantidade filtrada e o código da tarefa aberta. O conteúdo fica montado (rolagem e filtros se
  mantêm). Estado salvo em `localStorage` (`opex:dev-center-layout:v1`); abaixo de `lg` as
  colunas ficam empilhadas e sempre abertas.
- Tarefas: do quadro local filtradas pelo projeto da central (sem arquivadas), ordenadas pela
  ordem do quadro; filtros de **nome** (código/título, sem acento) e **coluna**, persistidos em
  `localStorage` (`opex:dev-center-filters:v1`). Lista virtualizada; cada tarefa mostra a etapa da
  mesa ou, sem mesa, a posição na fila ("Na fila · #N"). Quando a mesa está **parada aguardando o
  usuário**, o item mostra um **warning** (ícone de alerta, com o motivo na dica): revisão do plano,
  aprovação da prévia, revisão/merge do PR, "mudanças pedidas no PR", permissão ou pergunta
  pendente do agente, falha/interrupção (regra `workbenchUserWaitReason`; o chip de etapa deixa de
  pulsar quando o agente não está executando). Mesa **na fila do build** mostra a fila e mesa
  **concluída** não gera warning.
- Tarefa sem mesa: o estado inicial mostra o **código, o título e a descrição** da tarefa e um campo
  opcional de **Informações adicionais** (enviadas ao planejador no primeiro prompt, junto da tarefa,
  e exibidas como mensagem do usuário na saída). O botão **Abrir mesa e gerar o plano** desabilita com
  o motivo quando indisponível, com a central desativada ou com a tarefa de outro projeto; em fila,
  mostra a posição e abre ao liberar a vaga.
- Página da tarefa: botão de ícone **Mesa de trabalho** leva à mesa; com mesa, assume a cor da
  etapa e a dica mostra o chip da etapa.

## Mesa de trabalho (`agentic_workbenches`, uma por tarefa)

Uma **única sessão do OpenCode** do início ao fim (criada no diretório da central); cada etapa é
um **turno** em que o app troca agente/modelo (`switchAgent`/`switchModel`) e envia a mensagem da
etapa (`prompts.ts`). Os turnos rodam **em segundo plano no servidor** (`workflow.ts` +
`runner.ts`): fechar a tela não para a IA.

```
planning → plan_review ─┬─ Solicitar correção do plano → planning
                        └─ Implementar → implementing → build_queued → building → preview
preview ─┬─ Solicitar correção → planning (texto vai ao planejador)
         └─ Aprovar e abrir PR → opening_pr → pr_open
pr_open ─┬─ revisão "pediu mudanças" com texto → planning (automático)
         ├─ revisão sem texto → changes_requested (usuário descreve) → planning
         ├─ merge → finishing (limpeza) → done
         └─ fechado sem merge → aviso (uma vez)
done → Reabrir mesa (texto ao planejador) → planning
```

- `runState`: `idle` | `running` | `failed` | `interrupted`. Ações por etapa em
  `workbenchActions` (mesma regra na tela e nas rotas): executando só **Parar**; falha/interrupção →
  **Tentar novamente** (reenvia a mensagem da etapa pedindo para retomar) e, depois do plano,
  **Voltar ao planejamento**.
- **Planejamento**: só leitura; o texto do turno vira uma nova **versão do plano** (com o pedido que
  a originou). A tarefa vai em Markdown (`buildUnderstandTaskPrompt`) + link. As **Informações
  adicionais** informadas ao abrir a mesa são anexadas ao **primeiro prompt** (seção própria, sem
  virar o "pedido" da versão 1) e aparecem como mensagem do usuário na saída.
- **Implementação**: a branch (`branchNameFor`) e o caminho do worktree (`worktreePathFor`) são
  definidos pelo app; **a IA** cria o worktree a partir de `origin/<base>` (ou reutiliza), **move a
  sessão** com a ferramenta `session_move` do OpenCode, roda o preparo e implementa (commits locais,
  sem push). Ao fim o app confere o diretório da sessão; se não moveu, move pelo cliente (aviso).
- **Build**: ao fim da implementação a mesa entra na **fila global do build** (`build_queued`, ver
  acima) e só sobe quando não há outro build. A porta é reservada no banco (índice único) na faixa
  configurada na central (padrão **4001–4098**), pulando portas ocupadas no host
  (`allocatePreviewPort`); a IA roda
  `<VAR>=<porta> docker compose -p <projeto-código> [-f arquivo] up -d --build` no worktree e
  termina com um bloco JSON `{"ok": true|false, "error"?}`. O app espera a prévia responder
  (`http://<host>:<porta><saúde>`, até 90 s). Prévia pronta: **Abrir em nova guia**,
  **Solicitar correção**, **Aprovar e abrir PR**.
- **PR**: a IA valida, faz commit (padrão da central) e push e abre o PR com o `gh`
  (`--base`, título, `--draft`, revisores, labels); PR já aberto só é atualizado (push + comentário).
  Resposta `{"url", "number"}` (ou a última URL de PR do texto).
- **Acompanhamento**: rotina `agentic-pr-watch` dos Crons (a cada 2 min, `pr-watch.ts`) consulta o
  PR no GitHub (repositório tirado da URL do PR). Revisões novas (`id` > `lastReviewId`) com
  `CHANGES_REQUESTED` viram texto (corpo + comentários de linha) para o planejador.
- **Conclusão (merge)**: a tarefa vai para a coluna configurada em "Ao concluir" (se houver),
  a limpeza é feita pela IA (volta a sessão ao diretório da central, `docker compose down`,
  `git worktree remove`, `git branch -D`, conforme a central) e a porta é liberada.
- **Controle de horas agêntico**: a mesa abre/pausa/retoma/fecha o apontamento da tarefa conforme o
  agente trabalha ou espera o usuário (`timer-sync.ts`; ver `modules/time.md`). Não há controles
  manuais de timer e a central não tem mais as opções de timer.
- **Trabalhos em andamento** (`server/in-progress.ts`): lista as mesas **não concluídas** para o
  popover do indicador de tempo — executando (agente com período ativo) ou paradas com o **motivo da
  espera** (`workbenchWaitingReason`): revisão do plano, aprovação da prévia, revisão/merge do PR,
  permissão/pergunta pendente, falha ou interrupção. Somente leitura; cada item navega para a mesa.
- Abrir a mesa pode mover a tarefa para a coluna configurada em "Ao abrir a mesa"; falhas ao mover
  viram aviso na mesa, sem interromper.
- **Permissões e perguntas** do agente aparecem na mesa (`pendingPermissions`/`pendingForms`):
  Aprovar uma vez / Aprovar sempre / Recusar; formulários desenhados pelos campos do OpenCode
  (texto, número, sim/não, opções, múltipla escolha) com Responder ou Dispensar.
- Mesa "executando" sem turno vivo no processo (o app reiniciou) vira `interrupted` ao ser lida.
- **Excluir mesa**: interrompe, apaga a saída e libera a porta; worktree, branch, containers e PR
  ficam como estão.
- Custo e tokens acumulados por mesa (`session.step.ended`).

## Saída ao vivo

- `hub.ts` (em memória, `globalThis`): cada evento ganha `seq` por mesa, vai na hora para quem
  assiste e é gravado em lote em `agentic_events` (textos seguidos viram um documento; saída de
  ferramenta cortada em 20 mil caracteres guardando o fim). Raciocínio e progresso de ferramenta são
  só ao vivo.
- `GET /api/agentic/workbenches/[id]/events` (NDJSON): `reset` + tudo o que foi gravado + ao vivo,
  `ping` a cada 15 s. Sem buracos: assina, grava o pendente, lê o banco e descarta `seq` repetido.
  O cliente (`useWorkbenchStream`) reconecta sozinho (3 s; 45 s sem nada = reconectar) e reconstrói
  com `applyTimelineLine` (`timeline.ts`, puro).
- Mudanças de etapa/pedidos chegam pelo Pusher (`agentic-updated` em `private-app`, payload
  `{centralId, workbenchId, taskId}`) → `useAgenticRealtime` invalida as consultas `["agentic"]`.
- Tela: cabeçalho (código → página da tarefa, etapa, "ao vivo", custo, branch, worktree, porta,
  prévia, PR), passos (Plano → Implementação → Prévia → Pull Request → Concluída), abas **Saída da
  IA** (turnos, texto em Markdown, ferramentas recolhíveis — abertas enquanto executam, avisos) e
  **Plano vN** (versões), pedidos pendentes e barra de ações com o campo de correção.

## APIs (`src/app/api/agentic/`)

| Rota | Uso |
|---|---|
| `GET/PUT /settings` | configuração geral |
| `GET/POST /centrals`, `GET/PUT/DELETE /centrals/[id]`, `POST /centrals/[id]/test`, `GET /centrals/[id]/workbenches`, `GET /centrals/[id]/queue` | centrais |
| `POST /workbenches` `{centralId, taskId, text?}` | abre a mesa e inicia o plano; `text` são as informações adicionais do primeiro prompt (409 se já existir) |
| `GET /workbenches/in-progress` | mesas em andamento (executando ou aguardando ação humana) |
| `GET /workbenches/by-task/[taskId]`, `GET/DELETE /workbenches/[id]` | mesa |
| `POST /workbenches/[id]/actions/[action]` | `revise-plan`, `request-correction`, `submit-pr-feedback`, `reopen` (`{text}`); `implement`, `approve`, `retry`, `interrupt` |
| `POST /workbenches/[id]/permissions/[requestId]` `{decision, message?}` | resposta à permissão |
| `POST /workbenches/[id]/forms/[formId]` `{answer}` ou `{cancel: true}` | resposta à pergunta |
| `GET /workbenches/[id]/events` | stream NDJSON |

Auditoria: `CentralDesenvolvimento` (criar/editar/excluir) e `MesaDeTrabalho` (abrir, PR,
merge, reabrir, excluir).

## Testes

`__tests__/features/agentic/` (prompts, regras, linha do tempo, filtros, fila (`queue`), mesas em
andamento (`in-progress`), hub, runner com cliente falso, acompanhamento do PR, rota de ações, barra
de ações) e `__tests__/lib/ai/opencode-events.test.ts`. O OpenCode e o GitHub são sempre mockados.
