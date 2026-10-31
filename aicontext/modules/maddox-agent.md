# Módulo: Agente Maddox (`src/features/maddox-agent/`)

Agente de chat do Opex que funciona como o **Agente Opex** (mesmo popover, sessões, arquivos e
estados), mas roda numa **sessão do OpenCode** (`runAgentTurn` de `src/lib/ai/opencode-run.ts`), no
**diretório padrão do serviço OpenCode** da integração (sem campo de diretório). Ele usa as
ferramentas nativas do OpenCode no host do dono (terminal, arquivos, skills e os MCPs configurados no
OpenCode) e recebe as ferramentas do Opex por um **servidor MCP do Opex**. Por padrão só o dono tem
acesso; o dono liga o Maddox por cliente no portal de orçamentos (OPE-101).

## Onde fica e como abre (item único dos agentes)

- O Maddox **divide o item da barra lateral com o Agente Opex** (`AgentChatNavItem`, em
  `src/features/opex-agent/components/agents/`): um único item, no rodapé do menu do dono e do portal,
  que abre o **último agente escolhido** (guardado no navegador: `opex:chat-agent:active:v1`, e no
  portal `…:{clientId}:{userId}`; `resolveActiveAgent` cai no outro agente quando o guardado não está
  disponível). O item mostra o nome, o ícone (`Orbit` no Maddox, `Bot` no Opex) e a cor do agente
  ativo, com troca animada.
- **Troca no cabeçalho do popover** (`AgentSwitcherHeader`): à esquerda o agente ativo (avatar, nome e
  modelo); ao lado, o **outro agente** num botão menor, apagado e em tons de cinza (`opacity-50
  grayscale`, borda tracejada), que acende com a cor dele no hover/foco. Clicar troca o agente do
  popover **e** do item da barra lateral. O botão vai do avatar até o nome/modelo; com só um agente
  disponível ele não aparece. Um ponto aparece no botão quando o agente inativo está respondendo.
- Os painéis já abertos ficam montados (ocultos): trocar e voltar preserva abas, rascunho, envios e
  respostas em andamento. As filas de envio dos dois agentes ficam no item (fechar ou trocar não perde
  envios), e as sessões/tempo real dos dois ficam assinados enquanto disponíveis.
- **Ponto pulsando** no item: alguma sessão de **qualquer** agente respondendo ou aguardando
  confirmação (na cor do agente ocupado; o ativo tem prioridade).
- **Atalhos**: **Ctrl+Shift+M** (⌘+Shift+M) abre/fecha no Maddox; **Ctrl+Shift+O** continua do Agente
  Opex. Com o popover aberto em outro agente, o atalho troca de agente.
- **Engrenagem** no cabeçalho (só no app do dono): leva à configuração do agente ativo
  (`/integracoes/ia?aba=agente-maddox` ou `?aba=agente-opex`) e fecha o popover.
- Celular (< 768 px): tela cheia, como o Agente Opex.
- Portal: o item aparece se o Opex **ou** o Maddox estiver ligado para o cliente; sem nenhum, some.

## Chat

- Mesmo chat do Agente Opex (componentes em `opex-agent/components/chat/`): abas e lista de sessões
  (busca, arquivar, renomear, excluir), arquivos no chat, citar, Tentar novamente, Parar, Ir para o
  fim, Maximizar e os estados de vazio, carregando, erro, não configurado e reconectando. Jobs
  agendados ficam **de fora**. As sessões do Maddox são separadas das do Agente Opex.
- **Seletor de modelo** na linha do modelo do cabeçalho (`ModelOverridePicker` compartilhado, em
  `src/features/ai/components/model-picker/`): modelos e variantes do catálogo do OpenCode
  (`GET /api/maddox/models` ou `/api/cliente/maddox/models`). A troca vale **só para a sessão atual**
  (`opex_sessions.modelOverride`, conferido no catálogo); na "Nova sessão", a escolha vai na criação.
  Sessões novas começam no modelo padrão. O modelo usado aparece no rodapé de cada resposta.
