# Módulo: Agente Opex (`src/features/opex-agent/`)

Assistente por chat que executa as funcionalidades do app com ferramentas (tool calling da AI SDK),
sem limite de passos nem de chamadas. Portado do My Tasks (OPE-81, bloco H) como recurso **nativo**
(sem gate de Recursos beta).

## Onde fica e como abre

- Item **"Agente Opex"** (ícone `Bot`) no rodapé da barra lateral do **dono** (`AppLayoutShell`
  passa `sidebarFooterItems` ao `AppShell`) e no **portal do cliente** quando o dono ativa o agente
  para aquele cliente (`ClientePortalShell`; ver "Agente no portal do cliente").
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
- Cada linha das respostas tem, no hover, **Citar no campo de resposta**: insere `> linha` no cursor
  do campo do chat sem apagar o texto (`ReplyTargetProvider` no `OpexChat`, `ReplyTextarea` no
  `OpexComposer`).
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

## Agente no portal do cliente (OPE-83)

O mesmo painel/hooks do dono atende o portal. O **escopo** (`src/features/opex-agent/scope.ts`
puro e `server/scope.ts`) decide sessões, canal, abas e catálogo: `owner` (app interno) ou
`client` (portal, com o `ClientActor` revalidado no banco).

- **Configuração por cliente**: aba **"Agente Opex"** em `/integracoes/clientes/[id-cliente]`
  (`ClienteOpexAgentTab`), salva em `orcamento_clients.opexAgent` (`{ enabled, disabledTools }`).
  Sem configuração, vale o padrão: **ativado** e com todas as ferramentas do portal. Guardar as
  **desligadas** faz ferramenta nova entrar ligada; o contexto (`get_portal_overview`) é sempre
  ativo. A seleção é por ferramenta, na **mesma árvore** da seleção do dono (`CheckTree`: módulo
  por grupo com caixa tri-estado, contador, busca; Contexto travado como "Sempre ligada"), com o
  selo de risco em cada ferramenta e "Só admin do cliente" nos grupos/ferramentas de admin. Salvar é auditado (`ClienteOrcamentoOpexAgent`) e publica
  `opex-client-config-updated` em `private-app` e `private-client-{clientId}`.
- **Ativação**: `orçamento_clients.opexAgent.enabled`. Desativado, o item **não aparece** no portal
  (o layout calcula `opexEnabled` e o `OpexNavItem` também consulta `GET /api/cliente/opex/status`)
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
  | Memórias do agente | `list_agent_memories`, `get_agent_memory`, `create_agent_memory`, `update_agent_memory`, `delete_agent_memory`* (listas `opex-global`, `opex-owner`, `opex-client`; texto revisado pelo "Resumo de memórias") |
| Arquivos do chat | `list_chat_files`, `read_chat_file`, `attach_files_to_task`, `attach_files_to_preview` |
  | Dashboard | `get_dashboard` |
  | Financeiro (**admin**) | `get_finance`, `get_service` |
  | Usuários (**admin**) | `list_users`, `update_user`, `delete_user`* |

  `*` destrutivo. Criar usuário e gerar token ficam **fora**: devolvem segredo que não pode chegar
  ao modelo. `update_user` redige a senha. As de admin só entram no turno quando o usuário é
  **admin do cliente**.
- **Escopo no servidor, não na interface**: o turno monta o catálogo pela configuração + papel, e
  o runtime **revalida antes de cada ferramenta** (`authorize`): relê o vínculo, o cliente e a
  configuração, e troca o ator pelo atual (papel pode mudar no meio do turno). A confirmação
  (`decideAction`) também resolve a sessão no escopo e revalida antes de executar. Cada ferramenta
  chama o serviço do portal, que filtra de novo pelo cliente — três camadas independentes.
- **Instruções** próprias (`DEFAULT_OPEX_CLIENT_INSTRUCTIONS`) + cliente, usuário e papel; o
  modelo do dono é reaproveitado. Consumo em origens `opex-client-agent` / `opex-client-title`.
