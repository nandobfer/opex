# Agentes rotineiros (OPE-130)

Agentes autônomos que o dono cria e lança. Cada agente rotineiro tem objetivo, instruções, motor,
modelo, ferramentas, limites, gatilhos e **memória própria no Engramind**. Cada disparo cria uma
**execução**, que planeja e age sozinha. Quando precisa esperar, ela fica em **espera viva** (turno
aberto) ou **hiberna** com reverificação agendada. Antes de uma ação irreversível, pede confirmação
ao dono (switch ligado). O webhook só cria execuções novas: nunca reativa uma existente.

Código: `src/features/routine-agents/` (regras puras na raiz, `server/`, `hooks/`, `components/`),
modelos em `src/lib/db/models/RoutineAgent.ts` (`routine_agents`, `routine_runs`,
`routine_run_steps`, `routine_entries`, `routine_agent_settings`; índices pela migração
`ensure-routine-agent-indexes`).

## Decisões do plano aprovado

| # | Decisão |
|---|---|
| D1 | O limite "Custo máximo por execução (USD)" virou **"Máximo de tokens por execução"** (`limits.maxTokens`): os provedores diretos não informam custo. O teto vale nos dois motores, é conferido a cada passo e, estourado, encerra em **Erro** "Limite de tokens atingido". O custo continua só informativo (aparece quando o provedor informa; soma parcial é sinalizada). |
| D2 | O subagente de provisionamento usa uma **configuração própria** de provedor/modelo (topo da aba Rotineiros). Sem ela, o provisionamento fica "com erro" com "Configure o modelo do provisionamento". |
| D3 | O **tempo ativo** conta Executando + Esperando (turno vivo). Hibernada e Aguardando confirmação contam no tempo máximo total esperando, que expira a execução. |
| D4 | No **motor Opex**, com o switch ligado, as ferramentas que já pedem confirmação no Agente Opex são **interceptadas**: destrutivas e `confirmByDefault` (inclusive de MCP) e os ajustes "Pede confirmação" do dono em Agente Opex › Ferramentas, que vencem os dos MCPs (mesma mescla do runner do Agente Opex; um ajuste que libera uma destrutiva também vale). A execução vai para Aguardando confirmação e a ação só roda depois de confirmada. No OpenCode, a confirmação depende de o agente chamar `request_confirmation`. |

| D5 | **Segredos** numa aba "Segredos" da página de cada rotineiro, só daquele agente. O Agente Opex usa a Chamada HTTP **sem** segredos. |
| D6 | Uma ferramenta **"Chamada HTTP"** (`http_request`, grupo `http`) para qualquer método, `risk: "write"` e **sem** confirmação por padrão; o dono liga em Agente Opex › Ferramentas e o ajuste vale nos rotineiros (D4). |
| D7 | A Chamada HTTP **não bloqueia endereços** (inclui a rede interna e os containers). Por isso o grupo `http` fica fora dos tokens de sistema. |
| D8 | **Nome e objetivo opcionais**: o subagente de provisionamento gera o que ficar vazio. O nome gerado é **só o papel** ("Recrutador"), como o `navLabel` dos agentes fixos; as telas mostram "Agente <nome>" (`routineAgentTitle`). |
| D9 | O **motor Opex não usa o OpenCode**: os provedores dele são os do Agente Opex (Gemini, Anthropic, OpenAI, DeepSeek — `OPEX_PROVIDER_IDS`); o OpenCode é só o motor "OpenCode no host". O card do subagente de provisionamento continua aceitando o OpenCode (D2). |
| D10 | A aba **Memórias** do rotineiro é **um card** com o **universo do agente igual ao de `/engramind`** (`AgentUniverse` da lib `@engramind/client`, o mesmo componente da rede): todas as memórias dos canais que ele assina. |
| D11 | **"Nova memória"** no universo do agente escolhe o **canal** entre os assinados e não arquivados (inicial: o canal próprio do rotineiro), em `/engramind` e no rotineiro. |
| D12 | Com o cursor sobre a partícula de uma memória, o nome aparece **completo e destacado** (antes sumia), em todos os universos. |
| D13 | As ferramentas de memória do rotineiro funcionam em **qualquer canal assinado e não arquivado** (próprio, global dos rotineiros, `opex` e extras do provisionamento), com o token do agente. Sem `canal`, vale o próprio. |
| D14 | **Gravação por chave**: `remember` aceita `canal`, `chave`, `titulo` e `tags`; com `chave` é idempotente (upsert do Engramind: a mesma chave atualiza a entrada, `criada: false`). `update_memory` edita por id com a versão lida. |
| D15 | **Leitura completa**: `list_my_memories` aceita `canal`, `chave` e `formato` (`completo`/`titulos`), devolve o texto inteiro e pagina por cursor, avisando `parcial: true` quando há mais. |
| D16 | O catálogo do Indexador fica em `experiencia/desenvolvimento` com chave `catalogo-<dono>-<repo>`; as 18 memórias de catálogo em prosa (sem chave) do canal próprio foram arquivadas (`scripts/routine-indexador-cleanup.ts`, reversível). |
| D18 | `/agentes-rotineiros` mostra **uma linha por agente** (card na largura inteira: identificação, 4 KPIs e "Execuções por dia") com os filtros padrão `ListFilters`: busca, status, motor e período, na URL. |
| D19 | No cabeçalho da página de agente, **"Configurar" e as ações ficam na linha do título**, sempre juntos (sem quebrar entre si); a descrição longa fica abaixo, na largura inteira, sem aumentar a distância entre título e descrição (escolha do dono na implementação, no lugar de cortar a descrição em 2 linhas). |
| D20 | O "Configurar" da página do agente rotineiro **abre o editor ali mesmo** (`?configurar=1`), sem navegar para a integração. |
| D21 | Na lista da aba Rotineiros da integração, o **nome do agente é um link** para `/agentes-rotineiros/[id]`. |
| D17 | Configuração do Indexador ajustada nesta tarefa: gatilho a cada **30 min**, lote de até 5, e as seções "Ordem do trabalho", "Receita 1", "Onde gravar" e "Idempotência" reescritas (catálogo primeiro, todas as páginas, chave fixa, pulados numa entrada `catalogo-pulados`). |