- **Cor** (configuração): paleta das colunas (`ColumnColorPicker` com a opção "Primária (padrão)" =
  `null`). `agentColorStyle` (`colors.ts`) sobrescreve `--primary`, `--primary-foreground` e `--ring` no
  contêiner do agente com os tokens do tema `--agent-{cor}` e `--agent-{cor}-foreground`
  (`globals.css`), então ícone, ponto, cabeçalho, destaques e bolhas usam a cor sem markup novo nem
  valor fixo em código; o token `-foreground` traz o texto legível (contraste) de cada cor.
  A cor padrão (`null`) também é aplicada explicitamente, com `--agent-primary`/`--agent-primary-foreground`/
  `--agent-ring` (a primária do tema resolvida no `:root`): sem isso, um elemento do Agente Opex dentro
  do contêiner do Maddox (o botão de troca no cabeçalho, o ponto da barra lateral) herdaria a cor do
  Maddox.
- **Ferramentas** viram cards como no Agente Opex: as do Opex (`opex_app_*` no dono, `opex_portal_*`
  no portal) com o rótulo e o ícone do grupo do catálogo; as nativas do OpenCode com o próprio nome e o
  ícone de terminal (grupo `opencode-native`).
- **Segredos**: a entrada exibida das ferramentas do Opex é a entrada completa da chamada com o
  `redact` da ferramenta (`redactToolInput`, o mesmo do Agente Opex; entrada que não valida numa
  ferramenta com `redact` não sai). A entrada completa só chega porque o turno do Maddox pede
  `exposeRawToolInput` ao `runAgentTurn`; mesas, forks e revisões continuam recebendo só o resumo
  cortado. O resumo cru do OpenCode nunca é usado nas ferramentas do Opex; no chat ao vivo
  (NDJSON) e em `opex_messages.parts` não ficam tokens, senhas nem headers/variáveis de MCP.
- **Confirmação**: segue as permissões do OpenCode. Quando o OpenCode pede permissão
  (`permission.asked`), o card da chamada (`source.id`; sem ele, um card "Permissão · …") mostra
  **Confirmar/Cancelar** (linha NDJSON `tool-confirmation`); a resposta vai ao OpenCode
  (`permission.reply` `once`/`reject`) e o turno continua. Enquanto houver pedido aberto a sessão fica
  **aguardando confirmação** (`pendingRequests`), com o ponto pulsando; fechar o popover não cancela.
- **Perguntas** do OpenCode (formulários) aparecem no chat com o card genérico de perguntas
  (`AgentQuestionsCard`, o mesmo da mesa) e são respondidas ou dispensadas pela rota `forms/[id]`.
- Pedidos ainda abertos quando o turno termina viram "expirado"/"dispensada" (`closePendingRequests`).

## Turno (`server/runner.ts`)

1. Confere o agente ativo, o OpenCode e o modelo (`maddoxAvailability`; indisponível = 409
   `MADDOX_UNAVAILABLE` com o motivo em pt-BR) e reserva a sessão (um turno por sessão).
2. Modelo: o da sessão se ainda estiver no catálogo; senão volta ao padrão, limpa a troca e avisa no
   chat (`resolveTurnModel`, módulo puro `runner-model.ts`).
3. Registra os MCPs do Opex no OpenCode (`ensureMaddoxMcp`); falha vira aviso nas instruções do turno.
4. Cria a sessão do OpenCode na primeira vez (ou se sumiu do host), com `metadata { app: "opex", kind:
   "maddox", sessionId }`, e regrava a cada turno as **permissões** da sessão e as **instruções**
   (`session.instructions.entry`, chave `opex-maddox`): instruções da configuração (dono) ou as fixas do
   portal com cliente, usuário e papel, mais as memórias.