- **Interface**: `OpexScopeProvider` (dono por padrão) fornece `apiBase` (`/opex` ou
  `/cliente/opex`), o axios do portal (`x-client-id`), o canal, a chave do cache e a chave das abas
  (`opex:opex-agent:tabs:v1:{clientId}:{userId}`). Hooks e painel não sabem em qual escopo estão.
- Excluir o cliente apaga as sessões, mensagens, ações e arquivos do agente daquele cliente.

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
  - **Memórias** (`OpexMemoriesSection`): três cards do Ciliar (`AgentMemoriesCard`) — **Memórias
    globais**, **Memórias do dono** e **Memórias do cliente**; salvam sozinhos (ver
    `aicontext/modules/ai.md`, "Memórias do Agente Opex").
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
| Arquivos do chat | `list_chat_files`, `read_chat_file`, `attach_files_to_task` (cópia server-side do S3 para `task_attachments`, opcionalmente no fim da descrição), `attach_files_to_preview` (anexos do rascunho de prévia); `create_preview` aceita `chatFileIds` |
| Tarefas (a tarefa também pode ser referida pela issue vinculada, `repo#N`/`dono/repo#N`) | `get_task_options`, `list_tasks`, `get_task`, `create_task` (com issue), `update_task`, `move_task`, `add_comment`, `set_task_archived`*, `delete_task`*, `sync_task_issue`, `understand_task`, `generate_task_summary`, `generate_task_tags`, `estimate_task`, `set_task_estimate` |
| Prévias | `create_preview`, `get_preview`, `generate_preview` (com clareza e estimativa), `set_preview_correction`, `estimate_preview`, `approve_preview` (cria a tarefa local com issue) |
| Horas (somente leitura) | `list_active_periods`, `list_time_logs` |
| Mesas de trabalho | `list_workbenches`, `get_workbench`, `get_workbench_output`, `start_workbench`, `revise_plan`, `implement`, `request_correction`, `submit_pr_feedback`, `reopen_workbench`, `approve_workbench`, `retry_workbench`, `reconnect_workbench`, `cancel_workbench_wait`, `interrupt_workbench`*, `set_workbench_model` (papel `planning`/`implementation`/`build`/`pr`, vale no próximo turno), `reply_workbench_permission`, `reply_workbench_form`, `delete_workbench`* |
| Centrais | `list_centrals`, `get_central`, `create_central`, `update_central`, `test_central`, `delete_central`*, `get_agentic_settings`, `update_agentic_settings` |
| Issues e dependências | `get_issue`, `list_issues`, `get_issue_dependencies`, `rank_ready_tasks` (qual tarefa começar), `add_issue_dependency`†, `add_sub_issue`†, `remove_issue_dependency`*, `remove_sub_issue`* — detalhes abaixo |
| Repositórios GitHub | `list_repositories`, `get_repo_tree`, `read_repo_file`, `search_repo_code`, `list_branches`, `list_commits`, `get_commit`, `compare_refs`, `create_branch`†, `write_repo_file`†, `delete_repo_file`*, `delete_branch`* — detalhes abaixo |
| Integrações | `list_integrations`, `get_integration` (sem segredos), `update_integration`* (grava segredos, nunca lê), `test_integration` |
| Rotinas | `list_routines` (sem o `cronSecret`), `run_routine` |
| Features de IA | `get_ai_feature_settings`, `update_ai_feature_settings` |
| Revisão de PR | `list_pr_reviews`, `get_pr_review`, `request_pr_review`, `rerun_pr_review`, `stop_pr_review`* |
| Dashboards | `get_dashboard` |
| Serviços | `list_services`, `get_service`, `create_service`, `update_service`, `set_service_archived`*, `regenerate_service_ai` |
| Financeiro (leitura) | `get_finance` (totais e grupos por cliente/período, itens opcionais) |
| Terminal do host | `get_host_terminal`, `run_host_command`* — detalhes abaixo |
| Clientes | `list_clients`, `get_client` (usuários do portal e prévias de orçamento recentes), `create_client`*, `update_client`, `regenerate_client_token`*, `delete_client`*, `create_client_user`*, `update_client_user`*, `regenerate_client_user_token`*, `delete_client_user`* |