## Configuração (Integrações › Inteligência Artificial › aba "Rotineiros")

- **Subagente de provisionamento** (`RoutineProvisioningModelCard`, `GET/PUT /api/routine-agents/settings`):
  provedor, modelo, variante e agente do OpenCode, com **"Salvar modelo"** e **"Desfazer"** (ativos só
  com alteração; toast "Modelo do provisionamento salvo"). Com provedor escolhido, o modelo é
  obrigatório ("Escolha o modelo", na tela e na API pelo `routineAgentSettingsSchema`); sem provedor,
  salvar desliga o provisionamento. O card **não tem `<form>` próprio**: as abas de `/integracoes/ia`
  ficam dentro do formulário do `AiEditorForm`, e um formulário aninhado é descartado pelo HTML (o
  botão enviaria o formulário de fora e recarregaria a página) — salva por botão `type="button"`.
- Lista com status (**Ativo**, **Pausado**, **Arquivado**) e o selo de provisionamento. Filtro padrão
  "Ativos e pausados"; o filtro **"Arquivados"** mostra os arquivados.
- Ações: **"Novo agente rotineiro"**, editar, **Pausar/Retomar**, **Arquivar/Desarquivar** (com
  confirmação) e **"Reprovisionar"**. O editor abre por `?agente=<id>` (ou `?agente=novo`), que é o
  destino do "Configurar" da página do agente.