5. Arquivos da mensagem vão como `data:` URI até 20 MB; acima disso (ou com falha no storage) vai só a
   referência com o `fileId`.
6. Eventos do OpenCode → linhas NDJSON do mesmo barramento do Agente Opex (`text-delta`,
   `reasoning-delta`, `tool-*`, `tool-confirmation`, `form`, `form-status`, `turn-end`).
7. Fim: grava a resposta (partes, modelo, tokens somados dos passos), situação da sessão, título e
   resumo (subagente pelo OpenCode, `refreshSessionTitleWith`; decide pelo conteúdo do turno, inclusive
   em turnos iniciados por aviso/retomada) e a fila de follow-ups.
- Tempo limite do turno: 24 h (um pedido de permissão pode esperar). Parar interrompe a sessão do
  OpenCode. Servidor reiniciado com a sessão "respondendo"/"aguardando": vira erro com aviso e a
  sessão do OpenCode é interrompida.
- Portal: o ator é revalidado a cada 30 s durante o turno; perdeu o acesso (cliente desligado, usuário
  desvinculado/inativo) → o turno é interrompido.
- Avisos de ferramentas (ex.: fim de um deploy pedido pelo Maddox) chegam pelo `queueFollowUp` do
  Agente Opex, que despacha para `queueMaddoxFollowUp` quando a sessão é do Maddox.
- Consumo: origens `maddox-agent`/`maddox-title` (dono) e `maddox-client-agent`/`maddox-client-title`.

## Servidor MCP do Opex (`server/mcp-server.ts`, `mcp-protocol.ts`)

- Rotas `POST /api/maddox/mcp/owner` (catálogo do dono, servidor `opex_app` no OpenCode) e
  `POST /api/maddox/mcp/portal` (catálogo do portal, `opex_portal`). JSON-RPC do MCP "Streamable HTTP"
  **sem estado**, com respostas JSON: `initialize`, `ping`, `tools/list`, `tools/call` e notificações.
- **Autenticação**: `Authorization: Bearer` com um segredo derivado da chave das integrações
  (`deriveSubkey("maddox-mcp:v1")`), registrado no OpenCode no `mcp.add`; nunca gravado nem exposto.
  As rotas ficam fora do login (`PUBLIC_PREFIXES` de `auth/paths.ts`).
- **Token de sistema (OPE-102)**: o servidor do **dono** também aceita `Authorization: Bearer mt_sys_…`
  (decidido pelo prefixo) com o escopo `mcp:owner` (ver `integrations.md`, "API interna"). Sem sessão
  do OpenCode nem `_meta`: o ator é o dono (`OWNER_SCOPE`, agente `maddox`). Token inválido, revogado
  ou expirado → 401; sem `mcp:owner` → 403 (`MCP_FORBIDDEN_CODE`, `INSUFFICIENT_SCOPE`); no `portal`
  → 403 (token não representa usuário de cliente). O `tools/list` devolve **só** as ferramentas
  cobertas pelo token (`mcpOwnerToolDecision`) e ligadas na configuração do Maddox (vazio com o
  agente desativado); o `tools/call` (`callMaddoxToolAsToken`) recusa com `isError: true` a
  ferramenta fora do escopo (`tokenScope`), a destrutiva/com confirmação sem `mcp:owner:destructive`
  (`tokenDestructive`) e a do grupo `files` (`tokenNotGrantable`), e revalida o Maddox ligado e a
  ferramenta ligada (`authorizeMaddoxTool`) a cada chamada. Recusas viram log de aviso com o token
  (id/nome/prefixo) e o motivo; nunca o valor.
- **Contexto sem conversa**: a ferramenta recebe `sessionId: ""` e `origin: { kind: "api-token", … }`;
  as ferramentas usam `contextSessionId(context)` (`null` sem conversa): anexar arquivos do chat
  falha por arquivo com mensagem clara, deploy/limpeza de registry/serviço do OpenCode não avisam
  conversa, e o terminal do host audita com `entidadeId: "api-token:<id>"` e `via: "api-token"`.
