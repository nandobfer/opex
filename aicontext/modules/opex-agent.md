# Módulo: Agente Opex (`src/features/opex-agent/`)

Assistente por chat que executa as funcionalidades do app com ferramentas (tool calling da AI SDK),
sem limite de passos nem de chamadas. Portado do My Tasks (OPE-81, bloco H) como recurso **nativo**
(sem gate de Recursos beta).

## Onde fica e como abre

- **Item único dos agentes de chat** (`AgentChatNavItem`, `components/agents/`), no rodapé da barra
  lateral do **dono** (`AppLayoutShell` passa `sidebarFooterItems` ao `AppShell`) e do **portal do
  cliente** (`ClientePortalShell`) quando o Agente Opex ou o Agente Maddox está ligado para o cliente
  (ver "Agente no portal do cliente" e `modules/maddox-agent.md`). O item abre o **último agente
  escolhido** (guardado no navegador) e mostra o nome, o ícone e a cor do agente ativo.
- Clicar abre um **popover** ancorado no item, com abertura animada (spring de escala a partir da
  âncora, Framer Motion, respeitando movimento reduzido). O botão **Maximizar** amplia o painel.
- **Cabeçalho com troca de agente** (`AgentSwitcherHeader`): à esquerda o agente ativo (avatar, nome e
  `Provedor · modelo`; no Maddox, o seletor de modelo da sessão); ao lado, o **outro agente**, menor,
  apagado e em tons de cinza, que acende com a cor dele no hover/foco e troca o agente do popover e do
  item ao clicar. Depois: Sessões, Nova sessão, **engrenagem** (só no dono: leva à configuração do
  agente ativo e fecha o popover), Maximizar e Fechar.
- O popover é o componente compartilhado `AgentChatPanel`: o agente vem do escopo
  (`OpexScopeProvider` com o descritor do agente — rotas, eventos, abas, rótulo, ícone, atalho e
  seletor de modelo — em `components/agents/agent-descriptors.ts`). Os painéis já abertos ficam
  montados ao trocar de agente (rascunho, abas e envios preservados).
- No celular (< 768 px) abre em painel de tela cheia (Dialog do Radix).
- Atalho global **Ctrl+Shift+O** (⌘+Shift+O no Mac) abre e fecha no Agente Opex (`isOpexShortcut`);
  **Ctrl+Shift+M** é do Agente Maddox.
- Um ponto pulsando no ícone avisa que alguma sessão (de qualquer agente) está respondendo ou aguarda
  confirmação; o botão do outro agente tem o próprio ponto.

## Sessões

- **Sessões em abas**, sem limite; cada aba tem o próprio contexto. Fechar a aba não exclui a sessão.
- As abas abertas ficam no `localStorage` (`opex:opex-agent:tabs:v1`, `usePersistentState` + Zod).
- As sessões guardam o agente (`opex_sessions.agent`; ausente = Agente Opex): o Agente Opex nunca vê as
  sessões do Maddox (404) e os jobs não usam sessão do Maddox.
- **Sessões** abre a lista de todas: busca tolerante (fuse.js) por título e resumo, filtro das
  arquivadas, renomear, arquivar e excluir (com `AlertDialog`) e lista virtualizada acima de 50.
- A primeira mensagem de uma "Nova sessão" cria a sessão.

## Chat

- Streaming de texto com cursor e raciocínio recolhível ("Pensando…").
- Cards de ferramenta com estado animado, duração e entrada/saída recolhíveis. O ícone vem do grupo da
  ferramenta; chamadas antigas de um grupo já removido aparecem com o ícone genérico e o histórico é
  mantido: `toMessageDto` troca o grupo desconhecido (nem do dono nem do portal) por `null`
  (`normalizeOpexParts`) e `toolIcon`/`fileIcon` usam ícones de reserva.
- Rodapé de cada resposta com modelo, tokens e duração.
- Cada linha das respostas tem, no hover, **Citar no campo de resposta**: insere `> linha` no cursor
  do campo do chat sem apagar o texto (`ReplyTargetProvider` no `OpexChat`, `ReplyTextarea` no
  `OpexComposer`); selecionando texto, o botão no fim da seleção cita só o trecho.
- **Tentar novamente** quando a resposta falha ou é interrompida; **Parar** durante o turno (a
  resposta parcial é mantida); **Ir para o fim**; conversa virtualizada acima de 50 mensagens.
- Estados: vazio com sugestões, carregando (skeleton), erro (tentar novamente), agente não
  configurado (link para a aba) e reconectando.
- Cores só por tokens (`warning`/`success`/`destructive`/`primary`); cada `Tooltip` traz o próprio
  `TooltipProvider`; ids gerados com `randomId()` (contexto HTTP não seguro).

## Arquivos no chat (Storage S3 com upload assinado)

