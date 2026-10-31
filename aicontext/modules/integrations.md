# Módulo: Integrações (Sistema › Integrações)

Cópia do módulo de Integrações do CRM Marketing Campanhas (que veio do Smart Desk): mesmos
métodos, logs, debug, explorador e segredos cifrados, com o catálogo do Opex e **sem
permissões** (app de uso pessoal, com login por senha única). Lista as integrações usadas pelo app, mostra o status
da conexão, permite editar a configuração sem redeploy e acompanhar logs de debug em tempo real.
Valores que antes viviam no `.env` são persistidos no MongoDB.

## Features

### Catálogo e precedência de configuração

- **Fonte única**: `src/lib/integrations/catalog.ts` (`INTEGRATIONS`). Módulo puro, usado pela
  tela e pelo servidor. Cada entrada define id, nome, descrição de uma linha, ambiente padrão,
  campos públicos, campos privados e as variáveis legadas do `.env`.
- **Integrações ativas**: `pusher`, `internal_api` (API interna: documentação e tokens de sistema
  dos endpoints públicos, sem campos nem segredos), `crons`, `github` (issues → tarefas — ver
  `modules/github.md`), `ai` (Inteligência Artificial, com os provedores `ai_opencode`, `ai_gemini` e
  `ai_jev` — ver `modules/ai.md`), `orcamentos` (nome exibido **Clientes**: clientes do portal
  público, rota `/integracoes/clientes` — ver `modules/orcamentos.md`) e `smtp` (SMTP) e
  `storage_s3` (Storage S3).
- **Integrações-filhas** (`IntegrationDef.parent`): somem da lista de `/integracoes` (a lista traz
  `parent` e `configured`) e aparecem dentro da página da mãe; o voltar da página leva à mãe.
  Rotas próprias via `integrationPath` (`/integracoes/ia`, `/integracoes/ia/opencode`,
  `/integracoes/ia/gemini`, `/integracoes/ia/jev`, `/integracoes/clientes`); `/integracoes/<id>`
  redireciona (`hasCustomIntegrationPath`), e a rota legada `/integracoes/orcamentos` redireciona
  para `/integracoes/clientes`.
- `isIntegrationConfigured(def, resolved)` (`config.ts`): obrigatórios públicos visíveis e segredos
  legíveis preenchidos (não testa a conexão).
- **Em desenvolvimento** (`IN_DEVELOPMENT_INTEGRATIONS`): `google_drive` (Google Drive — fonte de
  tarefas a partir de planilhas do Google Sheets). Aparece na lista com o selo "Em desenvolvimento", sem status, teste, debug,
  edição ou explorar, e não tem página de detalhe.
- ⚠️ **Sem `.env` para integrações novas**: só as herdadas do CRM (Pusher, Crons) têm `env`
  legado. Integração ou campo novo não declara `env` — tudo é configurado em `/integracoes`.
- **Ambiente** (`interno`/`externo`) é campo editável da integração; o catálogo define só o
  default: externo para o Pusher; interno para as demais.
- **Resolvedor** (`src/lib/integrations/config.ts`, somente servidor):
  `getIntegration(id)` / `getIntegrationConfig(id)`. Precedência por campo: banco → `.env`
  legado → default do código. Segredo limpo pela tela (`null` no banco) **não** volta ao `.env`.
  Segredo que não descriptografa (chave trocada) é sinalizado em `secretErrors` e cai no `.env`.
  Banco indisponível → `.env`, sem derrubar a integração.
- **Cache**: `src/lib/integrations/store.ts` guarda os documentos por 30 s por instância. Salvar
  invalida a instância atual.
- **Singletons** (Pusher do servidor) comparam `version` (hash dos valores efetivos) e se
  reconstroem quando a configuração muda.
- **Migração** `seed-integrations-from-env` (roda no boot): cria cada documento com
  `$setOnInsert` a partir do `.env` e dos defaults do código. Nunca sobrescreve edições; completa
  apenas segredos nunca gravados. Sem chave de criptografia, não grava segredos e avisa no log.

### Campos privados

- Criptografados no servidor com AES-256-GCM (`src/lib/crypto/secretBox.ts`) usando
  **`INTEGRATIONS_ENCRYPTION_KEY`**. Aceita qualquer texto não vazio: base64 de 32 bytes ou hex de
  64 caracteres são usados diretamente; outro valor é derivado com SHA-256 (recomendado
  `openssl rand -base64 32`). Valor persistido: `{ v, iv, tag, ct }`.
- **Somente escrita**: a API nunca devolve o valor, só `{ configured, source: db|env|none,
  unreadable }`. A tela mostra "Configurado ••••" com botões Substituir/Definir, Limpar e Desfazer.
- PATCH de segredo: `{ action: "set", value }` criptografa; `{ action: "clear" }` grava `null`;
  ausente mantém. Sem chave → **409** "configure INTEGRATIONS_ENCRYPTION_KEY".