- Editor (react-hook-form + o mesmo `routineAgentInputSchema` da API), em seções:
  - **Geral**: nome (opcional — D8; único sem diferenciar maiúsculas/acentos; o slug nasce dele e
    não muda — um "Agente" no começo não entra no slug, `global` é reservado, colisão ganha sufixo),
    objetivo (opcional — D8), instruções (markdown) e o switch
    **"Pedir confirmação antes de ações irreversíveis"** (ligado por padrão).
  - **Motor** (`OptionTabs`): **Opex** (só os provedores do Agente Opex — D9; o OpenCode não aparece,
    com a dica "Para usar o OpenCode, escolha o motor OpenCode no host") ou **OpenCode no host** (modelos e
    agente do serviço OpenCode). O `ProviderModelCard` compartilhado aceita caminhos aninhados
    (`names`). Trocar o motor ou o modelo vale só para as próximas execuções (cada execução guarda um
    `snapshot` da configuração).
  - **Ferramentas**: Opex = a mesma árvore do Agente Opex (`ClienteOpexToolsCard` com a árvore do
    dono, **sem o grupo Agentes rotineiros** — `ROUTINE_FORBIDDEN_TOOL_GROUPS`: um rotineiro não
    confirma ações de outras execuções nem afrouxa a própria política) + os MCPs cadastrados no Opex
    (`ClienteOpexMcpCard`); OpenCode = os MCPs do
    `opencode.jsonc` do host (`GET /api/routine-agents/opencode-options`), com o MCP de navegador
    detectado pelo nome. As ferramentas internas aparecem fixas ("Sempre liberadas").
  - **Limites** (vazio = sem limite): execuções simultâneas, tempo máximo ativo, tempo máximo total
    esperando, **máximo de tokens** (D1) e espera viva máxima (sem valor: 10 min).
  - **Gatilhos** (vários): a cada N minutos/horas, diário em horário fixo, dias da semana com
    horário, único (data e hora) — sempre no horário de Brasília (UTC−3 fixo) — e **Webhook
    externo** (liga/desliga). O manual está sempre disponível.
  - **Provisionamento** (só editando): status, agente no Engramind, canais base, extras com o motivo,
    avisos, pasta no host, **"Tentar de novo"** e **"Reprovisionar"**.
- Não existe exclusão. **Pausar**: agendados não disparam (o vencido na pausa é descartado, sem
  acumular), webhook 409 `ROUTINE_AGENT_PAUSED`, execuções em andamento terminam normalmente.
  **Arquivar**: os efeitos da pausa + sai da lista padrão e de `/agentes-rotineiros`; desarquivar volta
  **pausado**. O Engramind fica intacto (agente, token, canais, memórias).
- Editar objetivo ou instruções **não** reprovisiona.

## Nome e objetivo gerados (D8, `identity-plan.ts` + passo `identity`)