- O kit é compartilhado com os campos da mesa de trabalho (ver `agentic-dev.md`, "Anexos nos campos
  da mesa"): tipo/rótulos/contratos em `src/lib/chat-files/kind.ts`, conferência e promoção no S3 em
  `src/lib/storage/staged-upload.ts`, fila genérica `src/hooks/useChatUploads.tsx` (`useOpexUploads` é
  um wrapper que passa as rotas do escopo — dono ou portal — ao provider) e componentes em
  `src/components/chat-attachments/` (`AttachmentChips`, `FileDropZone`, `MessageFiles` com `fileHref`
  para a rota do escopo, `AttachButton`; os `Opex*` reexportam ou envolvem).
- O usuário anexa pelo clipe, colando (Ctrl+V de print) ou arrastando (área de soltar animada). Cada
  arquivo vira um chip com miniatura/ícone, **progresso real do PUT** (axios `onUploadProgress`),
  "Confirmando…", erro com **Tentar novamente** e X para remover. Enviar só libera com todos os
  envios concluídos; dá para mandar só arquivos.
- Fluxo igual ao dos anexos de tarefa:
  1. `POST /api/opex/sessions/[id]/files` valida nome/tamanho/tipo contra os limites e grava o
     metadado **pendente** (`opex_files`, `uploadKey` temporária `opex/tmp/{id}/{nome}`), devolvendo a
     URL assinada do PUT;
  2. o navegador faz o PUT direto no S3;
  3. `POST /api/opex/files/[id]/complete` confere o objeto (HeadObject, tamanho real × limite),
     promove para a chave definitiva `opex/{sessão}/{id}/{nome}` e marca `ready` (idempotente; só a
     ausência comprovada descarta a reserva, falha de storage vira 502 preservando a reserva).
- A mensagem leva `fileIds` e os vincula (`pending: false`, `messageId`). Pendentes não usados são
  apagados (objeto **e** metadado) pela rotina **`opex-files-cleanup`** (Integrações › Crons, a cada
  60 min) depois de 24 h. Excluir a sessão apaga os arquivos (S3 + metadados).
- Limites **configuráveis** no card "Arquivos no chat": arquivos por mensagem (padrão 10, até 50) e
  tamanho máximo (padrão e teto **100 MB**, o limite dos anexos de tarefa).
- Na "Nova sessão", anexar cria a sessão na hora e leva o texto digitado para a aba dela. A fila de
  envio fica no item da barra lateral (`OpexUploadsProvider`): fechar o popover não perde envios.
- A mensagem mostra imagens em miniatura (amplia num visualizador) e os demais com download, pela
  rota autenticada `GET /api/opex/files/[id]` (repasse do S3, com `Range`).
- Ao modelo: o histórico guarda só marcadores `{ type: "opex-file", fileId, weight }`; a cada turno
  eles viram conteúdo conforme o provedor (`opexFileDelivery`), **baixando do S3 no turno**, sempre
  com uma linha de referência com o `fileId`:

  | Tipo | Gemini | Anthropic | OpenAI | DeepSeek |
  |---|---|---|---|---|
  | Imagem (png, jpg, webp, gif) | conteúdo | conteúdo | conteúdo | referência |
  | PDF | conteúdo | conteúdo | conteúdo | referência |
  | Texto/código | inline (até 100 mil caracteres) | inline | inline | inline |
  | Áudio/vídeo | conteúdo | referência | referência | referência |
  | Outros (docx, xlsx, zip, SVG…) | referência | referência | referência | referência |

  Tetos por arquivo: conteúdo até **20 MB** (`OPEX_FILE_CONTENT_MAX_BYTES`) e texto até **5 MB**
  (`OPEX_FILE_TEXT_MAX_BYTES`); acima disso o arquivo vai só como referência (o agente ainda pode
  anexá-lo). O peso conta no orçamento do histórico (`historySize`); turnos antigos fora dele não
  levam o conteúdo. Falha do storage no turno vira referência com aviso.

## Título, resumo e turnos

- **Título e resumo** atualizados a cada turno por um subagente com provedor, modelo e variante
  próprios (ou os do agente principal). Renomear à mão fixa o título; o resumo continua.
- **Turnos em segundo plano** (barramento em memória `server/hub.ts`, em `globalThis`): fechar o
  popover não interrompe. Quem conecta no meio recebe o retrato (`snapshot`). Sessão "respondendo"
  sem turno vivo (servidor reiniciou) volta a erro com aviso.

## Agente no portal do cliente (OPE-83)

O mesmo painel/hooks do dono atende o portal. O **escopo** (`src/features/opex-agent/scope.ts`
puro e `server/scope.ts`) decide sessões, canal, abas e catálogo: `owner` (app interno) ou
`client` (portal, com o `ClientActor` revalidado no banco).

- **Configuração por cliente**: aba **"Agente Opex"** em `/integracoes/clientes/[id-cliente]`
  (`ClienteOpexAgentTab`), salva em `orcamento_clients.opexAgent` (`{ enabled, disabledTools,
  enabledOptInTools }`). Sem configuração, vale o padrão: **ativado** e com todas as ferramentas do
  portal, exceto as **desligadas por padrão**. Guardar as **desligadas** faz ferramenta nova entrar
  ligada; o contexto (`get_portal_overview`) é sempre ativo.
- **Opt-in** ("Desligado por padrão"): ferramentas com `optIn: true` no catálogo puro
  (`OPEX_CLIENT_OPT_IN_TOOLS`; hoje o grupo **Jobs agendados**) só valem quando estão em
  `opexAgent.enabledOptInTools` (padrão `[]`). `enabledOpexClientToolNames(disabled, isAdmin,
  enabledOptIn)` exige a presença na lista para as opt-in; `saveClientOpexConfig` separa as marcadas
  opt-in em `enabledOptInTools` (as demais seguem em `disabledTools`) e audita `ligadasPorEscolha`.
  Clientes existentes ficam **sem jobs** até o dono ligá-los. Na árvore, o grupo mostra o selo
  "Desligado por padrão". A seleção é por ferramenta, na **mesma árvore** da seleção do dono (`CheckTree`: módulo
  por grupo com caixa tri-estado, contador, busca; Contexto travado como "Sempre ligada"), com o
  selo de risco em cada ferramenta e "Só admin do cliente" nos grupos/ferramentas de admin. Salvar é auditado (`ClienteOrcamentoOpexAgent`) e publica
  `opex-client-config-updated` em `private-app` e `private-client-{clientId}`.
- **Ativação**: `orçamento_clients.opexAgent.enabled`. Desativado, o item **não aparece** no portal
  (o layout calcula `opexEnabled` e o `AgentChatNavItem` também consulta `GET /api/cliente/opex/status`)
  e todas as rotas do agente respondem 403 `OPEX_CLIENT_DISABLED`.
- **Sessões privadas**: cada usuário só vê as próprias sessões naquele cliente
  (`opex_sessions.clientId` + `userId`); o dono (app interno) só vê `clientId: null`, e na
  pré-visualização do portal usa `userId` local. Sessão de outro escopo responde **404**.
- **Ferramentas próprias do portal** (`server/client-tools/`, catálogo puro em `client-tools.ts`):
  não reaproveitam as do dono — chamam os serviços do portal, que já filtram pelo cliente.

  | Grupo | Ferramentas |
  |---|---|
  | Contexto (sempre) | `get_portal_overview` |
  | Tarefas | `list_tasks`, `get_task`, `add_comment`, `set_task_priority` |
  | Orçamentos | `list_previews`, `get_preview`, `create_preview`, `generate_preview`, `set_preview_correction`, `estimate_preview`, `approve_preview` |
  | Arquivos do chat | `list_chat_files`, `read_chat_file`, `attach_files_to_task`, `attach_files_to_preview` |
  | Dashboard | `get_dashboard` |
  | Ambientes | `list_environments` (todos); `deploy_environment`*, `start_environment`, `restart_environment`* (**admin**) — só os ambientes de central dos repositórios do cliente (ver `modules/environments.md`) |
  | Financeiro (**admin**) | `get_finance`, `get_service` |
  | Usuários (**admin**) | `list_users`, `update_user`, `delete_user`* |
  | Jobs agendados (**opt-in**) | `list_jobs`, `schedule_job`, `update_job`, `cancel_job`* — só os jobs do próprio usuário naquele cliente |

  `*` destrutivo. Criar usuário e gerar token ficam **fora**: devolvem segredo que não pode chegar
  ao modelo. `update_user` redige a senha. As de admin só entram no turno quando o usuário é
  **admin do cliente**.
- **Escopo no servidor, não na interface**: o turno monta o catálogo pela configuração + papel, e
  o runtime **revalida antes de cada ferramenta** (`authorize`): relê o vínculo, o cliente e a
  configuração, e troca o ator pelo atual (papel pode mudar no meio do turno). A confirmação
  (`decideAction`) também resolve a sessão no escopo e revalida antes de executar. Cada ferramenta
  chama o serviço do portal, que filtra de novo pelo cliente — três camadas independentes.
- **Instruções** próprias (`DEFAULT_OPEX_CLIENT_INSTRUCTIONS`) + cliente, usuário e papel; a dica
  de jobs (`OPEX_CLIENT_JOBS_INSTRUCTION`) só entra quando o grupo Jobs está ligado no turno; o
  modelo do dono é reaproveitado. Consumo em origens `opex-client-agent` / `opex-client-title`.
- **Interface**: `OpexScopeProvider` (dono por padrão) fornece `apiBase` (`/opex` ou
  `/cliente/opex`), o axios do portal (`x-client-id`), o canal, a chave do cache e a chave das abas
  (`opex:opex-agent:tabs:v1:{clientId}:{userId}`). Hooks e painel não sabem em qual escopo estão.
- Excluir o cliente apaga as sessões, mensagens, ações, arquivos e **jobs** do agente daquele
  cliente (`deleteClientOpexData`). Usuário desvinculado: o job só falha na execução.

## Configuração

- Aba **"Agente Opex"** (`agente-opex`, ícone `Bot`) em `/integracoes/ia?aba=agente-opex`
  (`AiEditorForm` + `AI_TABS`), salva em `ai_feature_settings` (`feature: "opex-agent"`).
- Organizada em **seções** (abas internas copiadas do Ciliar, `AgentSettingsTabs`, parâmetro de URL
  `?secao=`; a padrão `geral` fica fora da URL). Um único formulário fica acima das seções: trocar de
  seção **mantém o rascunho** sem pedir descarte; o rodapé Desfazer/Salvar aparece em Geral e em
  Ferramentas e salva tudo (com erro de validação, volta para Geral).
  - **Geral**: ativo, agente principal (provedor, modelo, variante; temperatura e máximo de tokens
    nos provedores com amostragem), subagente de título e resumo, instruções dos dois ("Restaurar
    padrão") e o card "Arquivos no chat".
  - **Ferramentas** (`OpexToolsCard`): árvore do Ciliar (`CheckTree` de
    `src/components/ui/check-tree`, helpers puros em `src/lib/check-tree.ts`): um módulo por grupo
    com caixa tri-estado, contador `x/y`, busca sem acento e expansão animada. Cada ferramenta mostra
    o nome técnico, o selo de risco (Leitura/Altera/Destrutiva), "Sempre ligada" (grupo Contexto,
    travado) e o switch **"Pede confirmação"** — ligado por padrão nas destrutivas e nas marcadas com
    `confirmByDefault` (as escritas no GitHub), com a marca
    "· personalizado" quando difere do padrão e o aviso "Ação destrutiva sem confirmação". Não há
    mais política geral ("Só ações destrutivas"/"Toda alteração").
  - **Terminal do host** (card na seção Ferramentas, `OpexHostCard`; `settings.host`): diretórios
    permitidos (`allowedDirectories`, caminhos absolutos em `ChipInput`, até 30, normalizados e sem
    repetição ao salvar; **vazio = qualquer diretório**, com aviso animado) e tempo máximo por comando
    (`maxTimeoutSeconds`, 5–1800, padrão 300). Configuração antiga sem `host` recebe o padrão.
  - **MCPs** (`OpexMcpSection`, `?secao=mcps`): lista, cadastra, edita, habilita/desabilita e exclui
    os servidores MCP do agente; salva sozinha (cada ação grava na hora). Detalhes em "MCPs".
  - **Memórias** (`OpexMemoriesSection`): três cards do Ciliar (`AgentMemoriesCard`) — **Memórias
    globais**, **Memórias do dono** e **Memórias do cliente** (só as listas com `tab: "agente-opex"`,
    `aiAgentsOfTab`; a lista do Agente Adversário fica na aba dele); salvam sozinhos (ver
    `aicontext/modules/ai.md`, "Memórias dos agentes").
- Configuração salva: `disabledTools` (as **desligadas**; ferramenta nova nasce ligada; Contexto
  nunca fica desligado) e `confirmationOverrides` (`{ [ferramenta]: boolean }`; ausente = padrão pelo
  risco). Nomes fora do registro dão 400 `OPEX_TOOL_NOT_FOUND`. A configuração antiga é convertida
  na leitura (`withDefaults` + `migrateLegacyToolSettings` de `tool-tree.ts`): grupo desligado vira
  todas as ferramentas dele desligadas e a política "Toda alteração" vira confirmação ligada em cada
  ferramenta `write`.
- Provedores: **Gemini, Anthropic, OpenAI e DeepSeek** (o OpenCode não executa ferramentas do app).
  Ativar exige provedor conectado; modelo e variante conferidos no catálogo (`assertCatalog`).

## Ferramentas (`server/tools/`)

Cada ferramenta chama a **função de serviço real** do Opex (nunca HTTP), herdando validação Zod,
auditoria e tempo real. Risco: `read`, `write` ou `destructive`. **Confirmação por ferramenta**: sem
ajuste, as `destructive` e as `confirmByDefault` pedem Confirmar/Cancelar; o switch "Pede confirmação" da configuração
liga (ex.: numa `write`) ou desliga (inclusive numa `destructive`, com aviso na tela) cada uma
(`needsConfirmation(tool, confirmationOverrides)`). No portal do cliente vale sempre o padrão pelo
risco (os catálogos são distintos).

| Grupo | Ferramentas |
|---|---|
| Contexto (sempre ligado) | `get_app_overview` |
| Documentação do app | `list_app_docs`, `read_app_doc`, `search_app_docs` — os `.md` de `aicontext/` para explicar como usar o app, regras e funcionalidades. Só no agente do **dono** (detalhes abaixo) |
| Arquivos do chat | `list_chat_files`, `read_chat_file`, `attach_files_to_task` (cópia server-side do S3 para `task_attachments`, opcionalmente no fim da descrição), `attach_files_to_preview` (anexos do rascunho de prévia); `create_task` e `create_preview` aceitam `chatFileIds` |
| Tarefas (a tarefa também pode ser referida pela issue vinculada, `repo#N`/`dono/repo#N`) | `get_task_options`, `list_tasks`, `get_task`, `create_task` (com issue; ver "Criar tarefa"), `update_task`, `move_task`, `add_comment`, `set_task_archived`*, `delete_task`*, `sync_task_issue`, `understand_task`, `generate_task_summary`, `generate_task_tags`, `estimate_task`, `set_task_estimate` |
| Prévias | `create_preview`, `get_preview`, `generate_preview` (com clareza e estimativa), `set_preview_correction`, `estimate_preview`, `approve_preview` (cria a tarefa local com issue) |
| Horas (somente leitura) | `list_active_periods`, `list_time_logs` |
| Mesas de trabalho | `list_workbenches`, `get_workbench`, `get_workbench_output`, `start_workbench`, `revise_plan`, `implement`, `request_correction`, `submit_pr_feedback`, `reopen_workbench`, `approve_workbench`, `retry_workbench`, `reconnect_workbench`, `cancel_workbench_wait`, `interrupt_workbench`*, `complete_workbench`* (concluir sem PR, com motivo) e `set_workbench_stage` (definir etapa de espera, confirmação por padrão; ambas pela mesma `setWorkbenchStage` da tela — `get_workbench` traz `settableStages`), `set_workbench_model` (papel `planning`/`implementation`/`build`/`pr`, vale no próximo turno), `reply_workbench_permission`, `reply_workbench_form`, `delete_workbench`* |
| Centrais | `list_centrals`, `get_central`, `create_central`, `update_central`, `test_central`, `delete_central`*, `get_agentic_settings`, `update_agentic_settings` |
| Issues e dependências | `get_issue`, `list_issues`, `get_issue_dependencies`, `rank_ready_tasks` (qual tarefa começar), `add_issue_dependency`†, `add_sub_issue`†, `remove_issue_dependency`*, `remove_sub_issue`* — detalhes abaixo |
| Repositórios GitHub | `list_repositories`, `get_repo_tree`, `read_repo_file`, `search_repo_code`, `list_branches`, `list_commits`, `get_commit`, `compare_refs`, `create_branch`†, `write_repo_file`†, `delete_repo_file`*, `delete_branch`* — detalhes abaixo |
| Integrações | `list_integrations`, `get_integration` (sem segredos), `update_integration`* (grava segredos, nunca lê), `test_integration` |
| Rotinas | `list_routines` (sem o `cronSecret`), `run_routine` |
| Jobs agendados | `list_jobs` (dono e portal, filtro `origin`), `schedule_job`, `update_job` (só jobs do dono), `cancel_job`* (dono e portal) — ver "Jobs" |
| Features de IA | `get_ai_feature_settings`, `update_ai_feature_settings` |
| Agente Revisor | `list_pr_reviews`, `get_pr_review`, `request_pr_review`, `rerun_pr_review`, `stop_pr_review`* |
| Dashboards | `get_dashboard` |
| Serviços | `list_services`, `get_service`, `create_service`, `update_service`, `set_service_archived`*, `regenerate_service_ai` |
| Financeiro (leitura) | `get_finance` (totais e grupos por cliente/período, itens opcionais) |
| Terminal do host | `get_host_terminal`, `run_host_command`* — detalhes abaixo |
| Ambientes | `list_environments`, `get_environment`, `get_environment_logs`, `list_environment_deploys`, `get_environment_deploy`, criar/editar/adotar/apagar, `deploy_environment`*, `move_environment`*, levantar/derrubar*/reiniciar, configuração e limpeza do registry — os mesmos serviços de `/ambientes`; o fim de um deploy pedido pelo agente chega à sessão como aviso (`kind: "notice"`). Detalhes em `modules/environments.md` |
| Serviço do OpenCode | `get_opencode_service_status` (com o impacto: mesas e refinamentos rodando), `get_opencode_service_logs`, `start_opencode_service`, `stop_opencode_service`*, `restart_opencode_service`*, `upgrade_opencode`* (última 2.x; major nova só com `allowMajor`; em segundo plano, o fim chega como `notice`), `get_opencode_service_operation`, `list_opencode_backups`, `restore_opencode_backup`* — ver `modules/opencode-resources.md` |
| Recursos do OpenCode | `list_opencode_scopes`, `list_opencode_resources` (`kind` skill/agent/command/plugin/mcp, escopo, nome, situação; sem caminho no host), `get_opencode_resource` (MCP só com os nomes dos segredos), `create_opencode_resource`, `update_opencode_resource` (o que não vier fica; segredos do MCP mantidos), `set_opencode_mcp_secrets`* (`redact` nos valores), `set_opencode_resource_enabled`†, `delete_opencode_resource`*, `install_opencode_resource`† (código de terceiros no host), `check_opencode_updates`, `update_opencode_resources`† (ids ou `all`), `test_opencode_mcp` |
| MCPs | `list_mcp_servers`, `get_mcp_server`, `test_mcp_server` (conecta e atualiza as ferramentas descobertas), `create_mcp_server`*, `update_mcp_server`*, `set_mcp_server_enabled`, `set_mcp_tool_confirmation`†, `delete_mcp_server`*, `set_client_mcp_access`* (libera/retira um MCP de um cliente) — mesmos serviços da seção MCPs; headers/variáveis saem do histórico (`redact`) e nunca são lidos de volta |
| Ferramentas dos MCPs (dinâmicas) | `mcp_{identificador}_{ferramenta}` de cada MCP habilitado — ver "MCPs" |
| Clientes | `list_clients`, `get_client` (usuários do portal e prévias de orçamento recentes), `create_client`*, `update_client`, `regenerate_client_token`*, `delete_client`*, `create_client_user`*, `update_client_user`*, `regenerate_client_user_token`*, `delete_client_user`* |

\* `destructive`. Regra (testada): toda ferramenta de exclusão, arquivamento, gravação de integração
ou credencial/token/senha de cliente é `destructive`. Tokens, `portalPath` (que carrega o token) e
senhas nunca saem para o modelo nem para os cards (`redact` + saídas enxutas). † `write` com
`confirmByDefault` (pede confirmação por padrão).

### Criar tarefa (`create_task`)

`create_task` é o caminho principal do agente do dono para criar tarefas (cria no Opex com a issue no
GitHub, por `createTaskWithIssue`); as prévias (`create_preview` e afins) ficam para quando o usuário
pedir uma prévia ou orçamento.

- Entrada: `projectId` (de `get_task_options`), `title`, `description` (Markdown, com o contexto que o
  usuário deu), `technicalSpec` opcional (ex.: Critérios de aceite e Localização com o que o usuário
  disse, sem inventar), `taskType`, `priority`, `columnId` **opcional** — sem ele, a tarefa entra na
  **primeira coluna do quadro**, na ordem do layout (`firstBoardColumnKey` em
  `tasks/server/columns.ts`) — e `chatFileIds` (até 50 arquivos do chat).
- Regra do pedido mínimo (descrição da ferramenta e `OPEX_CREATE_TASK_INSTRUCTION`): antes de criar, o
  agente avalia se dá para entender o que fazer, onde (tela, rota ou módulo) e quando estará pronto; se
  algo essencial faltar claramente, pergunta **uma vez**. Se o usuário responder ou mandar seguir,
  cria assim mesmo: a ferramenta nunca recusa por critério vago.
- `chatFileIds`: depois de criada a tarefa, os arquivos são copiados no servidor para os anexos dela
  (`chatFilesToAttachments`, como em `attach_files_to_task`); a resposta traz
  `attachments: { attached, failed }` e uma falha de arquivo não desfaz a tarefa.
- Instruções já salvas com as frases padrão antigas (criação pela prévia e arquivos do chat) são
  trocadas pelas novas (`LEGACY_OPEX_INSTRUCTION_LINES` em `migrateOpexInstructions`); texto editado à
  mão fica como está.

### Documentação do app

Grupo `docs` (todas de leitura, ligadas por padrão e desligáveis), **só no agente do dono**: o portal
do cliente não recebe o grupo, porque a documentação interna traz regras do dono (ex.: fator de lucro
e estimativa interna). O agente consulta a documentação para responder "como faço X", regras e
funcionalidades. As instruções padrão (`OPEX_DOCS_INSTRUCTION`) mandam buscar antes de responder,
traduzir para passos do usuário (telas, menus, botões), citar o arquivo e não inventar; instruções
já salvas com a frase padrão exata de criação de tarefa ganham a regra logo depois
(`migrateOpexInstructions`, idempotente; texto editado à mão fica como está).

- `list_app_docs` (`dir?`): os `.md` de `aicontext/**` (guias da raiz primeiro), com título (primeiro
  `#`), número de linhas e seções `##`.
- `read_app_doc` (`path` relativo a `aicontext/`, `section?`, `startLine?`, `maxLines?` até 600, padrão
  200): linhas numeradas; com `section`, só a seção (até o próximo título de nível igual ou acima;
  título sem acento/caixa, exato antes de "contém"). Teto de 24 mil caracteres; devolve
  `totalLines` e `truncated` para continuar. Seção inexistente lista as seções do arquivo.
- `search_app_docs` (`query`, `limit?` até 30, padrão 10): busca por palavras sem acento/caixa, linha
  a linha (título vale o dobro; frase inteira e nome do arquivo dão bônus), com arquivo, linha, seção e
  trecho.
- Segurança: só `.md` dentro de `aicontext/` (`normalizeDocPath` recusa `..`, absoluto, byte nulo e
  outras extensões; o caminho real é conferido com `realpath`, então symlink para fora é recusado).
  Sem a pasta: erro "Documentação do app indisponível nesta instalação".
- A raiz é `process.cwd()/aicontext`. Na imagem Docker a pasta é copiada para `/app/aicontext`
  (`Dockerfile`, estágio runner; `aicontext` saiu do `.dockerignore`).

### Repositórios GitHub

Usam o token da integração GitHub (`githubRequest`; nada de `gh` CLI). Qualquer repositório que o
token alcance. Só no app do dono (o catálogo do portal não tem o grupo).

- **Branch de consulta** (`resolveRepoRef`, `server/repo-snapshot.ts`): a pedida (`ref`/`branch`);
  senão a **branch base da central** do repositório (Git e PR › Branch base, via vínculo projeto ↔
  repositório); senão a **branch padrão** do repositório (cache de 10 min). Toda resposta traz `ref`,
  `refSource` (`requested`/`central`/`default`) e, nas leituras de conteúdo, o `sha`.
- **Snapshot por commit**: a ref vira SHA (`Accept: application/vnd.github.sha`) e o tarball do commit
  (`/tarball/{sha}`) é baixado uma vez, descompactado em fluxo (`zlib` + leitor de tar próprio,
  `server/repo-tar.ts`, com PAX) e guardado em memória: texto até 2 MB por arquivo (binários só com
  caminho), até 400 MB de texto e 150 MB compactados. Cache de até 4 snapshots, 20 min ocioso;
  downloads simultâneos do mesmo commit são compartilhados. Árvore, leitura e busca usam o snapshot.
- **Busca** (`search_repo_code`, `searchFiles` em `repo-search.ts`): grep linha a linha em qualquer
  branch, texto ou regex JS, sem diferenciar maiúsculas por padrão, filtros `path`/`glob`, contexto até
  5 linhas, 100 ocorrências (até 500). Pula binários, arquivos grandes e `node_modules`, `.git`, `dist`,
  `build`, `.next`, `coverage`, `vendor`, `out` (salvo com `path` dentro deles). Não usa a busca do
  GitHub, que só olha a branch padrão.
- **Leituras**: `list_repositories` (com central e branches dela), `get_repo_tree` (glob `**`/`*`/`?`/`{a,b}`,
  500 itens, até 3000), `read_repo_file` (linhas numeradas, 400 por janela, até 2000; sugere caminhos
  parecidos), `list_branches`, `list_commits`, `get_commit` e `compare_refs` (diffs cortados em 6 mil
  caracteres por arquivo e 60 mil no total).
- **Escritas** (`risk: "write"` + `confirmByDefault`): `create_branch` e `write_repo_file` (conteúdo
  completo, até 1 MB, via Contents API com o SHA atual; a entrada guardada corta o conteúdo em 2 mil
  caracteres). **Destrutivas**: `delete_repo_file` e `delete_branch` (recusa a branch padrão e as
  branches base/destino da central). Escritas auditam na entidade `RepositorioGithub` (`entidadeId` =
  repositório). Snapshots só em memória do processo (nada persistido).

### Issues e dependências

Para responder "qual tarefa começo?" com dependências reais. Usam as **relações formais do GitHub**
(bloqueada por / bloqueia, épico e sub-issues), nunca o título ou o texto da issue. Token da
integração GitHub (Issues: leitura; escrita para registrar relações). Só no app do dono.

- **Grafo** (`server/issue-graph.ts`, `loadIssueGraph`): GraphQL (`githubGraphql` do cliente
  nativo) com até 20 issues por consulta (aliases `iN`), seguindo "bloqueada por" e "bloqueia" nível a
  nível até a profundidade pedida (até 200 issues; `truncated` avisa o corte). Por issue: estado e
  motivo, responsáveis, labels, tipo, milestone, épico (`parent`), resumo das sub-issues, bloqueios e
  PRs ligados (os que a fecham + os do mesmo repositório que a citam). Issues só citadas ficam como
  referência leve (`lite`). Conversão pura em `issue-nodes.ts`.
- **Tarefa vinculada** (`linkedTasksByIssue` + `loadTaskSituation`): a tarefa do Opex com o vínculo
  da issue (`github_issue_links`), com a coluna (nome), se está **concluída** (na coluna de conclusão do
  projeto, `closedColumnKey`) e se tem **mesa de trabalho aberta** (não concluída).
- **Entrega** (`deliveryOf`, módulo puro `issue-readiness.ts`), nesta ordem:
  1. issue fechada: `completed` → `done`; `not_planned`/`duplicate` → `cancelled`;
  2. tarefa vinculada concluída → `done`;
  3. PR **mesclado** numa branch de entrega (base/destino da central e a padrão do repositório) que
     **fecha** a issue, tem o **código da tarefa** no título ou contém o **título da issue** → `merged`
     (o caso comum: código no `dev`, issue aberta e tarefa ainda aberta). Só citar `#N` não conta:
     PRs citam issues futuras;
  4. tarefa com mesa de trabalho aberta ou PR forte aberto → `in_progress`;
  5. senão `pending` (`unknown` = não carregada ou sem acesso).
  - `deliveredAt`: `merged` (padrão; mesclado já libera quem depende) ou `done`. Cancelada sempre libera.
- **Veredito** (`verdictOf`): `delivered` (a própria já foi entregue), `epic` (tem sub-issues),
  `ready` (bloqueadoras resolvidas), `partial` (restam só as em andamento/mescladas sem valer),
  `unknown`, `blocked` (alguma `pending`).
- **Ferramentas de leitura**:
  - `get_issue`: corpo (12 mil caracteres), estado, autor, tipo, labels, milestone, responsáveis,
    épico, sub-issues, entrega, tarefa vinculada, bloqueadoras e bloqueadas (com entrega), PRs e os
    últimos 20 comentários. Recusa PR.
  - `list_issues`: REST sem PRs (estado, responsável/`none`/`*`, labels, milestone por título ou
    número) com as contagens de dependências e sub-issues; `query` usa a busca do GitHub; `parent`
    lista as sub-issues do épico (GraphQL, filtros aplicados no app).
  - `get_issue_dependencies`: árvore de "bloqueada por" (profundidade 1–5, padrão 2; ciclo marcado com
    `cycle`), "bloqueia", `waitingOn` e veredito.
  - `rank_ready_tasks`: tarefas abertas (não arquivadas e fora da coluna de conclusão do projeto;
    filtros projeto, colunas e épico). Grafo com 2 níveis de "bloqueada por" e 3 de "bloqueia". Ordem
    (`compareRank`): veredito → quantas issues não resolvidas destrava (direta e indiretamente,
    `unlocksOf`) → prioridade → menor estimativa → número. Cada linha traz `waitingOn`,
    `resolvedBlockers` e `unlocks`. Também devolve `withoutIssue` e alertas: **gargalos sem
    responsável** (bloqueadoras sem assignee no GitHub nem tarefa no Opex), **entregues sem fechar**
    (`merged` com issue aberta → concluir a tarefa), **itens já entregues** e **títulos parecidos**
    (Jaccard ≥ 0,6 entre tarefas abertas dos mesmos projetos; possíveis duplicadas).
- **Escritas** (auditoria `RepositorioGithub`): `add_issue_dependency` e `add_sub_issue`
  (`confirmByDefault`; `replaceParent` troca o épico), `remove_issue_dependency` e `remove_sub_issue`
  (destrutivas). Usam o `id` numérico da issue (REST `dependencies/blocked_by` e `sub_issues`); recusam
  PR e bloqueio de si mesma.
- **Tarefa pela issue**: `resolveTask` aceita `nome#N`/`dono/nome#N` (`findIssueTask`: vínculo issue ↔
  tarefa); sem vínculo, erro acionável indicando `get_issue`.
- As instruções padrão orientam o agente a usar `rank_ready_tasks` para "qual tarefa começar".

### MCPs

Servidores **Model Context Protocol** cujas ferramentas **o próprio Agente Opex** usa nas conversas
(conectados pelo servidor do Opex). Não confundir com os MCPs do **OpenCode** (aba de recursos do
OpenCode, `modules/opencode-resources.md`), que servem aos agentes do OpenCode no host. Cliente MCP da
`@ai-sdk/mcp` (importada sob demanda), em `server/mcp/` (`connect`, `service`, `tools`) e no módulo
puro `mcp.ts` (schemas, nomes, risco e confirmação).

- **Cadastro** (`opex_mcp_servers`): nome, **identificador** (`^[a-z0-9_]{2,24}$`, único — 409
  `OPEX_MCP_SLUG_TAKEN`; sugerido pelo nome), descrição, habilitado e o **transporte**:
  - **HTTP** (Streamable HTTP) ou **SSE**: URL http(s) + **headers** secretos (ex.: `Authorization`);
  - **stdio**: comando + argumentos (um por linha) + **variáveis de ambiente** secretas. O processo roda
    **dentro do servidor do Opex** (container; só node/npx; sem os arquivos do host — a tela avisa) e
    herda só `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL` e `TERM` mais as variáveis cadastradas, nunca as
    do Opex (banco, chave de criptografia…).
- **Segredos**: headers e variáveis ficam cifrados (`secretBox`); a API e a tela devolvem só as chaves
  (`configured`). Na edição, valor vazio mantém o salvo da mesma chave, valor novo substitui e chave
  fora da lista é removida; chave nova sem valor dá 400 `OPEX_MCP_SECRET_REQUIRED`; sem
  `INTEGRATIONS_ENCRYPTION_KEY`, gravar segredo dá 400 `OPEX_MCP_ENCRYPTION_MISSING`.
- **Testar conexão** (no diálogo, sem gravar; na edição os segredos vazios usam os salvos): conecta,
  lista as ferramentas (nome, título, descrição e anotações `readOnlyHint`/`destructiveHint`) e o
  servidor. Cada ferramenta mostra o nome que o agente vê, o selo de risco e o switch **"Pede
  confirmação"** (componente compartilhado `ToolConfirmMeta` com a árvore de Ferramentas). O retrato
  das ferramentas só é regravado ao salvar quando o teste do diálogo trouxe um novo; sem teste, o
  salvo (ou o atualizado por um turno) fica. Headers/variáveis do transporte que não está em uso são
  ignorados na validação e descartados ao salvar.
- **Risco e confirmação** pela anotação do servidor: `readOnlyHint` = Leitura (não pede);
  `destructiveHint: false` = Altera (pede); sem anotação = Destrutiva (pede). O ajuste fica em
  `confirmations` (`{ [ferramenta original]: boolean }`, só o que difere do padrão) e vale no dono e
  no portal. Ferramenta nova que surgir no servidor segue o padrão.
- **No turno** (`loadMcpTools`): conecta em paralelo aos MCPs habilitados (no portal, só os
  **liberados ao cliente**), com limite de 10 s (HTTP/SSE) ou 30 s (stdio), e converte cada ferramenta
  em ferramenta do agente: nome `mcp_{identificador}_{ferramenta}` (só `[a-zA-Z0-9_-]`, até 64, sem
  colisão), rótulo "{MCP} · {ferramenta}", descrição prefixada `[MCP nome]`, JSON Schema do servidor
  (sem `$schema`/`$id`), card, confirmação, corte de saída e chamada com limite de 120 s. As conexões
  fecham no fim do turno, inclusive com erro.
- **Falha não derruba o agente**: MCP que não conecta fica de fora do turno; o agente recebe um aviso
  no contexto do turno ("MCP X indisponível neste turno…") e a situação vai para o cadastro
  (`lastError`/`lastCheckedAt`, exibidos na lista em tempo real). Erro devolvido pelo MCP
  (`isError`) vira erro da ferramenta "MCP {nome}: …". **No portal do cliente**, o aviso e os erros
  das ferramentas de MCP são genéricos ("MCP X indisponível no momento…"), sem endereço nem resposta
  do servidor; o detalhe fica só no log e na situação do MCP (tela do dono).
- **Logs**: `module: "opex-agent-mcp"`, uma linha por chamada (`mcp`, `tool`, `sessionId`, `scope`,
  `durationMs`, `ok`, `err`, tamanho da entrada — nunca a entrada), MCP indisponível e testes de conexão.
- **Ação confirmada depois do turno**: `decideAction` reconecta só ao MCP da ferramenta
  (`resolveMcpTool`), executa e fecha; MCP desabilitado, excluído, retirado do cliente ou sem a
  ferramenta faz a ação falhar com o motivo.
- **Portal do cliente**: na aba **Agente Opex** do cliente, o card **MCPs** liga os MCPs que o agente
  do cliente pode usar (desligados por padrão; aviso de que os usuários usam as credenciais do MCP).
  Antes de cada chamada no portal, o MCP é revalidado (liberado ao cliente **e** habilitado; senão
  403 `OPEX_TOOL_DISABLED`). Excluir um MCP o retira dos clientes.
- **Auditoria** na entidade `McpServidor` (criar/editar/habilitar/confirmação/excluir; sem segredos,
  sem argumentos e sem a query da URL) e evento `opex-mcp-updated` `{ id }` em `private-app`
  (`useOpexMcpRealtime`).

### Terminal do host

O app roda em container; os comandos rodam na **máquina do servidor OpenCode** (o host), pelo `shell`
do `@opencode/client` (`server/host-shell.ts`, `runHostCommand`), com a conexão da integração
OpenCode. Sem SSH nem credencial nova. Só no app do dono (o catálogo do portal não tem o grupo).

- `get_host_terminal` (leitura): diretórios permitidos, diretório padrão, tempo padrão/máximo e
  limite de saída.
- `run_host_command` (`risk: "destructive"`: **pede confirmação por padrão**, ajustável no switch
  como as demais): `{ command, directory?, timeoutSeconds? }`.
  - Diretório (`resolveHostDirectory`, módulo puro `host-terminal.ts`): o pedido (absoluto,
    normalizado, precisa estar dentro de um permitido — subdiretórios valem, `..` é resolvido antes);
    sem pedido, o primeiro permitido; sem lista, o diretório das sessões do OpenCode (ou o padrão do
    servidor). Fora da lista → erro ao modelo, sem executar.
  - Tempo: padrão 60 s, limitado ao máximo configurado; estourou → `status: "timeout"` e o comando
    é encerrado. O shell é sempre removido no fim (também ao interromper o turno).
  - Não interativo e sem estado entre chamadas (sem PTY, prompts ou `sudo` com senha); roda com o
    usuário do processo do OpenCode.
  - Resposta: `status`, `exitCode`, `signal`, `cwd`, `durationMs`, `output` (stdout+stderr, até 20 mil
    caracteres; acima disso só o **fim**, com `truncated`, `outputSize` e `outputNote`).
  - Auditoria na entidade `TerminalHost` (`entidadeId` = sessão): comando, diretório, situação,
    código de saída e duração; log Pino `[opex] comando no host`.

## Jobs (prompts agendados)

Um **job** é um prompt que o agente executa sozinho, **uma única vez**: agora, daqui a X
minutos/horas/dias ou numa data e hora (horário de Brasília), numa sessão nova (com o título do job)
ou existente. Vale para o **dono** e para os **usuários do portal**. Código: `jobs.ts` (puro: schema
`opexJobInputSchema`, `resolveRunAt`, rótulos, `jobModelText`), `open-session.ts`, `server/jobs.ts`
(serviço), `server/tools/jobs.ts` (dono + entradas compartilhadas), `server/client-tools/jobs.ts`
(portal), `hooks/useOpexJobs.ts` e `components/jobs/` (`OpexJobsTab`, `OpexJobsFilters`,
`OpexJobRow`, `OpexJobDialog`).

- **Dados** (`opex_jobs`, `OpexJob` em `src/lib/db/models/Opex.ts`): `title`, `prompt`, `sessionId`
  (escolhida; `null` = nova), `resultSessionId`, `schedule`, `runAt`, `status`
  (`scheduled|running|done|error|awaiting_confirmation|canceled`), `startedAt`, `finishedAt`,
  `delayMs`, `error`, `createdBy` (`user`/`agent`), `originSessionId`, `sourceJobId`, `clientId`
  (`null` = dono) + `userId` (como a sessão) e `purgeAt`. Índices `{status, runAt}`, `{createdAt}`,
  `{clientId, userId, runAt:-1}` e TTL `purge_ttl` (terminado some 30 dias depois).
- **Escopo**: o portal só vê e mexe nos jobs do próprio usuário no cliente (outro é 404); a sessão
  escolhida precisa ser do mesmo escopo (400 `OPEX_JOB_SESSION_NOT_FOUND`). O dono vê todos e filtra
  por `origin=owner|client`, `clientId` e `userId`; o DTO traz `origin` (`{kind:"owner"}` ou
  `{kind:"client", clientId, clientName, userId, userName}`). Na pré-visualização do portal, o job
  criado pelo dono é de origem **cliente** (escopo do cliente pré-visualizado, usuário local).
- **Dono sobre job do portal**: cancela e reexecuta (ação direta, sem formulário; a reexecução mantém
  `clientId`, `userId` e a sessão do original e audita o dono); **editar é 403**
  `OPEX_JOB_CLIENT_READONLY`; "Abrir sessão" fica oculto (a sessão é do usuário).
- **Regras**: editar e cancelar só em `scheduled` (409 `OPEX_JOB_NOT_SCHEDULED`; edição em `running`
  bloqueada). Horário passado (tolerância de 1 min) ou além de 1 ano → 400
  `OPEX_JOB_INVALID_SCHEDULE`. "Agora" (ou horário vencido) começa na hora.
- **Execução** (`runOpexJob`): reivindica atômico (`scheduled` → `running`), grava `delayMs`, monta o
  escopo — dono, ou o ator do portal revalidado (`clientActorFor` + `assertClientOpexEnabled` + grupo
  jobs ligado em `enabledClientToolNamesFor`) — e usa a sessão escolhida (excluída → erro acionável)
  ou cria uma nova (`createSession` no escopo) com o título do job. O prompt vai por `sendJobMessage`
  (mensagem `kind: "job"` com `job: { id, title }`, exibida com o selo "Job agendado · título"; o
  modelo recebe o contexto do agendamento e o atraso). Sessão respondendo → o prompt entra na **fila**
  da sessão. O fim do turno conclui o job (`settleJobTurn` → `finishJobTurn`): confirmação pendente
  → `awaiting_confirmation` (só o usuário da sessão decide); erro ou interrupção → `error`. Falha
  ao continuar da fila (escopo ou turno) também vira `error` com o motivo. O turno do job passa pelo
  mesmo pipeline dos demais (`redact` nas entradas das ferramentas, histórico e cards).
- **Motivos do portal** (pt-BR): usuário inativo/removido → "O usuário foi desativado ou removido";
  sem vínculo → "O usuário não está mais vinculado ao cliente"; cliente inativo/inexistente → "O
  cliente foi desativado ou excluído"; agente desligado no cliente → "O Agente Opex foi desativado
  para este cliente"; grupo desligado → "Os jobs foram desativados para este cliente".
- **Agendamento**: o tick do agendador interno (`runDueOpexJobs`, chamado no fim de
  `runSchedulerTick`) recupera os perdidos e dispara até 20 vencidos por minuto. Com o **agendador
  desligado** nada roda; app desligado no horário → o job roda **atrasado** e registra o atraso. Job
  do **dono** com o agente desligado ou sem modelo **continua agendado** e roda depois (com atraso);
  job do portal nessas condições falha com o motivo. Job `running` há mais de 2 min sem turno vivo
  nem fila (reinício do servidor) → `error` "O turno do job foi perdido…".
- **Tempo real**: `opex-job-updated` (`{ id, status }`) e `opex-job-finished` (`{ id, title, status,
  sessionId, error, origin }`) sempre em `private-app`; job do portal também em
  `private-opex-{clientId}-{userId}`. O `AgentChatNavItem` (app e portal) mostra o toast do job terminado
  com "Abrir sessão" (o do dono ignora os jobs do portal); a aba Jobs só invalida e relê.
- **Aba "Jobs"** em `/integracoes/crons?aba=jobs` (sempre presente, só no app do dono): filtros
  Agendados/Executados/Todos e origem (Todas/Do dono/Do portal, com o cliente), lista ao vivo,
  "Executar job" (`OpexJobDialog`, react-hook-form + o mesmo schema), editar/cancelar (com
  confirmação, resposta otimista), reexecutar e "Abrir sessão". O portal não tem tela de jobs: usa
  as ferramentas do agente.
- **Auditoria** na entidade `JobAgenteOpex`: criar, editar, cancelar (`ABORTAR`) e executar
  (`EXECUTAR`, com resultado, sessão, cliente, atraso e duração; ator = dono ou o usuário do job).

## Regras de execução

- **Confirmação**: a ferramenta não executa; grava uma ação pendente (`opex_pending_actions`, entrada
  cifrada com `secretBox`), o chat mostra **Confirmar/Cancelar**, a decisão executa (ou não) e volta
  ao agente como mensagem, e o turno seguinte começa sozinho. Expiram em 24 h (409
  `OPEX_ACTION_EXPIRED`); decisão repetida é 409 `OPEX_ACTION_DECIDED`.
- **Prévia**: não aprova prévia cuja clareza indique critérios de aceite ou localização ausentes.
- **Segredos**: não ficam no histórico enviado ao modelo nem nos cards (`redact`).
- **Histórico**: mensagens da AI SDK de cada turno, cortadas por turno num orçamento de ~400 mil
  caracteres; as antigas dão lugar ao resumo da sessão. No envio, o raciocínio dos turnos gravados
  sai (`stripPastReasoning`): a Anthropic assina cada bloco e recusa o que volta com outro prompt
  de sistema ou outro modelo. As mensagens do assistente que ficariam vazias saem do histórico.
- **Memórias no prompt**: ao fim das instruções entra a seção "Memórias e instruções permanentes"
  (`memoriesSection`): no dono, as **globais** e as **do dono**; no portal, as **globais** e as **do
  cliente** (todos os clientes), nessa ordem. Sem memórias, nada é acrescentado. A lista do Agente
  Adversário (`adversarial`) nunca entra no prompt do Agente Opex.
- **Ferramentas de memórias** (`tools/memories.ts`, grupo "Memórias do agente"): o enum `agent` cobre
  todas as listas do catálogo — as três do Agente Opex **e a do Agente Adversário** (`adversarial`) —,
  então o Agente Opex lista, lê, cria, edita e exclui também as memórias do adversário (excluir é
  `destructive`). Sem limite de quantidade por lista; a resposta traz a origem (`origin`, ex.:
  "Mentor · OPE-12", quando gravada pelo Agente Mentor). Sem ferramentas para as decisões do bloqueio
  adversário na mesa.
  - **Agente desenvolvedor** (OPE-97): o enum também cobre `developer-global` (em todas as centrais) e
    `developer-central` (por central). Todas as ferramentas aceitam `centralId` (de `list_centrals`),
    obrigatório em `developer-central` e recusado nas demais listas (erro do serviço). Sem `agent`, ou
    com `developer-central` sem `centralId`, `list_agent_memories` devolve uma lista por central
    (`centralId`, `centralName`); `centralId` filtra uma (inexistente = 404). As mudanças valem a partir
    do próximo turno das mesas e forks.
- **Prompt de sistema estável**: instruções + dono do app (+ memórias). A data e a hora do turno vão como uma
  parte de texto ao fim da última mensagem do usuário, só no envio (`withTurnContext`), para o
  prompt de sistema não mudar entre os turnos e o cache do provedor ser reaproveitado.
- **Consumo** em `ai_consumption_logs`, origens `opex-agent`/`opex-title` (dono) e
  `opex-client-agent`/`opex-client-title` (portal).
- **Auditoria** na entidade `AgenteOpex` (criar/renomear/arquivar/excluir sessão; confirmar/cancelar
  ação), `RepositorioGithub` (escritas do agente nos repositórios) e `TerminalHost` (comandos no
  host). As mutações das ferramentas auditam pelos próprios serviços, como usuário local.
- **Tempo real**: `opex-session-updated` / `opex-session-deleted` em `private-app` (dono) ou em
  `private-opex-{clientId}-{userId}` (portal), com payload `{ id }`. A resposta ao vivo chega por
  NDJSON em `GET /api/opex/sessions/[id]/stream`.

## APIs (sessão do dono)

| Rota | Descrição |
|---|---|
| `GET/PUT /api/ai/features/opex-agent` | Configuração (+ `tools`: nome, grupo, rótulo, descrição, risco e `alwaysOn` de cada ferramenta do dono, e disponibilidade) |
| `GET/POST /api/opex/sessions` | Listar; criar (com `text` opcional, que já envia a primeira mensagem) |
| `GET/PATCH/DELETE /api/opex/sessions/[id]` | Detalhe com mensagens; renomear/arquivar; excluir (com os arquivos) |
| `POST /api/opex/sessions/[id]/messages` | `{ text?, fileIds? }` (409 `OPEX_SESSION_BUSY` / `OPEX_UNAVAILABLE`; 400 `OPEX_FILE_NOT_FOUND` / `OPEX_TOO_MANY_FILES`) |
| `POST /api/opex/sessions/[id]/files` | Reserva `{ name, size, mediaType? }` → URL assinada do PUT (413 `OPEX_FILE_TOO_LARGE`) |
| `POST /api/opex/files/[id]/complete` | Confirma o envio (HeadObject + tamanho; idempotente; 502 preserva a reserva) |
| `GET/DELETE /api/opex/files/[id]` | Conteúdo (`?download=1` baixa; `Range`); remove pendente (409 `OPEX_FILE_SENT`) |
| `GET /api/opex/sessions/[id]/stream` | NDJSON: `snapshot`, `turn-start`, `text-delta`, `reasoning-delta`, `tool-start`, `tool-input`, `tool-end`, `turn-end`, `ping` (o Agente Maddox usa também `tool-confirmation`, `form` e `form-status`) |
| `POST /api/opex/sessions/[id]/interrupt` | Para a resposta |
| `POST /api/opex/actions/[id]` | `{ decision: "confirm" \| "cancel" }` |
| `GET /api/opex/jobs?filter=scheduled\|finished\|all&origin=all\|owner\|client&clientId=&userId=` | Jobs do dono e do portal (agendados por horário; demais do mais recente) |
| `POST /api/opex/jobs` | Cria `{ title, prompt, sessionId, when, amount?, unit?, date?, time?, sourceJobId? }` (reexecução de job do portal mantém o escopo dele) |
| `GET/PATCH/DELETE /api/opex/jobs/[id]` | Detalhe; edita (agendado, só job do dono; 403 `OPEX_JOB_CLIENT_READONLY`); cancela (agendado) |
| `GET/POST /api/opex/mcp-servers` | MCPs (segredos só pelas chaves); cadastra |
| `GET/PUT/PATCH/DELETE /api/opex/mcp-servers/[id]` | Detalhe; edita; `{ enabled }`; exclui (e retira dos clientes) |
| `POST /api/opex/mcp-servers/test` | Testa o rascunho (`id` opcional para usar os segredos salvos): `{ ok, tools, error, durationMs, serverInfo }` |

### Portal do cliente

| Rota | Descrição |
|---|---|
| `GET /api/cliente/opex/status` | `{ enabled, available, reason, modelLabel, files }` |
| `GET/POST /api/cliente/opex/sessions` | Sessões do próprio usuário; criar (com `text` opcional) |
| `GET/PATCH/DELETE /api/cliente/opex/sessions/[id]` | Detalhe; renomear/arquivar; excluir |
| `POST /api/cliente/opex/sessions/[id]/messages` | `{ text?, fileIds? }` |
| `POST /api/cliente/opex/sessions/[id]/files` · `POST /api/cliente/opex/files/[id]/complete` · `GET/DELETE /api/cliente/opex/files/[id]` | Mesmo fluxo de arquivos do dono |
| `GET /api/cliente/opex/sessions/[id]/stream` · `POST …/interrupt` · `POST /api/cliente/opex/actions/[id]` | Resposta ao vivo, parar e confirmar/cancelar |

Todas exigem `requireClientActor` + `assertClientOpexEnabled`; o dono só entra com `x-client-id`
(pré-visualização). Não há rotas de jobs no portal (só as ferramentas do agente).

### Configuração do cliente (dono)

`GET/PUT /api/integrations/orcamentos/clients/[id]/opex-agent` (`{ enabled, enabledTools,
enabledMcpServers }`), auditada; nomes fora do catálogo dão 400 `OPEX_TOOL_UNKNOWN`; MCP inexistente,
400 `OPEX_MCP_NOT_FOUND`; sem `enabledMcpServers`, os MCPs liberados ficam como estão.

## Dados

- Modelos em `src/lib/db/models/Opex.ts`: `opex_sessions` (com `clientId`/`userId` do escopo),
  `opex_messages` (`kind: "job"` + `job`), `opex_pending_actions`, `opex_jobs` (ver "Jobs"), `opex_mcp_servers` (ver "MCPs"; índice único em `slug`) e `opex_files` (só metadados: sessão, nome, mime,
  tamanho, `key`/`uploadKey`, `pending`, `ready`, `messageId`). Índices pela migração
  `ensure-opex-indexes`. A configuração do portal fica em `orcamento_clients.opexAgent`
  (`enabled`, `disabledTools`, `enabledOptInTools`, `enabledMcpServers`).
- `{ feature: "opex-agent" }` em `ai_feature_settings`; objetos em `opex/…` no bucket do Storage S3.

## Código

- Módulos puros: `constants`, `schemas`, `types`, `files`, `history`, `live-message`, `title`,
  `scope`, `client-tools` (catálogo do portal + `buildOpexClientToolTree`), `tool-tree` (árvore,
  confirmação por ferramenta e migração da configuração antiga), `repo-search` (busca nos snapshots), `host-terminal` (diretórios do terminal do host), `issue-readiness` e `issue-nodes` (entrega, veredito e ranking das issues), `mcp` (MCPs: schemas, nomes, risco e confirmação).
- `server/`: `sessions`, `settings`, `hub`, `runner`, `stream`, `titler`, `confirmations`,
  `tool-runtime`, `files`, `scope`, `client-config`, `repo-tar`, `repo-snapshot`, `host-shell`, `issue-graph`, `server/mcp/` (`connect`, `service`, `tools`); `server/tools/` (um arquivo por grupo +
  `define`, `helpers`, `json`, `registry`) e `server/client-tools/` (catálogo executável do portal
  + `registry`).
- `hooks/`: `useOpexSettings` (+ `useOpexStatus`/`useOpexView`), `useOpexSessions`,
  `useOpexStream`, `useOpexTabs`, `useOpexUploads`, `useClientOpexAgentConfig`, `useOpexMcpServers`.
- `components/`: `agents/` (`AgentChatNavItem`, `AgentChatPanel`, `AgentSwitcherHeader`,
  `AgentSwitchProvider`, `agent-descriptors`), `OpexSessionTabs`, `OpexSessionsPanel`, `OpexStatusDot`,
  `OpexScopeProvider`, `VirtualStack`; `chat/`, `settings/` (com `settings/mcp/` e `ToolConfirmMeta`) e `settings/client/` (com
  `ClienteOpexMcpCard`). O campo secreto somente-escrita é `SecretValueInput`
  (`src/components/ui/secret-value-input.tsx`), compartilhado com `SecretField` das Integrações.
- Pontos de montagem: `AppSidebar` (`footerItems`), `AppShell` (`sidebarFooterItems`),
  `AppLayoutShell`, `AiEditorForm`/`AI_TABS`, `prepareModel`/`PreparedModel` exportados de
  `src/lib/ai/stream.ts`, `loadFeature`/`availability`/`assertCatalog`/`persistFeature`/
  `ProviderSettings` exportados de `src/features/ai/server/settings.ts`,
  `importAttachmentFromStorage` (anexos de tarefa) e `listDrafts` (Orçamentos).

## Testes

`__tests__/features/opex-agent/`: `pure` (módulos puros, entrega de arquivos), `tools` (registro,
riscos — inclui a varredura que garante `destructive` nas exclusões/arquivamentos/integração/
credenciais —, redação de segredos e chamadas aos serviços), `runner`, `confirmations`, `files`
(reserva/confirmação/limpeza com S3 mockado), `opex-ui` (componentes), `client-config` (padrão
ativado, ferramentas desligadas, auditoria/eventos, revalidação), `client-tools` (catálogo do
portal, adminOnly, escopo do ator e prévia sem horas reais), `client-scope` (sessões privadas,
404 entre escopos e canal do Pusher), `tool-settings` (confirmação por ferramenta, árvore e
migração da configuração antiga), `jobs` (serviço: agendamento, atraso, fila, confirmação, perdidos,
escopo do portal, motivos de erro, filtro de origem, 403 na edição e dono agendado com o agente
indisponível), `jobs-ui` (aba Jobs, filtros de origem, job do portal) e `opex-tools-card` (árvore, switch "Pede confirmação" e
desligadas) e `github` (snapshot, busca, ref de consulta e escritas) e `host-terminal` (diretórios, tempo e execução no host) e `issues` (entrega, veredito, ranking, grafo em lote e escritas de relações) e `create-task-tool` (coluna padrão, especificação técnica, anexos do chat com falha parcial e migração das instruções antigas) e `mcp` (nomes, risco, schema, cadastro com segredos cifrados, teste de
conexão, ferramentas no turno, MCP indisponível, portal, ação confirmada e as ferramentas de gerenciar
MCPs) e `mcp-ui` (seção MCPs, diálogo, confirmação por ferramenta e card do cliente). Também `__tests__/lib/check-tree.test.ts` e, em `__tests__/features/ai/`, `memories`,
`memory-list`, `memory-summary` e `agent-settings-tabs`.