- **Endereço**: o OpenCode chama o Opex pela **origem do navegador** gravada ao salvar a aba do Maddox
  (`mcpBaseUrl`, com o `basePath`); a aba mostra o endereço e a situação dos dois servidores, com
  "Registrar de novo". Salvar com o endereço novo regrava os MCPs.
- **Documentação**: o servidor e todas as ferramentas estão na API interna (`/integracoes/internal_api`,
  `GET /api/openapi.json`), gerados do mesmo catálogo do `tools/list` (`server/mcp-catalog.ts`); as
  mensagens de recusa ficam em `MADDOX_MCP_REFUSALS` (`mcp-protocol.ts`), usadas pelo servidor e pela
  documentação. Ver `integrations.md`, "API interna".
- **Escopo por chamada**: o OpenCode manda a sessão em `_meta["ai.opencode/sessionID"]`; a sessão do
  Maddox sai de `opex_sessions.opencodeSessionId` (subagentes sobem pela sessão-mãe, até 3 níveis).
  Sessão desconhecida (outra sessão do OpenCode) é recusada; sessão do dono só no `owner`, do cliente
  só no `portal`. Antes de executar: Maddox ativo, ferramenta ligada (dono: `disabledTools` do
  Maddox; portal: `assertClientMaddoxToolAllowed`, que relê vínculo, papel, cliente e configuração).
  A ferramenta chama o **mesmo serviço real** do Agente Opex, com corte de saída e mensagens de erro
  em pt-BR. Log `module: "maddox-mcp"` sem a entrada.
- **Permissões da sessão** (`permissions.ts`): o servidor do outro escopo é negado inteiro; ferramenta
  desligada → `deny` (deixa de ser oferecida no turno seguinte); que pede confirmação → `ask`; demais
  → `allow`. As nativas do OpenCode seguem as permissões do OpenCode.

## Configuração (aba "Agente Maddox" de `/integracoes/ia`)

`ai_feature_settings` (`feature: "maddox-agent"`), `GET/PUT /api/ai/features/maddox-agent` e
`GET /api/ai/features/maddox-agent/mcp` (`?reconnect=1`). Seções (`AgentSettingsTabs`):

- **Geral**: ativo e cor; modelo e variante padrão (só do catálogo do OpenCode; inválido ao salvar é
  recusado com mensagem); subagente de título e resumo (também pelo OpenCode; vazio = o do agente);
  instruções e as do título, com **Restaurar padrão**; card **Arquivos no chat**; card das
  **Ferramentas do Opex no OpenCode** (endereço e situação dos MCPs).
- **Ferramentas**: árvore das ferramentas do Opex (catálogo do dono **sem jobs**), com seleção e
  **"Pede confirmação"** próprios, independentes do Agente Opex.
- **Memórias**: **Memórias globais**, **Memórias do dono** e **Memórias do cliente** do Maddox
  (`maddox-global`, `maddox-owner`, `maddox-client`), que salvam sozinhas.
- Não há seção de MCPs: o Maddox usa os MCPs configurados no OpenCode.
- Salvar avisa o portal dos clientes com o Maddox ligado (`maddox-settings-updated` em
  `private-client-{clientId}`).

## Por cliente (aba "Agente Maddox" em Integrações › Clientes › [cliente])

`orcamento_clients.maddoxAgent` (`{ enabled, disabledTools }`), `GET/PUT
/api/integrations/orcamentos/clients/[id]/maddox-agent`. Interruptor **desligado por padrão**
(clientes existentes ficam sem o Maddox) e a árvore das ferramentas do portal (sem jobs). Com o
Maddox ligado, a tela avisa que os usuários também usam as ferramentas nativas do OpenCode. Salvar é
auditado (`ClienteOrcamentoMaddoxAgent`) e publica `maddox-client-config-updated` em `private-app` e
`private-client-{clientId}`; desligar interrompe os turnos em andamento do cliente.