\* `destructive`. Regra (testada): toda ferramenta de exclusão, arquivamento, gravação de integração
ou credencial/token/senha de cliente é `destructive`. Tokens, `portalPath` (que carrega o token) e
senhas nunca saem para o modelo nem para os cards (`redact` + saídas enxutas). † `write` com
`confirmByDefault` (pede confirmação por padrão).

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
  cliente** (todos os clientes), nessa ordem. Sem memórias, nada é acrescentado.
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
| `GET /api/opex/sessions/[id]/stream` | NDJSON: `snapshot`, `turn-start`, `text-delta`, `reasoning-delta`, `tool-start`, `tool-input`, `tool-end`, `turn-end`, `ping` |
| `POST /api/opex/sessions/[id]/interrupt` | Para a resposta |
| `POST /api/opex/actions/[id]` | `{ decision: "confirm" \| "cancel" }` |

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
(pré-visualização).

### Configuração do cliente (dono)

`GET/PUT /api/integrations/orcamentos/clients/[id]/opex-agent` (`{ enabled, enabledTools }`),
auditada; nomes fora do catálogo dão 400 `OPEX_TOOL_UNKNOWN`.

## Dados

- Modelos em `src/lib/db/models/Opex.ts`: `opex_sessions` (com `clientId`/`userId` do escopo),
  `opex_messages`, `opex_pending_actions` e `opex_files` (só metadados: sessão, nome, mime,
  tamanho, `key`/`uploadKey`, `pending`, `ready`, `messageId`). Índices pela migração
  `ensure-opex-indexes`. A configuração do portal fica em `orcamento_clients.opexAgent`.
- `{ feature: "opex-agent" }` em `ai_feature_settings`; objetos em `opex/…` no bucket do Storage S3.

## Código

- Módulos puros: `constants`, `schemas`, `types`, `files`, `history`, `live-message`, `title`,
  `scope`, `client-tools` (catálogo do portal + `buildOpexClientToolTree`), `tool-tree` (árvore,
  confirmação por ferramenta e migração da configuração antiga), `repo-search` (busca nos snapshots), `host-terminal` (diretórios do terminal do host), `issue-readiness` e `issue-nodes` (entrega, veredito e ranking das issues).
- `server/`: `sessions`, `settings`, `hub`, `runner`, `stream`, `titler`, `confirmations`,
  `tool-runtime`, `files`, `scope`, `client-config`, `repo-tar`, `repo-snapshot`, `host-shell`, `issue-graph`; `server/tools/` (um arquivo por grupo +
  `define`, `helpers`, `json`, `registry`) e `server/client-tools/` (catálogo executável do portal
  + `registry`).
- `hooks/`: `useOpexSettings` (+ `useOpexStatus`/`useOpexView`), `useOpexSessions`,
  `useOpexStream`, `useOpexTabs`, `useOpexUploads`, `useClientOpexAgentConfig`.
- `components/`: `OpexNavItem`, `OpexPanel`, `OpexSessionTabs`, `OpexSessionsPanel`, `OpexStatusDot`,
  `OpexScopeProvider`, `VirtualStack`; `chat/`, `settings/` e `settings/client/`.
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
migração da configuração antiga) e `opex-tools-card` (árvore, switch "Pede confirmação" e
desligadas) e `github` (snapshot, busca, ref de consulta e escritas) e `host-terminal` (diretórios, tempo e execução no host) e `issues` (entrega, veredito, ranking, grafo em lote e escritas de relações). Também `__tests__/lib/check-tree.test.ts` e, em `__tests__/features/ai/`, `memories`,
`memory-list`, `memory-summary` e `agent-settings-tabs`.
