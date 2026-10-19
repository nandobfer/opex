# Módulo: Agente Opex (`src/features/opex-agent/`)

Assistente por chat que executa as funcionalidades do app com ferramentas (tool calling da AI SDK),
sem limite de passos nem de chamadas. Portado do My Tasks (OPE-81, bloco H) como recurso **nativo**
(sem gate de Recursos beta).

## Onde fica e como abre

- Item **"Agente Opex"** (ícone `Bot`) no rodapé da barra lateral, **só no menu do dono**
  (`AppLayoutShell` passa `sidebarFooterItems` ao `AppShell`; o portal do cliente não tem).
- Clicar abre um **popover** ancorado no item, com abertura animada (spring de escala a partir da
  âncora, Framer Motion, respeitando movimento reduzido). O botão **Maximizar** amplia o painel.
- No celular (< 768 px) abre em painel de tela cheia (Dialog do Radix).
- Atalho global **Ctrl+Shift+O** (⌘+Shift+O no Mac) abre e fecha (`isOpexShortcut`).
- Um ponto pulsando no ícone avisa que alguma sessão está respondendo ou aguarda confirmação.

## Sessões

- **Sessões em abas**, sem limite; cada aba tem o próprio contexto. Fechar a aba não exclui a sessão.
- As abas abertas ficam no `localStorage` (`opex:opex-agent:tabs:v1`, `usePersistentState` + Zod).
- **Sessões** abre a lista de todas: busca tolerante (fuse.js) por título e resumo, filtro das
  arquivadas, renomear, arquivar e excluir (com `AlertDialog`) e lista virtualizada acima de 50.
- A primeira mensagem de uma "Nova sessão" cria a sessão.

## Chat

- Streaming de texto com cursor e raciocínio recolhível ("Pensando…").
- Cards de ferramenta com estado animado, duração e entrada/saída recolhíveis.
- Rodapé de cada resposta com modelo, tokens e duração.
- **Tentar novamente** quando a resposta falha ou é interrompida; **Parar** durante o turno (a
  resposta parcial é mantida); **Ir para o fim**; conversa virtualizada acima de 50 mensagens.
- Estados: vazio com sugestões, carregando (skeleton), erro (tentar novamente), agente não
  configurado (link para a aba) e reconectando.
- Cores só por tokens (`warning`/`success`/`destructive`/`primary`); cada `Tooltip` traz o próprio
  `TooltipProvider`; ids gerados com `randomId()` (contexto HTTP não seguro).

## Arquivos no chat (Storage S3 com upload assinado)

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

## Configuração

- Aba **"Agente Opex"** (`agente-opex`, ícone `Bot`) em `/integracoes/ia?aba=agente-opex`
  (`AiEditorForm` + `AI_TABS`), salva em `ai_feature_settings` (`feature: "opex-agent"`).
- Agente principal (provedor, modelo, variante; temperatura e máximo de tokens nos provedores com
  amostragem), subagente de título e resumo, instruções dos dois ("Restaurar padrão"), grupos de
  ferramentas, política de confirmação e o card "Arquivos no chat".
- Provedores: **Gemini, Anthropic, OpenAI e DeepSeek** (o OpenCode não executa ferramentas do app).
  Ativar exige provedor conectado; modelo e variante conferidos no catálogo (`assertCatalog`).

## Ferramentas (`server/tools/`)

Cada ferramenta chama a **função de serviço real** do Opex (nunca HTTP), herdando validação Zod,
auditoria e tempo real. Risco: `read`, `write` (pede confirmação na política "Toda alteração") ou
`destructive` (**sempre** pede Confirmar/Cancelar).

| Grupo | Ferramentas |
|---|---|
| Contexto (sempre ligado) | `get_app_overview` |
| Arquivos do chat | `list_chat_files`, `read_chat_file`, `attach_files_to_task` (cópia server-side do S3 para `task_attachments`, opcionalmente no fim da descrição), `attach_files_to_preview` (anexos do rascunho de prévia); `create_preview` aceita `chatFileIds` |
| Tarefas | `get_task_options`, `list_tasks`, `get_task`, `create_task` (com issue), `update_task`, `move_task`, `add_comment`, `set_task_archived`*, `delete_task`*, `sync_task_issue`, `understand_task`, `generate_task_summary`, `generate_task_tags`, `estimate_task`, `set_task_estimate` |
| Prévias | `create_preview`, `get_preview`, `generate_preview` (com clareza e estimativa), `set_preview_correction`, `estimate_preview`, `approve_preview` (cria a tarefa local com issue) |
| Horas (somente leitura) | `list_active_periods`, `list_time_logs` |
| Mesas de trabalho | `list_workbenches`, `get_workbench`, `get_workbench_output`, `start_workbench`, `revise_plan`, `implement`, `request_correction`, `submit_pr_feedback`, `reopen_workbench`, `approve_workbench`, `retry_workbench`, `reconnect_workbench`, `cancel_workbench_wait`, `interrupt_workbench`*, `set_workbench_model` (papel `planning`/`implementation`/`build`/`pr`, vale no próximo turno), `reply_workbench_permission`, `reply_workbench_form`, `delete_workbench`* |
| Centrais | `list_centrals`, `get_central`, `create_central`, `update_central`, `test_central`, `delete_central`*, `get_agentic_settings`, `update_agentic_settings` |
| Integrações | `list_integrations`, `get_integration` (sem segredos), `update_integration`* (grava segredos, nunca lê), `test_integration` |
| Rotinas | `list_routines` (sem o `cronSecret`), `run_routine` |
| Features de IA | `get_ai_feature_settings`, `update_ai_feature_settings` |
| Revisão de PR | `list_pr_reviews`, `get_pr_review`, `request_pr_review`, `rerun_pr_review`, `stop_pr_review`* |
| Dashboards | `get_dashboard` |
| Serviços | `list_services`, `get_service`, `create_service`, `update_service`, `set_service_archived`*, `regenerate_service_ai` |
| Financeiro (leitura) | `get_finance` (totais e grupos por cliente/período, itens opcionais) |
| Clientes | `list_clients`, `get_client` (usuários do portal e prévias de orçamento recentes), `create_client`*, `update_client`, `regenerate_client_token`*, `delete_client`*, `create_client_user`*, `update_client_user`*, `regenerate_client_user_token`*, `delete_client_user`* |