- Desligado: o item do Maddox não aparece e todas as rotas `/api/cliente/maddox/*` respondem 403
  `MADDOX_CLIENT_DISABLED`. Cada usuário só vê as próprias sessões naquele cliente; o dono, no app,
  só as dele. A pré-visualização do portal pelo dono respeita a configuração do cliente.
- Excluir o cliente apaga as sessões, mensagens, ações e arquivos do Maddox daquele cliente e as
  sessões do OpenCode (`deleteClientOpexData`).

## Dados

- Mesmas coleções do Agente Opex (`opex_sessions`, `opex_messages`, `opex_files`) com
  `opex_sessions.agent: "maddox"` (ausente = Agente Opex; migração `backfill-opex-session-agent`), mais
  `opencodeSessionId`, `modelOverride` e `pendingRequests`. O filtro central (`sessionFilterOf` com o
  `agent` do escopo) separa os agentes: sessão do outro agente responde **404**. Jobs nunca usam
  sessão do Maddox.
- Auditoria das sessões e das decisões na entidade `AgenteMaddox`.

## APIs

| Rota (dono `/api/maddox`, portal `/api/cliente/maddox`) | Descrição |
|---|---|
| `GET/POST …/sessions` | Listar; criar (`{ text?, model?, variant? }`) |
| `GET/PATCH/DELETE …/sessions/[id]` | Detalhe; renomear/arquivar/trocar o modelo (`{ model: null }` = padrão); excluir (com a sessão do OpenCode) |
| `POST …/sessions/[id]/messages` · `…/files` · `GET …/stream` · `POST …/interrupt` | Mesmo contrato do Agente Opex |
| `POST …/files/[id]/complete` · `GET/DELETE …/files/[id]` | Arquivos do chat |
| `POST …/actions/[id]` | `{ decision: "confirm" \| "cancel" }` da permissão do OpenCode |
| `POST …/forms/[id]` | `{ answer }` ou `{ cancel: true }` da pergunta do OpenCode |
| `GET …/models` | Catálogo do OpenCode para o seletor da sessão |
| `GET /api/cliente/maddox/status` | `{ enabled, available, reason, modelLabel, model, variant, color, files }` |
| `POST /api/maddox/mcp/{owner\|portal}` | Servidor MCP do Opex (segredo; ver acima) |

## Tempo real

`maddox-session-updated` / `maddox-session-deleted` (`{ id }`) em `private-app` (dono) ou em
`private-opex-{clientId}-{userId}` (portal, canal por usuário); configuração do cliente e geral em
`private-app`/`private-client-{clientId}`. A resposta ao vivo vai por NDJSON (`…/stream`).

## Testes

`__tests__/features/maddox-agent/`: `pure` (permissões, catálogo sem jobs, nomes do MCP, cor e
contraste, troca de agente, atalhos, protocolo MCP, linhas ao vivo, eventos do OpenCode e escolha do
modelo), `runner` (turno no OpenCode, permissão pendente e Confirmar, modelo fora do catálogo,
indisponível, 404 entre agentes, turno iniciado por aviso atualizando o título), `mcp-server`
(execução real, sessão desconhecida, subagente, escopo cruzado, ferramenta desligada, jobs fora,
revalidação do portal, segredo), `client-config` (padrão desligado, auditoria/eventos, nomes fora do
catálogo, interrupção ao desligar, revalidação do papel), `scope` (sessões separadas e eventos
próprios), `settings` (padrões, modelo obrigatório e no catálogo, normalização, registro do MCP),
`agent-switcher-ui` (item único, troca no cabeçalho e no item, seletor de modelo, engrenagem, atalhos,
ponto do outro agente, portal com um agente ou nenhum) e `settings-ui` (seções, memórias próprias,
Restaurar padrão, cor, aba do cliente, pergunta e ferramenta nativa no chat e a varredura de
controles nativos proibidos).