- Auditoria (`entidade: "Integracao"`, ator `local`) registra os campos públicos alterados e, para
  segredos, apenas `(alterado)`/`(removido)`.

### Campos condicionais, controle segmentado e campos de card próprio

- `PublicFieldDef.visibleWhen: { field, equals }` mostra o campo só quando outro campo público
  tem o valor indicado (`isPublicFieldVisible`). O valor de um campo escondido **não é apagado**.
- `required` de campo condicional é exigido (tela e servidor, `findMissingConditionalField`)
  quando a mudança toca o campo ou o controlador → 400 "{Campo}: preenchimento obrigatório".
- `kind: "segmented"`: botões lado a lado (`role="radiogroup"`), valida como `select`.
- `urlOriginOnly` (campos `url`): só `esquema://host:porta`.
- `group: "card"` (`isCardManagedField`): campo gravado só pela rota de um card próprio da
  integração — fica fora do detalhe, do formulário e do PATCH genérico (públicos e segredos).

### Pusher: cluster ou host próprio (Soketi)

- Campo **Conexão** (`mode`, segmentado, `PUSHER_MODE`, padrão `cluster`):
  - **Cluster Pusher**: Cluster (`PUSHER_CLUSTER`, padrão `sa1`) e Cluster público do cliente.
  - **Host próprio**: **URL do servidor** (`PUSHER_URL`) e **URL pública do cliente**
    (`NEXT_PUBLIC_PUSHER_URL`; vazio usa a do servidor). `http`/`ws` = sem TLS, `https`/`wss` =
    com TLS (`parsePusherUrl` em `src/lib/pusher/url.ts`). A URL do servidor aceita só a origem.
  - A **URL pública do cliente** aceita um ou mais endereços separados por vírgula, cada um com
    caminho opcional de proxy (`parsePusherClientUrls`). O navegador escolhe
    (`pickPusherClientEndpoint`) o de mesmo host da página (desempate pelo TLS); senão o de mesmo
    TLS (página `https` só conecta em `wss`); senão o primeiro. O caminho vira o `wsPath` do
    `pusher-js`. Ex. (acesso por IP e pelo domínio):
    `ws://192.168.0.64:6001, wss://reserva.sipal.com.br/dev_automacao/soketi`.
- Ex. local com o container compartilhado `devteam-soketi` (porta 6001, app/key `devteam`):
  servidor em Docker `http://devteam-soketi:6001` (fora do Docker, `http://localhost:6001`);
  navegador = endereço que ELE alcança — `ws://localhost:6001` só se o navegador roda na mesma
  máquina; acessando de outra máquina, o IP do servidor (ex.: `ws://192.168.0.64:6001`). Com a URL
  errada o teste de conexão passa (é do servidor), mas o aviso "Conexão em tempo real
  indisponível" aparece e as telas caem no polling.
- Navegador: config injetada pelo layout raiz via `PusherConfigBridge`, sempre com
  `authEndpoint: "/api/pusher/auth"` (com o subcaminho público, `withBasePath`). Sem Pusher configurado as telas caem no polling.
- **Canais** (`src/lib/pusher/channel-auth.ts`), por **tipo de sessão**: `private-app` (dados das
  telas) e `private-integration-{id}` (só ids do catálogo) — só o **dono**; `private-client-{clientId}`
  — a sessão do cliente em escopo (ou o dono em pré-visualização); `private-repo-recents-{ator}` — só o
  próprio ator, dono (`local`) ou usuário de cliente (ver `modules/repository-recency.md`). Qualquer
  outro canal é negado.

### Tela de listagem (`/integracoes`)

- Cards no padrão dos provedores de IA (mesmo desenho de `AiProvidersTab`): Status (bolinha animada
  com tooltip), Nome + badges (Ambiente e "Não configurado"), descrição truncada e um chevron. **O
  card inteiro é um link** para a página da integração (`integrationPath`) — não há mais botão
  "Editar".
- Ações por card (fora do link): **Testar conexão** e **Debug** (desabilitado com motivo quando o
  debug está desligado).
- Cards "Em desenvolvimento" (Google Drive) no fim, sem ações.

### Página da integração (`/integracoes/[id]`)

- Coluna do formulário: cabeçalho (voltar, nome + status, descrição, última alteração), cartões
  Geral (ambiente, modo debug), Documentação da API, Campos públicos, Campos privados (só com
  segredos), na API interna **Tokens de sistema**.
- Rodapé (`border-t`, `justify-end`): **Desfazer** e **Salvar**, desabilitados sem alterações.
- Com modo debug ligado, o cartão de Logs ocupa a coluna da direita (`sticky`, altura da área
  visível do `<main>` via `useScrollViewportHeight`). Abaixo de `xl` vai para baixo do formulário.