- **Objetivo ou instruções são obrigatórios** ("Preencha o objetivo ou as instruções: o provisionamento
  gera o resto a partir deles"); nome e objetivo podem ficar vazios (campos com "Opcional: gerado pelo
  provisionamento se ficar vazio").
- Criado sem nome, o agente ganha slug `pendente-<id>` e `nameKey` `pendente:<id>` provisórios
  (chaves únicas próprias); a tela mostra "Agente rotineiro (gerando nome…)".
- Passo **`identity`** (o primeiro do provisionamento, antes do Engramind): o mesmo modelo do card
  "Subagente de provisionamento" responde `{ name, objective }` só com o que está vazio. Validação
  restritiva (`parseGeneratedIdentity`): nome com uma ou duas palavras, inicial maiúscula, só letras,
  até 30 caracteres, sem "Agente"/"Rotineiro" e sem repetir um agente fixo (`navLabel` do
  `AGENT_CATALOG`) nem outro rotineiro (sem diferenciar acentos); objetivo não vazio. Recusada, **uma**
  nova tentativa com o motivo; recusada de novo → "com erro" com "Não foi possível gerar o nome do
  agente: <motivo>. Informe o nome e o objetivo e tente de novo." ("Tentar de novo" retoma por ele).
- Grava só se o campo continua vazio, marca `generated.name`/`generated.objective` (selo **"Gerado"**
  no editor, que some quando o dono edita o campo), troca o slug provisório pelo definitivo e audita
  "gerar identidade".
- Edição: esvaziar o nome ou o objetivo de um agente provisionado roda só o passo (modo `identity`); o
  slug e os canais não mudam.

## Subagente de provisionamento (`server/provisioning.ts`)

- Cada chamada ao modelo do provisionamento tem teto de 3 min (`PLANNER_TIMEOUT_MS`, com `AbortSignal` e
  corrida que fecha o passo mesmo que o provedor ignore o sinal): estourou → provisionamento "com erro"
  com mensagem acionável, o registro em processo é liberado e "Tentar de novo" funciona.

Roda sozinho ao criar (em segundo plano, deduplicado por agente) e aplica tudo sem aprovação:

1. cadastra o agente `opex/rotineiro-<slug>` no Engramind (token de app; admin se não houver);
2. emite o token `agent` (escopos `read`, `write`) e guarda **cifrado** em `engramindToken` do
   documento — nunca vai para DTO, navegador, modelo, log ou auditoria (só o prefixo);
3. cria `agentes/rotineiros/global` e o canal próprio `agentes/rotineiros/<slug>` (admin) e assina
   `opex`, o global e o próprio (`inject`);
4. lista os canais (`GET /v1/channels`), pede ao modelo de D2 um JSON com `subscribe`/`create`
   (`provision-plan.ts`): canal inexistente é descartado com aviso, `create` que já existe vira
   assinatura, canais `agentes/...` de outros agentes e `opex` ficam de fora, no máximo 8 extras;
5. motor OpenCode: cria `~/opex-rotineiros/<slug>` no host pelo OpenCode (`workdir`).

Cada passo marca `provisioning.steps.*`. Falha → status **"Provisionamento com erro"** com a
mensagem; o agente não executa. **"Tentar de novo"** retoma: os passos são idempotentes (agente,
token válido, canais e assinaturas não duplicam) e os extras já avaliados não são reavaliados.
**"Reprovisionar"** refaz só os extras e **acrescenta** — nunca remove os base nem os extras antigos.

O provisionamento vivo fica num registro em processo (`server/provisioning-registry.ts`). Um
"Provisionando"/pendente **sem** provisionamento vivo é obsoleto (o servidor reiniciou no meio): o tick
o marca "com erro" depois de 2 min ("O provisionamento foi interrompido… Use \"Tentar de novo\"") e
"Tentar de novo"/"Reprovisionar" o aceitam na hora; com o provisionamento vivo, a API responde 409
`ROUTINE_AGENT_PROVISIONING`.

## Memória e rede (`src/features/ai/agents.ts`)

- Listas `routine-global` (`agentes/rotineiros/global`) e `routine-specific` (`scope: "routine"`,
  `agentes/rotineiros/<slug>`); `MemoryListScope.routineSlug`; `listOfChannel` reconhece os dois.
- Cada rotineiro é uma identidade dinâmica `rotineiro-<slug>` (fora de `MEMORY_IDENTITIES`):
  `isOpexMemoryAgent` marca o selo nas Identidades e a rede `/engramind` usa o ícone dos rotineiros.
  O consumo aparece como o dos outros agentes porque toda leitura usa o token do agente (webhook
  `memory.consumed`).
- Cada ativação lê o contexto com o token do agente (`getAgentMemoryContext(..., { target })`):
  `opex`, o global, o próprio e os extras. Engramind fora do ar sem cache → **Erro** acionável.
- O agente lê e grava em qualquer canal assinado e não arquivado (D13; lista de permissão conferida
  antes de chamar o Engramind, `ROUTINE_CHANNEL_NOT_ALLOWED` com os canais válidos), por
  `server/memory-channels.ts` com o token do agente:
  - `remember` (`texto`, `canal?`, `chave?`, `titulo?`, `tags?`, `categoria?`; `lista` só por
    compatibilidade): com `chave`, `POST /v1/memories` com `key` + `upsert: true` — uma entrada por item
    (D14). Sem chave e com similar ≥ 0,9, a resposta orienta usar `update_memory` ou chave.
  - `update_memory` (`id`, `texto?`, `titulo?`, `categoria?`, `tags?`, `versao?`): `PATCH` com
    `expected_version`; versão diferente → 409 acionável; memória de canal fora da lista é recusada.
  - `list_my_memories` (`canal?`, `chave?`, `formato`, `cursor?`, `limite`): texto inteiro (sem corte),
    `titulos` com `fields=title` (até 200 por página; 50 no completo), `parcial` + `proximoCursor` + aviso
    quando há mais páginas (D15).
  - No máximo 5 gravações por turno (`remember` + `update_memory` juntos).
  - Token do agente recusado (`AUTH_INVALID`, pelo código): repete com a credencial do Opex no mesmo
    canal (já conferido na lista), com aviso no log e na execução. Escrita negada no canal
    (`SCOPE_REQUIRED`/`CHANNEL_NOT_SUBSCRIBED`) → `ROUTINE_CHANNEL_FORBIDDEN` (reprovisionar); outros
    erros sobem sem repetir. Auditoria na entidade das memórias (`canal`, `chave`, `execucao`, sem texto).
  - As instruções da execução listam os canais graváveis e mandam consultar o canal (formato `titulos`)
    antes de trabalhar e usar chave fixa por item.
- Aba **Memórias** da página: `AgentMemoriesCard` de `routine-specific` (rotas
  `/api/routine-agents/[id]/memories`) e de `routine-global`.

## Execução

| Status | Significado | O que dispara |
|---|---|---|
| Na fila (`queued`) | Esperando vaga | Disparo/retomada com o limite de simultâneas atingido |
| Executando (`running`) | Turno ativo | Início ou retomada |
| Esperando (`waiting`) | Espera viva | `wait`, até a espera viva máxima |
| Hibernada (`hibernating`) | Turno encerrado, "Próxima verificação às HH:mm" | `hibernate` ou espera viva estourada |
| Aguardando confirmação | Ação irreversível pendente | `request_confirmation` ou ferramenta interceptada (D4) |
| Concluída / Erro / Cancelada / Expirada | Fim | `finish` / falha ou limite / dono / limite total de espera |

- Só Executando e Esperando ocupam vaga; a fila anda por ordem de chegada (`queuedAt`), com um lock
  em processo por agente e a reserva atômica `queued → running`.
- Ferramentas internas (sempre, nos dois motores): `remember`, `update_memory`, `list_my_memories`, `wait`
  (espera viva cancelável; soma por ativação; estourou → hiberna em 1 min), `hibernate` (mínimo
  1 min, com o motivo), `request_confirmation` (só com o switch ligado) e `finish` (relato final). As
  três últimas encerram o turno. Turno sem `finish` conclui com o último texto e um aviso.
- **Motor Opex** (`server/engines/opex.ts`): `prepareModel` + `streamText` (o mesmo loop do Agente
  Opex; o `streamAi` não aceita ferramentas), o registro do Agente Opex filtrado pelas liberadas, os
  MCPs liberados (`loadMcpTools(..., { serverIds })`) e o histórico do modelo em `messages` para a
  retomada. Ficam de fora, com aviso na execução: ferramentas removidas do catálogo, desligadas pelo
  dono no Agente Opex (`disabledTools`) e as do grupo proibido aos rotineiros (também recusadas ao
  executar uma ação confirmada). Consumo por passo em `recordAiConsumption` (origem `routine-agent`).
  **Uma ferramenta por vez depois de encerrar**: se uma ferramenta do passo já encerrou o turno
  (confirmação, hibernação, conclusão), as chamadas seguintes do mesmo passo não executam nem
  sobrescrevem a ação pendente (respondem "turno já encerrado, chame uma ferramenta por vez").
  **Histórico entre ativações** (`history.ts`, `trimRoutineHistory`): sem o raciocínio passado e
  cortado por ativação dentro do orçamento (`ROUTINE_HISTORY_CHAR_BUDGET`, o mesmo do Agente Opex) —
  a primeira ativação (disparo) fica sempre, das demais ficam as mais recentes, com um aviso no lugar
  das omitidas; o corte vale no envio e no que é gravado em `messages`.
- **Retenção dos passos**: ao fechar cada turno ficam só os `MAX_RUN_STEPS` passos mais recentes da
  execução (`pruneRunSteps`).
- **Motor OpenCode** (`server/engines/opencode.ts`): sessão na pasta do agente (recriada se apagada;
  sessão sumida → nova, com aviso), instruções por `session.instructions`, permissões que negam os
  MCPs do host não liberados, e as ferramentas internas **por rede** num MCP do Opex por execução
  (`POST /api/routine-agents/mcp/<runId>`, em `PUBLIC_PREFIXES`, autenticado por um segredo
  aleatório da execução — só o hash no banco; registrado como `rotina_<id>` e removido no fim).
  Serviço desligado → **Erro** com o motivo. As permissões falham fechadas: sem conseguir listar os
  MCPs do host → **Erro** acionável; sessão reaproveitada cujas permissões não puderam ser atualizadas
  → sessão nova, com aviso. As chamadas ao MCP da execução (memória, Chamada HTTP) viram passos.
- Limites conferidos a cada passo (tokens) e por temporizador (tempo ativo). Estourou → **Erro**.
- **Teto técnico do turno** (`ROUTINE_TURN_TIMEOUT_MS`, 6 h, nos dois motores): sem "Tempo máximo
  ativo" (ou com um maior), o turno é interrompido no teto → **Erro** "O turno passou do teto técnico de
  6 h…". Interrompido por qualquer motivo, se o motor não parar em 15 s (provedor ou ferramenta que
  ignoram o sinal), o turno fecha mesmo assim: a vaga é liberada e a fila anda.