\* `destructive`. Regra (testada): toda ferramenta de exclusão, arquivamento, gravação de integração
ou credencial/token/senha de cliente é `destructive`. Tokens, `portalPath` (que carrega o token) e
senhas nunca saem para o modelo nem para os cards (`redact` + saídas enxutas).

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
- **Prompt de sistema estável**: instruções + dono do app. A data e a hora do turno vão como uma
  parte de texto ao fim da última mensagem do usuário, só no envio (`withTurnContext`), para o
  prompt de sistema não mudar entre os turnos e o cache do provedor ser reaproveitado.
- **Consumo** em `ai_consumption_logs`, origens `opex-agent` (turno) e `opex-title` (subagente).
- **Auditoria** na entidade `AgenteOpex` (criar/renomear/arquivar/excluir sessão; confirmar/cancelar
  ação). As mutações das ferramentas auditam pelos próprios serviços, como usuário local.
- **Tempo real**: `opex-session-updated` / `opex-session-deleted` em `private-app` (payload `{ id }`).
  A resposta ao vivo chega por NDJSON em `GET /api/opex/sessions/[id]/stream`.

## APIs (sessão do dono)

| Rota | Descrição |
|---|---|
| `GET/PUT /api/ai/features/opex-agent` | Configuração (+ `toolCounts` e disponibilidade) |
| `GET/POST /api/opex/sessions` | Listar; criar (com `text` opcional, que já envia a primeira mensagem) |
| `GET/PATCH/DELETE /api/opex/sessions/[id]` | Detalhe com mensagens; renomear/arquivar; excluir (com os arquivos) |
| `POST /api/opex/sessions/[id]/messages` | `{ text?, fileIds? }` (409 `OPEX_SESSION_BUSY` / `OPEX_UNAVAILABLE`; 400 `OPEX_FILE_NOT_FOUND` / `OPEX_TOO_MANY_FILES`) |
| `POST /api/opex/sessions/[id]/files` | Reserva `{ name, size, mediaType? }` → URL assinada do PUT (413 `OPEX_FILE_TOO_LARGE`) |
| `POST /api/opex/files/[id]/complete` | Confirma o envio (HeadObject + tamanho; idempotente; 502 preserva a reserva) |
| `GET/DELETE /api/opex/files/[id]` | Conteúdo (`?download=1` baixa; `Range`); remove pendente (409 `OPEX_FILE_SENT`) |
| `GET /api/opex/sessions/[id]/stream` | NDJSON: `snapshot`, `turn-start`, `text-delta`, `reasoning-delta`, `tool-start`, `tool-input`, `tool-end`, `turn-end`, `ping` |
| `POST /api/opex/sessions/[id]/interrupt` | Para a resposta |
| `POST /api/opex/actions/[id]` | `{ decision: "confirm" \| "cancel" }` |

## Dados

- Modelos em `src/lib/db/models/Opex.ts`: `opex_sessions`, `opex_messages`, `opex_pending_actions`
  e `opex_files` (só metadados: sessão, nome, mime, tamanho, `key`/`uploadKey`, `pending`, `ready`,
  `messageId`). Índices pela migração `ensure-opex-indexes`.
- `{ feature: "opex-agent" }` em `ai_feature_settings`; objetos em `opex/…` no bucket do Storage S3.

## Código

- Módulos puros: `constants`, `schemas`, `types`, `files`, `history`, `live-message`, `title`.
- `server/`: `sessions`, `settings`, `hub`, `runner`, `stream`, `titler`, `confirmations`,
  `tool-runtime`, `files`; `server/tools/` (um arquivo por grupo + `define`, `helpers`, `json`,
  `registry`).
- `hooks/`: `useOpexSettings`, `useOpexSessions`, `useOpexStream`, `useOpexTabs`, `useOpexUploads`.
- `components/`: `OpexNavItem`, `OpexPanel`, `OpexSessionTabs`, `OpexSessionsPanel`, `OpexStatusDot`,
  `VirtualStack`; `chat/` e `settings/`.
- Pontos de montagem: `AppSidebar` (`footerItems`), `AppShell` (`sidebarFooterItems`),
  `AppLayoutShell`, `AiEditorForm`/`AI_TABS`, `prepareModel`/`PreparedModel` exportados de
  `src/lib/ai/stream.ts`, `loadFeature`/`availability`/`assertCatalog`/`persistFeature`/
  `ProviderSettings` exportados de `src/features/ai/server/settings.ts`,
  `importAttachmentFromStorage` (anexos de tarefa) e `listDrafts` (Orçamentos).

## Testes

`__tests__/features/opex-agent/`: `pure` (módulos puros, entrega de arquivos), `tools` (registro,
riscos — inclui a varredura que garante `destructive` nas exclusões/arquivamentos/integração/
credenciais —, redação de segredos e chamadas aos serviços), `runner`, `confirmations`, `files`
(reserva/confirmação/limpeza com S3 mockado) e `opex-ui` (componentes).