- **Abas** (`components/tabs/`: `IntegrationTabs` + `useIntegrationTab`, copiados do Orquestrador
  WhatsApp do CRM): aba ativa na URL (`?aba=`, padrão omitida), troca animada (`tabMotionProps`) e
  "Descartar alterações?" ao sair de uma aba com mudanças. Usadas pelo GitHub (`GithubEditorForm`:
  Geral, Vínculos, Mapeamento, Sincronização), Inteligência Artificial (`AiEditorForm`:
  Provedores, Entender tarefas, Resumos de tarefas, Orçamentos, Agente Desenvolvedor), página de
  cada provedor (`AiProviderEditorForm`: Configuração, Modelos e Consumo — ver `modules/ai.md`),
  Crons (`CronsEditorForm`: Geral, Rotinas e Jobs), Engramind (`EngramindEditorForm`: Sobre, Conexão,
  Configurações, Provedores, Identidades, Operação e Variáveis de ambiente — ver `modules/engramind.md`) e a página da central de desenvolvimento
  (`/integracoes/ia/centrais/[id]`). A integração **Clientes** (`/integracoes/clientes`) **não tem
  abas**: a lista de clientes aparece direto, sem card interno. `useLocalTabs` é o irmão **sem URL**
  (mesmo formato de retorno), usado nas abas internas da aba "Agente Desenvolvedor", que não
  podem reutilizar `?aba` (já reservado para as abas externas de `AiEditorForm`).
- **Não use `layout` do framer-motion na grade/formulário desta página**: dentro do
  `<motion.main>` do `AppShell` a projeção mede errado e deixa a tela em branco às vezes.

### Teste de conexão

- `POST /api/integrations/[id]/test` responde em NDJSON: `{type:"log", level, message, ts}` e uma
  final `{type:"result", ok, latencyMs, message}`. O modal mostra num terminal (xterm.js).
- O resultado vira o status atual (`integration_statuses`), sem auditoria.
- Testers (`src/features/integrations/testers/testers.ts`):
  - **Pusher**: `GET /channels`.
  - **API interna**: `GET /api/openapi.json` pela URL interna (exige OpenAPI 3.x) e conta os
    tokens de sistema ativos (zero é só informativo).
  - **Crons**: cron secret, agendador ativo e estado de cada rotina.
  - **GitHub**: `GET /user` e `GET /rate_limit`; amarelo sem escopo `repo` (token clássico) ou com
    o limite de uso quase esgotado (ver `modules/github.md`).
  - **SMTP**: `transporter.verify()`; sem host configurado falha avisando que os envios estão em
    modo simulado.
  - **Storage S3**: `HeadBucket` no bucket configurado (exige endpoint e credenciais).
  - **OpenCode / Gemini / Inteligência Artificial**: ver `modules/ai.md`.
  - **Clientes**: sem serviço externo — só conta os clientes cadastrados (ver
    `modules/orcamentos.md`).
- `warnResult(mensagem)` (`testers/types.ts`) grava status amarelo ("Disponível com restrição").

### Status em tempo real

- `runIntegrationTest` grava `runningSince` ao começar; `toHealth` expõe `health.checking` por até
  `RUNNING_STALE_MS` (75 s). Publica `status-updated` em `private-integration-{id}`:
  `{id, checking:true}` no início e `{id, checking:false, health}` no fim.
- Cliente: `useIntegrationStatusLive(ids)` aplica os eventos no cache (`applyIntegrationHealth`).
  Polling: 60 s com Pusher e 15 s sem, só com a aba visível.

### Modo debug

- `integrationDebug(id)` (`src/lib/integrations/debug.ts`) e `debugFetch(...)`: só atuam com o
  debug ligado — exceto `integrationDebug(id, { always: true })`, para logs operacionais que a tela
  sempre mostra (ex.: as centrais de desenvolvimento). Cada evento vai para o console do servidor, para `integration_logs` (TTL 48 h) e
  para o Pusher `private-integration-{id}`, evento `debug-log`, agrupado a cada 500 ms.
- Segredos e chaves sensíveis (`password`, `token`, `authorization`...) são mascarados.
- O **Pusher não retransmite os próprios logs** (recursão).
- Painel/modal **Logs** com busca (`DebugSearchBar` + `@xterm/addon-search`: Enter/Shift+Enter,
  ↑/↓, contador, Esc limpa), Maximizar/Restaurar só no painel do formulário
  (`useMaximizedFrame`), Atualizar (`GET /api/integrations/[id]/logs?after=`) e Testar conexão
  no próprio terminal. **Escopo**: linhas com `data.scope` podem ser filtradas
  (`?scope=` na rota de logs; `IntegrationDebugConsole scope=…`, que também aceita um teste próprio
  em `onTest`) — usado pelo terminal de cada central de desenvolvimento. Ordem do Esc: limpa a busca → restaura (formulário) / fecha (modal).