- Confirmar/recusar (`server/run-actions.ts`): atômico; a segunda resposta → 409
  `ROUTINE_ACTION_ALREADY_RESOLVED`. Confirmar uma ferramenta interceptada a executa no servidor e
  retoma com o resultado; confirmar um pedido retoma com "Confirmado: execute agora"; recusar retoma
  com a recusa. A execução volta para a fila (respeita a vaga). A resposta grava já no claim o texto
  da retomada (com o aviso de que o resultado pode não ter chegado, trocado pelo resultado quando a
  ação roda); se o processo cair ou a gravação falhar antes da fila, o agendador retoma a execução com
  esse texto (a auditoria que falha só vira aviso no log).
- **Cancelar** existe em todo status não final (confirmação na tela; ferramenta destrutiva no Agente
  Opex).

### Agendador (`runDueRoutineAgents`, fim de `runSchedulerTick`)

0. Provisionamento "Provisionando"/pendente sem processo vivo há mais de 2 min → **com erro**.
1. Executando/Esperando sem turno vivo há mais de 30 s (reinício) → **Erro** "O turno da execução foi
   perdido" (limitação conhecida: o turno vive no processo).
2. Confirmação já respondida que não voltou para a fila há mais de 1 min (e sem resposta em andamento
   no processo) → volta para a fila com o texto gravado na resposta. Hibernada/aguardando além do
   tempo total de espera → **Expirada**.
