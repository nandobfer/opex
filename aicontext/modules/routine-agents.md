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
  - **Geral**: nome (único sem diferenciar maiúsculas/acentos; o slug nasce dele e não muda —
    `global` é reservado, colisão ganha sufixo), objetivo, instruções (markdown) e o switch
    **"Pedir confirmação antes de ações irreversíveis"** (ligado por padrão).
  - **Motor** (`OptionTabs`): **Opex** (provedores de texto do app) ou **OpenCode no host** (modelos e
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

## Subagente de provisionamento (`server/provisioning.ts`)

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
- O agente grava (`remember`, no máximo 5 por turno) só no canal próprio e no global
  (`createAgentMemory(..., { agent: { consumer: "rotineiro", target } })`).
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
- Ferramentas internas (sempre, nos dois motores): `remember`, `list_my_memories`, `wait`
  (espera viva cancelável; soma por ativação; estourou → hiberna em 1 min), `hibernate` (mínimo
  1 min, com o motivo), `request_confirmation` (só com o switch ligado) e `finish` (relato final). As
  três últimas encerram o turno. Turno sem `finish` conclui com o último texto e um aviso.
- **Motor Opex** (`server/engines/opex.ts`): `prepareModel` + `streamText` (o mesmo loop do Agente
  Opex; o `streamAi` não aceita ferramentas), o registro do Agente Opex filtrado pelas liberadas, os
  MCPs liberados (`loadMcpTools(..., { serverIds })`) e o histórico do modelo em `messages` para a
  retomada. Ficam de fora, com aviso na execução: ferramentas removidas do catálogo, desligadas pelo
  dono no Agente Opex (`disabledTools`) e as do grupo proibido aos rotineiros (também recusadas ao
  executar uma ação confirmada). Consumo por passo em `recordAiConsumption` (origem `routine-agent`).
- **Motor OpenCode** (`server/engines/opencode.ts`): sessão na pasta do agente (recriada se apagada;
  sessão sumida → nova, com aviso), instruções por `session.instructions`, permissões que negam os
  MCPs do host não liberados, e as ferramentas internas **por rede** num MCP do Opex por execução
  (`POST /api/routine-agents/mcp/<runId>`, em `PUBLIC_PREFIXES`, autenticado por um segredo
  aleatório da execução — só o hash no banco; registrado como `rotina_<id>` e removido no fim).
  Serviço desligado → **Erro** com o motivo.
- Limites conferidos a cada passo (tokens) e por temporizador (tempo ativo). Estourou → **Erro**.
- **Teto técnico do turno** (`ROUTINE_TURN_TIMEOUT_MS`, 6 h, nos dois motores): sem "Tempo máximo
  ativo" (ou com um maior), o turno é interrompido no teto → **Erro** "O turno passou do teto técnico de
  6 h…". Interrompido por qualquer motivo, se o motor não parar em 15 s (provedor ou ferramenta que
  ignoram o sinal), o turno fecha mesmo assim: a vaga é liberada e a fila anda.
- Confirmar/recusar (`server/run-actions.ts`): atômico; a segunda resposta → 409
  `ROUTINE_ACTION_ALREADY_RESOLVED`. Confirmar uma ferramenta interceptada a executa no servidor e
  retoma com o resultado; confirmar um pedido retoma com "Confirmado: execute agora"; recusar retoma
  com a recusa. A execução volta para a fila (respeita a vaga).
- **Cancelar** existe em todo status não final (confirmação na tela; ferramenta destrutiva no Agente
  Opex).

### Agendador (`runDueRoutineAgents`, fim de `runSchedulerTick`)

0. Provisionamento "Provisionando"/pendente sem processo vivo há mais de 2 min → **com erro**.
1. Executando/Esperando sem turno vivo há mais de 30 s (reinício) → **Erro** "O turno da execução foi
   perdido" (limitação conhecida: o turno vive no processo).
2. Hibernada/aguardando além do tempo total de espera → **Expirada**.
3. Hibernada vencida → volta para a fila na mesma sessão, com o motivo e o atraso.
4. Gatilho vencido: **um** disparo mesmo com várias janelas perdidas (atraso em `delayMs`); o
   próximo horário é gravado antes de disparar (dois ticks não repetem a janela); agente pausado,
   arquivado ou sem provisionamento descarta o disparo.
5. A fila de cada agente anda.

## Páginas

- `/agentes-rotineiros` (item **"Rotineiros"** da categoria Agentes, entrada `rotineiros` do
  `AGENT_CATALOG`): agentes não arquivados com status, última execução e próximo disparo; vazio leva a
  `?aba=rotineiros&agente=novo`.
- `/agentes-rotineiros/[id]`: `AgentPageFrame` (moldura extraída da `AgentPage`), com **Configurar** e
  **"Executar agora"** (diálogo com "Solicitação desta execução"; desabilitado pausado ou sem
  provisionamento). Abas na URL (`?aba=`): **Visão geral** (KPIs execuções, concluídas, com erro,
  tempo médio, tokens e custo, gráficos por dia, filtro de período compartilhado —
  `GET /api/routine-agents/[id]/metrics?periodo=`), **Execuções** (lista ao vivo, detalhe em
  `?execucao=` com passos, ferramentas, relato, avisos, ação pendente e Cancelar), **Entradas** e
  **Memórias**.
- **Entradas do dono** (não é chat): texto + destino "Este agente"/"Todos os rotineiros"; cada entrada
  grava uma memória (`routine_entries` guarda o histórico); vazio é recusado e, com o Engramind fora
  do ar, o toast de erro mantém o texto no campo.
- Toast em qualquer tela (`useRoutineAttentionToasts`, no `AppLayoutShell`): confirmação pendente e
  fim da execução, com **"Abrir execução"**.

## API

- Dono (`requireAdminSession`): `GET/POST /api/routine-agents` (`?filtro=arquivados`),
  `GET/PATCH /api/routine-agents/[id]`, `POST .../status` (`pause|resume|archive|unarchive`),
  `POST .../provisioning` (`reprovision|retry`), `GET/POST .../runs`, `GET .../metrics`,
  `GET/POST .../entries`, `.../memories`, `GET /api/routine-agents/runs/[runId]` e
  `POST .../confirm|reject|cancel`, `GET/PUT /api/routine-agents/settings`,
  `GET /api/routine-agents/opencode-options`.
- Pública: `POST /api/v1/routine-agents/{id}/runs` (escopo `api:v1:routine-agents`), corpo opcional
  `{ request?, payload? }` (payload até 64 KB, senão 400 `PAYLOAD_TOO_LARGE`). Respostas: 201
  `{ runId, status }`, 404, 409 `ROUTINE_AGENT_PAUSED` / `ROUTINE_AGENT_WEBHOOK_DISABLED` /
  `ROUTINE_AGENT_NOT_PROVISIONED`, 401/403. Documentada na OpenAPI e em `PUBLIC_TOKEN_ROUTES`.

## Agente Opex

Grupo `routine-agents` (`server/tools/routine-agents.ts`, só no dono): `list_routine_agents`,
`get_routine_agent`, `create_routine_agent`, `update_routine_agent`, `pause_routine_agent`,
`archive_routine_agent` (destrutiva), `reprovision_routine_agent`, `run_routine_agent`,
`list_routine_runs`, `cancel_routine_run` (destrutiva), `confirm_routine_action`,
`reject_routine_action` e `add_routine_entry`. Chamam os serviços reais; nenhum DTO traz o token.

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