### Integrações ativáveis (campo `active`)

- Uma integração pode declarar o campo público `active` ("Integração ativa", `boolean`). Hoje só a
  **Builder Machine** (`builder_machine`, padrão desligada — ver `modules/builder-machine.md`).
- Ela aparece sempre na lista e na página (para poder ser ativada); desativada, o **teste periódico
  de status a pula** (`runAllIntegrationHealthChecks`) e as rotas da feature respondem 404.
- **Gancho de ativação**: `updateIntegration` chama `runIntegrationEnableHook` na transição
  `active` desligado → ligado, depois de gravar e auditar (`INTEGRATION_ENABLE_HOOKS` em
  `services/enable-hooks.ts`, import dinâmico; falha só é logada e não desfaz a ativação).
- A Builder Machine tem página própria (`BuilderMachineEditorForm`, ramo `id === "builder_machine"`
  no `IntegrationEditor`).

### Crons e agendador interno

- Motor: `src/features/integrations/scheduler/cron-scheduler.ts` (`runSchedulerTick`). O
  `src/instrumentation.ts` inicia `startCronScheduler()` (tick por `setInterval` a cada minuto) —
  o app roda só em processo Node persistente (local ou Docker); **não há variante Vercel**.
- `GET/POST /api/routines/scheduler-tick` executa o mesmo motor sob demanda (ex.: cron do
  sistema), com `Bearer` igual ao `CRON_SECRET` do ambiente **ou** ao cron secret da integração.
- **Rotinas internas são do código** (`DEFAULT_CRON_JOBS`; `withBuiltInJobs` completa a lista
  salva). Hoje: `integrations-health-check` (a cada 5 min, testa todas as integrações; uma falha é
  repetida uma vez após 5 s — `runIntegrationTest` com `retries: 1` — e só a última tentativa grava o
  status, então falha passageira não fica vermelha; o teste manual não repete) e
  `github-issue-sync` (a cada 2 min, issues dos repositórios vinculados → tarefas — ver
  `modules/github.md`), `agentic-pr-watch` (a cada 2 min, acompanha os PRs das
  mesas de trabalho — ver `modules/agentic-dev.md`) e `ai-task-summary` (a cada 2 min, resumos de
  IA das tarefas não concluídas — ver `modules/ai.md`). O agendamento das internas é editável na tela; só não se
  removem.
- Também são internas `agentic-queue-pump` (1 min — filas das centrais, fila global do build e
  exclusões pendentes de sessões do OpenCode das mesas e dos refinamentos), `ai-task-tags` (3 min),
  `ai-task-tags-concluded` (60 min, **desligada por padrão**) e `task-attachments-cleanup` (30 min —
  remove uploads de anexo abandonados no storage e conclui remoções físicas pendentes; ver
  `modules/tasks.md`, "Anexos da tarefa") e `opex-files-cleanup` (60 min — remove do storage e do banco
  os arquivos do chat do Agente Opex enviados e não usados numa mensagem em 24 h; ver
  `modules/opex-agent.md`), `opencode-quota-refresh` (5 min — relê a quota do plugin `opencode-quota` no
  host do OpenCode e publica `opencode-quota-updated` só quando muda; ver `modules/opencode-quota.md`) e
  `builder-machine-cleanup` (diária às 03:00, **nasce desligada**; ligada
  ao ativar a Builder Machine — ver `modules/builder-machine.md`) e `environments-registry-cleanup`
  (diária às 04:00, **nasce desligada** — mantém as últimas tags de cada ambiente no registry; ver
  `modules/environments.md`). O tick do agendador também chama `runEnvironmentsTick` (retoma deploys
  interrompidos e reabre os repasses das portas dos ambientes no PC).
- **Rotinas de integração ativável** (`INTEGRATION_CRON_JOBS`, `cronJobIntegration`): com a
  integração dona desativada (campo `active`), a rotina some da aba Rotinas (`hiddenJobIds` em
  `CronJobsCard`/`CronJobsEditor`); continua salva e a edição a preserva.
- A rotina `ai-task-tags-concluded` permite persistir
  `scope: "pending" | "all"` no card da rotina ("Só pendentes" / "Todas"), para geração de tags
  de concluídas não arquivadas. O escopo salvo vale tanto para "Executar agora" quanto para o
  agendamento; editar exige salvar antes de executar. Rotinas desativadas não rodam no tick,
  mas podem ser executadas manualmente, inclusive com o agendador desligado.
- Cada rotina é reivindicada atomicamente em `integration_cron_jobs` (lease de 15 min); a
  reivindicação já avança `nextRunAt`. ⚠️ Nunca combine upsert com filtro
  `scheduleSignature: { $ne }` em `syncJobState`.