3. Hibernada vencida → volta para a fila na mesma sessão, com o motivo e o atraso.
4. Gatilho vencido: **um** disparo mesmo com várias janelas perdidas (atraso em `delayMs`); o
   próximo horário é gravado antes de disparar (dois ticks não repetem a janela); agente pausado,
   arquivado ou sem provisionamento descarta o disparo.
5. A fila de cada agente anda.

## Páginas

- `/agentes-rotineiros` (item **"Rotineiros"** da categoria Agentes, entrada `rotineiros` do
  `AGENT_CATALOG`, D18): uma linha por agente não arquivado (`RoutineAgentRow`, grade de
  `routine-agents-layout.ts` compartilhada com o skeleton):
  - identificação (link para a página do agente): nome, selos de status e provisionamento, objetivo inteiro
    (quebra a linha, sem corte), motor e modelo, última execução e próximo disparo;
  - KPIs Execuções, Concluídas, Com erro e Tokens, e o gráfico "Execuções por dia" (`UsageByDateChart`
    compacto) do período escolhido; sem execuções → "Sem execuções no período.";
  - filtros (`RoutineAgentsFilters`, `ListFilters`; regras puras em `list-filters.ts`, estado na URL):
    busca por nome/objetivo (fuse.js), Status (Ativo, Pausado, Provisionando, Com erro de provisionamento —
    o provisionamento incompleto vence o status do agente), Motor (Todos/Opex/OpenCode) e Período
    (`MetricsPeriodFilter`, compartilhado com o `MetricsFiltersBar`) na segunda linha;
  - métricas de todos numa chamada (`GET /api/routine-agents/metrics?periodo=&de=&ate=`,
    `getRoutineAgentsMetrics`), com a mesma agregação pura da Visão geral (`aggregateRoutineMetrics`);
    o tempo real invalida a chave em `routine-run-updated`;
  - vazio sem agentes leva a `?aba=rotineiros&agente=novo`; vazio com filtros oferece "Limpar filtros";
    mais de 50 agentes → `VirtualStack`.
- `/agentes-rotineiros/[id]`: `AgentPageFrame` (moldura extraída da `AgentPage`), com **Configurar** (abre o
  `RoutineAgentEditor` na própria página, `?configurar=1`, D20) e **"Executar agora"**, na linha do título
  (D19), (diálogo com "Solicitação desta execução"; desabilitado pausado ou sem
  provisionamento). Abas na URL (`?aba=`): **Visão geral** (KPIs execuções, concluídas, com erro,
  tempo médio, tokens e custo, gráficos por dia, filtro de período compartilhado —
  `GET /api/routine-agents/[id]/metrics?periodo=`), **Execuções** (lista ao vivo, detalhe em
  `?execucao=` com passos, ferramentas, relato, avisos, ação pendente e Cancelar), **Entradas**,
  **Memórias** e **Segredos**.