- Agenda amigável (`src/lib/integrations/schedule.ts`, horário de Brasília): intervalo, diário,
  semanal e mensal. Editar o agendamento recalcula na hora (`rescheduleJobs`).
- Rotinas **HTTP** chamam `POST {URL interna}{path}` com `Bearer {cron secret}`. URL interna =
  campo "URL base interna" ou `http://127.0.0.1:${PORT}` (padrão 3100).
- **Executar agora** (com confirmação): executa a versão salva, só reivindica o lease
  (`runJobNow`), 404 rotina não salva, 409 em execução, falha da rotina → 200 `ok:false`.
  Auditado (`execucaoManual`, `resultado`, `mensagem`, `duracaoMs`).
- **Página em abas** (`CronsEditorForm`): **Geral** (agendador, URL base interna, cron secret e
  documentação), **Rotinas** (lista) e **Jobs** (`OpexJobsTab`: prompts agendados do Agente Opex, do
  dono e dos usuários do portal — ver `modules/opex-agent.md`, "Jobs"; sempre presente).
- Depois dos jobs, o tick confere o túnel da **Builder Machine** (`runLocalDockerHealth`, só com a
  integração ativa, no máximo 1×/min; reabre o túnel caído — ver `modules/builder-machine.md`).
- **Jobs do Agente Opex** rodam no fim de cada tick (`runDueOpexJobs`, import dinâmico com
  `try/catch`, sem derrubar o tick); com o agendador desligado, nenhum job roda. Na aba Rotinas há um campo de **busca** (Fuse.js) que filtra
  a exibição sem mexer no rascunho. Cada rotina nasce **recolhida**: cabeçalho com nome, "Executar
  agora" e o switch de status, mais a linha com a próxima e a última execução; ao expandir, aparecem
  os campos de configuração (nome/caminho, agendamento, escopo e remover). Editar/excluir age sobre
  a rotina original (identidade por referência), nunca pelo índice da lista filtrada.
- Migração `repair-integration-indexes` (boot, idempotente): remove estados duplicados e cria os
  índices das coleções de integração.

### Documentação Swagger (OpenAPI) e explorador

- Campo `swaggerUrl` em todas as integrações (card "Documentação da API"): OpenAPI 3.x em JSON
  ou a página do Swagger UI que a publica.
- **Explorar** com URL salva e sem alterações pendentes: troca o formulário pelo explorador
  (`components/explorer/*`), com debug `[explorar] MÉTODO caminho → status`.
- Localização da especificação (`openapi/spec-source.ts`), parser (`openapi/parser.ts`, puro),
  execução (`openapi/explorer-service.ts`: só operações da especificação, credenciais só para a
  origem do adaptador, timeout 30 s, resposta até 1 MB, mascaramento; métodos que alteram dados
  pedem confirmação e são auditados).
- **Adaptadores** (`openapi/adapters.ts`): `internal_api` usa a URL interna e **não injeta
  credencial** (tokens de sistema ficam só como hash). Com `clientAuthorization: true`, o
  explorador mostra o campo "Token de sistema" (`ClientTokenField`, não é salvo) e o servidor
  repassa esse `Authorization` — só para a origem do adaptador; nos demais casos o cliente nunca
  define `Authorization`. Sem adaptador, a base é o `servers` da especificação, sem credenciais.

### API interna — documentação e tokens de sistema

- **Especificação gerada no código** (`src/features/public-api/openapi/spec.ts`,
  `buildPublicApiSpec`): OpenAPI 3.1, versão do `package.json`, `servers: ["/"]`, esquema
  `apiToken` (Bearer). Corpos/respostas vêm dos schemas Zod (`src/features/public-api/schemas.ts`).
  Hoje documenta `GET /api/v1/whoami` (confere o token; 200/401) e o **servidor MCP do Opex usado
  pelo Agente Maddox** (`POST /api/maddox/mcp/owner` e `/portal`, tags "MCP do Agente Maddox · dono/
  portal", esquema `maddoxMcpSecret`): métodos JSON-RPC, respostas (200/202/400/401/404 e 405 em
  GET/DELETE), as recusas reais de escopo e **todas as ferramentas** de cada servidor — lista na
  descrição da operação (nome no OpenCode, grupo, risco, confirmação, só admin), esquema de entrada
  por ferramenta em Schemas (`MaddoxOwnerTool.*`/`MaddoxPortalTool.*`), `oneOf` do `tools/call` e um
  exemplo de chamada por ferramenta (`exampleFromJsonSchema`: só os campos obrigatórios). Tudo gerado
  do mesmo catálogo do `tools/list` (`maddoxMcpDocsCatalog`, `openapi/maddox-mcp.ts`). A rota
  `GET /api/openapi.json` é dinâmica e carrega o catálogo por import dinâmico (o registro de
  ferramentas não entra no grafo estático nem roda no build); se o catálogo falhar, a especificação
  sai sem o MCP, com log de aviso. Pelo explorador, as chamadas ao MCP respondem 401 (o segredo não
  sai do servidor).