- **Memórias** (`RoutineMemoriesTab`, D10/D11): um card "Rede de memórias" com o `AgentUniverse` da lib
  (`agent="opex/rotineiro-<slug>"`, `defaultCreateChannel` = canal próprio), dentro do
  `OpexEngramindProvider`: as memórias de `opex`, `agentes/rotineiros/global`, do canal próprio e dos
  extras, com as ações do `/engramind` (ativar, fixar, editar, mover, histórico, excluir, pelo proxy do
  gestor) e o tempo real pelo SSE da lib. "Nova memória" pede o canal entre os assinados. Agente ainda não
  cadastrado no Engramind: estado vazio da lib (concluir o provisionamento). As Entradas continuam
  gravando no canal próprio ou no global.
- **Agente gravado com o OpenCode no motor Opex** (antes de D9): o DTO devolve o provedor e o modelo
  vazios (o editor pede outro; o banco só muda ao salvar); o disparo (manual, agendado, webhook, Agente
  Opex) é recusado com 409 `ROUTINE_ENGINE_PROVIDER_INVALID`, sem criar execução, e "Executar agora" fica
  desativado com o motivo; uma execução já na fila com esse snapshot termina em Erro sem chamar o modelo.
- **Entradas do dono** (não é chat): texto + destino "Este agente"/"Todos os rotineiros"; cada entrada
  grava uma memória (`routine_entries` guarda o histórico); vazio é recusado e, com o Engramind fora
  do ar, o toast de erro mantém o texto no campo.
- Toast em qualquer tela (`useRoutineAttentionToasts`, no `AppLayoutShell`): confirmação pendente e
  fim da execução, com **"Abrir execução"**.

## API

- Dono (`requireAdminSession`): `GET/POST /api/routine-agents` (`?filtro=arquivados`),
  `GET/PATCH /api/routine-agents/[id]`, `POST .../status` (`pause|resume|archive|unarchive`),
  `POST .../provisioning` (`reprovision|retry`), `GET/POST .../runs`, `GET .../metrics`,
  `GET /api/routine-agents/metrics` (todos os agentes não arquivados, lista `/agentes-rotineiros`),
  `GET/POST .../entries`, `.../memories`, `GET /api/routine-agents/runs/[runId]` e
  `POST .../confirm|reject|cancel`, `GET/PUT /api/routine-agents/settings`,
  `GET /api/routine-agents/opencode-options`.
- Pública: `POST /api/v1/routine-agents/{id}/runs` (escopo `api:v1:routine-agents`), corpo opcional
  `{ request?, payload? }` (POST sem corpo, inclusive `Content-Length: 0`, vale como `{}`; JSON inválido → 400
  `INVALID_JSON`) (payload até 64 KB, senão 400 `PAYLOAD_TOO_LARGE`). Respostas: 201
  `{ runId, status }`, 404, 409 `ROUTINE_AGENT_PAUSED` / `ROUTINE_AGENT_WEBHOOK_DISABLED` /
  `ROUTINE_AGENT_NOT_PROVISIONED`, 401/403. Documentada na OpenAPI e em `PUBLIC_TOKEN_ROUTES`.

## Agente Opex

- **Token de sistema não amplia o próprio alcance pelo rotineiro**: em `create_routine_agent` e
  `update_routine_agent` chamados por token (`origin.kind = "api-token"`, com `origin.scopes`), cada
  ferramenta NOVA em `opex.enabledTools` precisa da mesma decisão que o token teria para chamá-la
  (`mcpOwnerToolDecision`: `http` e `files` nunca; destrutivas só com `mcp:owner:destructive`); MCPs novos
  e a Chamada HTTP do motor OpenCode só pelo dono. O que o dono já liberou continua como está.

Grupo `routine-agents` (`server/tools/routine-agents.ts`, só no dono): `list_routine_agents`,
`get_routine_agent`, `create_routine_agent`, `update_routine_agent`, `pause_routine_agent`,
`archive_routine_agent` (destrutiva), `reprovision_routine_agent`, `run_routine_agent`,
`list_routine_runs`, `cancel_routine_run` (destrutiva), `confirm_routine_action` (`confirmByDefault`:
a ação confirmada pode ser destrutiva, então pede Confirmar/Cancelar no chat e exige
`mcp:owner:destructive` por token), `reject_routine_action` e `add_routine_entry`. Chamam os serviços reais; nenhum DTO traz o token.

## Segredos (D5, aba "Segredos", `server/secrets.ts`)

- Coleção `routine_agent_secrets` (`RoutineAgentSecret`, índice único `agentId + name`): `name`
  (`^[A-Z][A-Z0-9_]{1,63}$`), `description` (até 300, o agente lê), `value` cifrado (`secretBox`, de 4 caracteres
  a 16 KB), `allowedHosts` (domínios ou `*.dominio`; vazio = qualquer), `lastUsedAt`. Até 50 por agente.
- Rotas do dono: `GET/POST /api/routine-agents/[id]/secrets`, `PATCH/DELETE .../secrets/[secretId]`
  (`routineSecretCreateSchema`/`routineSecretUpdateSchema`). No PATCH, valor vazio mantém o atual.
- O valor **só entra**: nenhuma resposta, DTO, auditoria (`SegredoAgenteRotineiro`, só nome,
  descrição e domínios), log ou evento o traz. Tempo real pelo `routine-agent-updated` `{ id }`
  (o `useRoutineRealtime` invalida também os segredos).
- Tela (`components/page/secrets/`): lista com nome, "Valor: definido", descrição, domínios,
  atualizado/último uso, **"Novo segredo"**, **Editar** (valor vazio, "Deixe vazio para manter o valor
  atual") e **Excluir** (confirmação); diálogo com o mesmo schema, valor tipo senha com mostrar/ocultar.
- Na ativação, o cofre (`loadRoutineSecretVault`) é lido na hora (uma edição vale já na próxima
  ativação); os valores só ficam em memória. Com a Chamada HTTP liberada, as instruções listam nome,
  descrição e domínios e a regra `{{secret:NOME}}` — nunca o valor.
- **Chamada HTTP**: motor Opex = a ferramenta `http_request` liberada na árvore (recebe o cofre pelo
  contexto; confirmação pelo ajuste do dono, D4/D6); motor OpenCode = switch **"Chamadas HTTP com
  segredos"** (`opencode.httpRequests`, desligado por padrão) que põe a `http_request` no MCP da
  execução — a chamada sai do servidor Opex e o OpenCode recebe só a resposta mascarada (webfetch e
  bash do OpenCode não têm os segredos). Nesse caminho vale a mesma política do motor Opex
  (`guardedRoutineTool`): desligada no Agente Opex, a ferramenta fica de fora com aviso; com o switch
  de confirmação ligado e o ajuste "pede confirmação" do dono, vira Aguardando confirmação. Cada
  chamada ao MCP da execução vira passo da execução (entrada sem segredos). Uma ação confirmada que é
  Chamada HTTP também recebe o cofre.
  Detalhes da ferramenta em `aicontext/modules/opex-agent.md`, "Chamadas HTTP".

## Auditoria, logs e tempo real

- `recordAudit` em `AgenteRotineiro` (criar, editar, pausar/retomar, arquivar/desarquivar,
  provisionar/reprovisionar, entrada) e `ExecucaoAgenteRotineiro` (disparar, confirmar, recusar,
  cancelar, concluir/erro/expirar). Logs Pino (`module: routine-agents`).
- Pusher em `private-app`: `routine-agent-updated` (`{ id }`), `routine-run-updated`
  (`{ id, agentId, status }`) e `routine-run-attention` (`{ id, agentId, kind, status, agentName }`).
  As telas invalidam o TanStack Query (`useRoutineRealtime`).

## Limitações conhecidas

- O turno vive no processo do servidor: reinício durante Executando/Esperando vira Erro.
- O navegador do motor Opex depende de um MCP de navegador cadastrado no Opex (o container não tem
  navegador); no OpenCode, do MCP de navegador do host.
- No OpenCode, a confirmação depende de o agente chamar a ferramenta (cliques no navegador não são
  interceptados).
- O mascaramento dos segredos cobre o valor literal, codificado para URL e em base64; um valor
  transformado de outro jeito pelo destino (hash, por exemplo) não é reconhecido. Por isso o valor
  tem no mínimo 4 caracteres (um segredo mais curto é recusado no cadastro e na chamada).