- **Exposição intencional**: como o resto da especificação, a seção do MCP é pública sem login (e com
  CORS aberto): quem tiver a URL vê nomes, descrições e esquemas de entrada das ferramentas do dono e
  do portal. É só contrato (sem dados nem segredos) e foi a opção escolhida pelo dono no plano da
  OPE-101; executar exige o segredo do MCP e uma sessão do Agente Maddox existente. Para esconder o
  catálogo, a alternativa é servir a seção só com sessão do dono (outra URL de especificação).
- **Documentação gerenciada**: `managedSwaggerPath` fixa a `swaggerUrl` em
  `getInternalBaseUrl() + /api/openapi.json`; somente leitura (PATCH → 400).
- Rotas públicas só de contrato: `GET /api/openapi.json` e `GET /api/docs` (Swagger UI). São
  **públicas sem sessão** (`PUBLIC_ROUTES` em `src/features/auth/paths.ts`): expõem só o contrato,
  nenhum dado. É o que permite o tester da API interna chamá-las pelo servidor sem cookie.
- **Tokens de sistema** (`src/features/integrations/api-tokens/`, coleção `api_tokens`): card
  `ApiTokensCard` gera (o valor `mt_sys_…` aparece **uma única vez**, `ApiTokenDialog`), edita os
  escopos e revoga (confirmação; não volta). Banco guarda só o hash SHA-256, o prefixo visível, os
  `escopos` e a `expiraEm` opcional; "último uso" atualizado no máximo a cada 5 min.
- **Escopos (OPE-102)** — módulo puro `api-tokens/scopes.ts`, verificados SEMPRE no servidor:

  | Escopo | Libera |
  |---|---|
  | `api:v1:*` | Todas as rotas da v1 que exigem escopo (atuais e futuras) |
  | `api:v1:<recurso>` | Uma rota (declarada em `PUBLIC_TOKEN_ROUTES`) |
  | `mcp:owner` | O MCP do dono (`initialize`/`ping`/`tools/list`) e o grupo Contexto |
  | `mcp:owner:tool:*` | Todas as ferramentas do dono (dinâmico: ferramenta nova entra sozinha) |
  | `mcp:owner:group:<grupo>` | Um grupo (dinâmico) |
  | `mcp:owner:tool:<nome>` | Uma ferramenta (lista explícita, fixa) |
  | `mcp:owner:destructive` | Entre as concedidas, as destrutivas e as que pedem confirmação por padrão |

  - Pelo menos um escopo por token (Zod `apiTokenScopesSchema`, o mesmo na API e no formulário);
    escopo `mcp:owner:*` exige `mcp:owner`; rota `api:v1:<recurso>` fora de `PUBLIC_TOKEN_ROUTES`,
    ferramenta ou grupo fora do catálogo → 400 `API_TOKEN_SCOPE_UNKNOWN` (`assertKnownScopes`).
  - MCP ligado sem curinga, grupo nem ferramenta (só `mcp:owner`, grupo Contexto) reabre no modo
    "Ferramentas" com a lista vazia — nunca como "Todas".
  - **Destrutivas**: `defaultToolConfirms` (risco `destructive` ou `confirmByDefault`) exige
    `mcp:owner:destructive`, mesmo coberta por curinga/grupo/lista; sem ele, a chamada é recusada
    (pelo token não existe confirmação no chat). O "pede confirmação" que o dono **ligou** numa
    ferramenta nas configurações do Maddox (`confirmationOverrides`) também passa a exigir o escopo
    destrutivo (no `tools/list` e no `tools/call`); desligar a confirmação de uma destrutiva não a libera.
  - **Fora do token**: o grupo `files` (arquivos do chat dependem de uma conversa do Maddox,
    `MADDOX_TOKEN_EXCLUDED_GROUPS`), além dos jobs (já fora do Maddox).
  - **Legado**: token sem `escopos` gravado não tem escopo e acessa só as rotas livres (`whoami`),
    exatamente como antes; não ganha rotas futuras nem o MCP. A lista mostra "Legado · só whoami".
  - **Expiração** opcional (`expiraEm`, fim do dia escolhido no fuso do navegador): expirado → 401,
    como revogado; continua na lista com o badge "Expirado" até ser revogado ou editado.
  - **Edição** (`PATCH …/tokens/[tokenId]`, `updateApiTokenScopes`): troca escopos e expiração com
    efeito imediato (próxima chamada); o valor não muda. Lista com resposta otimista e reversão.
- **Auditoria** (`TokenApiInterna`): `CRIAR` (nome, prefixo, escopos, expiração), `ATUALIZAR` (antes e
  depois dos escopos e da expiração) e `EXCLUIR` (revogação, com os escopos). Nunca o valor.
- **Tela** (`components/internal-api/`): o diálogo tem as etapas formulário → resumo (`ApiTokenSummary`,
  badges + frases de `describeScopes`) → valor (`ApiTokenReveal`). Formulário (`ApiTokenScopeForm`):
  API v1 (`api:v1:*` e as rotas com escopo; as livres aparecem como "sempre liberado"), switch do MCP
  do dono, concessão de ferramentas (`ApiTokenToolsPicker`: `OptionTabs` Todas / Por grupo /
  Ferramentas sobre o `CheckTree`, com busca, "todas" por grupo e "Selecionar tudo"), switch das
  destrutivas e o aviso `ApiTokenDestructiveNotice` (alerta destacado quando liberadas; aviso das que
  serão recusadas quando não), e expiração (`DatePicker`). Lista (`ApiTokenRow`): nome, prefixo,
  badges (`ApiTokenScopeBadges`, inclusive Expirado/Expira), último uso, criado em, Editar escopos e
  Revogar. Skeleton `ApiTokenListSkeleton` com as classes da linha (`api-token-row-layout.ts`).
- **Tempo real**: `api-tokens-updated` (`{ id }`) em `private-app` depois de gerar, editar ou revogar;
  `useApiTokensRealtime` invalida a lista.
- Catálogo do formulário: `GET /api/integrations/internal_api/scopes` (`apiTokenScopeCatalog`: rotas
  de `PUBLIC_TOKEN_ROUTES` e as ferramentas do Maddox que o token pode receber).
- Endpoint público novo: rota com `withRoute` + `requireApiToken(req, { scope: publicRouteScope(path) })`
  (401 `UNAUTHENTICATED` / 403 `INSUFFICIENT_SCOPE`), documentada na especificação (`tokenOperationSecurity`,
  `insufficientScopeResponse`) e em `PUBLIC_TOKEN_ROUTES` **no mesmo commit**.
- **OpenAPI dos escopos**: a descrição do esquema `apiToken` traz o catálogo; cada operação declara
  `security: [{ apiToken: [<escopo>] }]` (papéis do OpenAPI 3.1) e `x-opex-required-scope`, com a
  frase "Escopo exigido". O 403 é documentado onde pode ocorrer (o `whoami` é livre e não tem 403). O
  MCP do dono lista as duas autenticações (`maddoxMcpSecret` e `apiToken: ["mcp:owner"]`), o 403, os
  exemplos por token e o escopo de cada ferramenta (`{token: …}` na lista); o do portal só o segredo
  (token → 403). `GET /api/v1/whoami` responde também `escopos`, `legado` e `expiraEm`.

### Serviços do core: SMTP e Storage S3

- **SMTP** (`src/lib/email/mailer.ts`): a configuração da integração é resolvida a cada envio e o
  transporter é recriado quando a `version` muda. Porta padrão **587**; a porta **465** usa TLS
  direto (`secure`). Sem usuário/senha, o transporte é criado sem autenticação e o remetente vazio
  usa o usuário. Sem host, os envios ficam em **modo simulado** (só log) e `isMockMode()` expõe
  isso. Exporta `sendEmail`, `verifyConnection`, `getSmtpConfig` e `isMockMode`. Hoje nenhum fluxo
  do app envia e-mail — o serviço existe para consumo futuro, com o teste de conexão na tela de
  Integrações.
- **Storage S3** (`src/lib/storage/s3.ts`): cliente MinIO/S3 compatível (`forcePathStyle`), criado
  a partir do **Endpoint** interno e recriado quando a configuração muda. As URLs assinadas (SigV4)
  têm duas audiências: `browser` (upload direto e mídia) assina com o **Endpoint público** quando
  configurado — o subcaminho do proxy entra só na URL, sem afetar a assinatura — e `server` usa o
  Endpoint interno. Exporta `uploadFile`, `getFileUrl`, `getUploadUrl`, `getFileStream`,
  `getFileObject` (com `Range` opcional, para a reprodução de mídia), `headFile`, `copyFile`
  (promoção server-side de um objeto temporário à chave definitiva, usada pelos anexos),
  `deleteFile`, `checkBucket` e `getSignedUrlExpiresIn`. A expiração da URL assinada
  é configurável (60 s a 7 dias, padrão 1 h). `storageErrorInfo(error)` classifica a falha de uma
  operação em `not_found` (404/`NoSuchKey` — ausência comprovada), `forbidden` (401/403/
  `AccessDenied` — recusa de acesso) e `unavailable` (rede, tempo esgotado, 5xx e configuração
  inválida). **403 nunca é tratado como objeto ausente**. Cloudflare converte HEAD em GET para
  extensões cacheáveis quando o cache está frio; isso invalida SigV4, que assina o método HTTP,
  e o HEAD sem corpo chega ao SDK como `UnknownError`. `headFile` recupera esse caso com GET
  autenticado sem Range, aproveita os metadados e fecha o stream imediatamente (sem ler o corpo
  nem acumular o arquivo em memória). O GET mantém a verificação de autorização e propaga falhas;
  não há acesso público nem confirmação sem conferir o objeto. Preferencialmente o endpoint
  interno deve apontar direto para o S3, ou o proxy deve ter bypass de cache para todo o serviço.
  Quem consome a classificação são os anexos
  (`modules/tasks.md`, "Anexos da tarefa").
- As duas integrações são **novas** no Opex: não declaram `env` e são configuradas só em
  `/integracoes`. Nenhum dos testes de conexão envia e-mail nem grava objeto.

### Engramind

Integração `engramind` (externo, sem `env`): campos gravados pela aba Conexão (`PUT
/api/engramind/connection`, que chama `updateIntegration` e roda o bootstrap do token), tester em
`src/features/engramind/server/tester.ts` (`/health/ready` + `whoami`) e um proxy administrativo em
`/api/engramind/**`. O **webhook** `POST /api/engramind/webhook` é público e autenticado só pela
assinatura HMAC (não é token de sistema). Componentes compartilhados nascidos aqui: `InfoTooltip`
(`src/components/ui/info-tooltip.tsx`) e `SecretReveal` (`src/components/ui/secret-reveal.tsx`, usado
também pelo `ApiTokenReveal`). Detalhes em `modules/engramind.md`.

### Planejado (em desenvolvimento)

- **Google Drive**: fonte de tarefas a partir de planilhas do Google Sheets.

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/integrations` | Lista com ambiente, debug e status |
| `GET /api/integrations/[id]` | Detalhe; segredos só como estado |
| `PATCH /api/integrations/[id]` | Campos, ambiente, debug, documentação Swagger e segredos (Zod por catálogo) |
| `POST /api/integrations/[id]/test` | Teste em NDJSON |
| `GET /api/integrations/[id]/logs` | Logs de debug (48 h), `after`/`limit` |
| `POST /api/integrations/crons/jobs/[jobId]/run` | Executar agora a rotina salva (lease; 404/409; auditada) |
| `GET /api/integrations/[id]/openapi` | Especificação normalizada; `?refresh=1`; 422 se não for OpenAPI 3.x |
| `POST /api/integrations/[id]/explore` | Executa `{operation, path, query, headers, body}` |
| `GET/POST /api/integrations/internal_api/tokens` | Lista / gera token de sistema (valor só na resposta do POST) |
| `PATCH /api/integrations/internal_api/tokens/[tokenId]` | Edita escopos e expiração (efeito imediato; auditado antes/depois) |
| `DELETE /api/integrations/internal_api/tokens/[tokenId]` | Revoga token de sistema |
| `GET /api/integrations/internal_api/scopes` | Catálogo de escopos do formulário (rotas e ferramentas do MCP do dono) |
| `GET /api/openapi.json` · `GET /api/docs` | Especificação e Swagger UI da API interna (públicas) |
| `/api/integrations/orcamentos/clients*` | Clientes do portal (ver `modules/orcamentos.md`) |
| `/api/cliente/*` | Portal do cliente, autenticado pelo token do cliente (ver `modules/orcamentos.md`) |
| `GET /api/v1/whoami` | Pública por token de sistema (livre para qualquer token válido) |
| `/api/integrations/github/*` | Vínculos, mapeamento, sincronização e opções (ver `modules/github.md`) |
| `GET/POST /api/routines/scheduler-tick` | Tick do agendador (Bearer `CRON_SECRET` ou cron secret) |
| `POST /api/pusher/auth` | Autoriza os canais privados do tipo de sessão (`private-app`, `private-integration-{id}`, `private-client-{clientId}`, `private-repo-recents-{ator}`) |

## Consumidores

- Pusher: `src/lib/pusher/server.ts` (`getPusherServer`), publicação em
  `src/lib/pusher/channels.ts` (`publishAppEvent`, **somente servidor**). Hooks de cliente importam
  nomes de canais de `src/lib/pusher/channel-names.ts` (módulo puro). O teste
  `__tests__/app/client-bundle-boundary.test.ts` falha se um arquivo `"use client"` alcançar
  Mongoose, banco, Pino, Pusher servidor ou `node:*`.

## Testes

`__tests__/lib/integrations/*`, `__tests__/lib/email/mailer.test.ts`, `__tests__/lib/storage/*`,
`__tests__/features/integrations/*`, `__tests__/features/public-api/public-api-openapi.test.ts` e
`__tests__/lib/pusher/channel-auth.test.ts`. O setup do Vitest faz mock de
`@/lib/integrations/store` (store vazio → todos leem o `.env`).
