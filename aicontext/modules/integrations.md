# Módulo: Integrações (Sistema › Integrações)

Cópia do módulo de Integrações do CRM Marketing Campanhas (que veio do Smart Desk): mesmos
métodos, logs, debug, explorador e segredos cifrados, com o catálogo do Opex e **sem
permissões** (app de uso pessoal, sem login). Lista as integrações usadas pelo app, mostra o status
da conexão, permite editar a configuração sem redeploy e acompanhar logs de debug em tempo real.
Valores que antes viviam no `.env` são persistidos no MongoDB.

## Features

### Catálogo e precedência de configuração

- **Fonte única**: `src/lib/integrations/catalog.ts` (`INTEGRATIONS`). Módulo puro, usado pela
  tela e pelo servidor. Cada entrada define id, nome, descrição de uma linha, ambiente padrão,
  campos públicos, campos privados e as variáveis legadas do `.env`.
- **Integrações ativas**: `pusher`, `internal_api` (API interna: documentação e tokens de sistema
  dos endpoints públicos, sem campos nem segredos), `crons`, `go_sipal` (Go! Sipal: sessão por
  código de e-mail — ver `modules/go-sipal.md`), `github` (issues → rascunhos de tarefas — ver
  `modules/github.md`) e `ai` (Provedores de IA, com os provedores `ai_opencode` e `ai_gemini` — ver
  `modules/ai.md`).
- **Integrações-filhas** (`IntegrationDef.parent`): somem da lista de `/integracoes` (a lista traz
  `parent` e `configured`) e aparecem dentro da página da mãe; o voltar da página leva à mãe.
  Rotas próprias via `integrationPath` (`/integracoes/ia`, `/integracoes/ia/opencode`,
  `/integracoes/ia/gemini`); `/integracoes/<id>` redireciona (`hasCustomIntegrationPath`).
- `isIntegrationConfigured(def, resolved)` (`config.ts`): obrigatórios públicos visíveis e segredos
  legíveis preenchidos (não testa a conexão).
- **Em desenvolvimento** (`IN_DEVELOPMENT_INTEGRATIONS`): `archflow` (Archflow — solicitar deploys
  em QA e PRD). Aparece na lista com o selo "Em desenvolvimento", sem status, teste, debug,
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
- O **JWT do Go! Sipal** é o segredo `token` da integração `go_sipal`, gravado só pelo card da
  sessão (`group: "card"`).

### Campos condicionais, controle segmentado e campos de card próprio

- `PublicFieldDef.visibleWhen: { field, equals }` mostra o campo só quando outro campo público
  tem o valor indicado (`isPublicFieldVisible`). O valor de um campo escondido **não é apagado**.
- `required` de campo condicional é exigido (tela e servidor, `findMissingConditionalField`)
  quando a mudança toca o campo ou o controlador → 400 "{Campo}: preenchimento obrigatório".
- `kind: "segmented"`: botões lado a lado (`role="radiogroup"`), valida como `select`.
- `urlOriginOnly` (campos `url`): só `esquema://host:porta`.
- `group: "card"` (`isCardManagedField`): campo gravado só pela rota de um card próprio da
  integração — fica fora do detalhe, do formulário e do PATCH genérico (públicos e segredos).
  Usado pela sessão do Go! Sipal.

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
- **Canais** (`src/lib/pusher/channel-auth.ts`): `private-app` (dados das telas) e
  `private-integration-{id}` (só ids do catálogo). Qualquer outro canal é negado. Não há usuário
  para conferir; a rota `/api/pusher/auth` só valida o nome do canal.

### Tela de listagem (`/integracoes`)

- Tabela no padrão das listas (`src/components/list`): Status (bolinha animada com tooltip),
  Nome + descrição truncada, Ambiente (badge).
- Ações por linha: **Testar conexão**, **Debug** (desabilitado com motivo quando o debug está
  desligado) e **Editar** (navega para a página da integração).
- Linhas "Em desenvolvimento" (Archflow) no fim, sem ações.

### Página da integração (`/integracoes/[id]`)

- Coluna do formulário: cabeçalho (voltar, nome + status, descrição, última alteração), cartões
  Geral (ambiente, modo debug), Documentação da API, Campos públicos, Campos privados (só com
  segredos), na API interna **Tokens de sistema**, em Crons, Rotinas, e no Go! Sipal o card
  **Sessão Go! Sipal** logo abaixo do cabeçalho.
- Rodapé (`border-t`, `justify-end`): **Desfazer** e **Salvar**, desabilitados sem alterações.
- Com modo debug ligado, o cartão de Logs ocupa a coluna da direita (`sticky`, altura da área
  visível do `<main>` via `useScrollViewportHeight`). Abaixo de `xl` vai para baixo do formulário.
- **Abas** (`components/tabs/`: `IntegrationTabs` + `useIntegrationTab`, copiados do Orquestrador
  WhatsApp do CRM): aba ativa na URL (`?aba=`, padrão omitida), troca animada (`tabMotionProps`) e
  "Descartar alterações?" ao sair de uma aba com mudanças. Usadas pelo GitHub (`GithubEditorForm`:
  Geral, Vínculos, Mapeamento, Pessoas, Sincronização) e por Provedores de IA (`AiEditorForm`:
  Provedores, Entender tarefas, Desenvolvimento agêntico) e pela página da central de
  desenvolvimento (`/integracoes/ia/centrais/[id]`).
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
  - **Go! Sipal**: `GET /api/auth/me` com o JWT; amarelo sem perfil de desenvolvedor ou perto de
    expirar (ver `modules/go-sipal.md`).
  - **GitHub**: `GET /user` e `GET /rate_limit`; amarelo sem escopo `repo` (token clássico) ou com
    o limite de uso quase esgotado (ver `modules/github.md`).
  - **OpenCode / Gemini / Provedores de IA**: ver `modules/ai.md`.
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

### Crons e agendador interno

- Motor: `src/features/integrations/scheduler/cron-scheduler.ts` (`runSchedulerTick`). O
  `src/instrumentation.ts` inicia `startCronScheduler()` (tick por `setInterval` a cada minuto) —
  o app roda só em processo Node persistente (local ou Docker); **não há variante Vercel**.
- `GET/POST /api/routines/scheduler-tick` executa o mesmo motor sob demanda (ex.: cron do
  sistema), com `Bearer` igual ao `CRON_SECRET` do ambiente **ou** ao cron secret da integração.
- **Rotinas internas são do código** (`DEFAULT_CRON_JOBS`; `withBuiltInJobs` completa a lista
  salva). Hoje: `integrations-health-check` (a cada 5 min, testa todas as integrações) e
  `go-sipal-task-sync` (a cada 1 min, avisa a tela de Tarefas quando o quadro do Go! Sipal muda —
  ver `modules/tasks.md`) e `github-issue-sync` (a cada 2 min, issues dos repositórios vinculados →
  rascunhos — ver `modules/github.md`) e `agentic-pr-watch` (a cada 2 min, acompanha os PRs das
  mesas de trabalho — ver `modules/agentic-dev.md`). O agendamento das internas é editável na tela; só não se
  removem.
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
  Hoje documenta `GET /api/v1/whoami` (confere o token; 200/401).
- **Documentação gerenciada**: `managedSwaggerPath` fixa a `swaggerUrl` em
  `getInternalBaseUrl() + /api/openapi.json`; somente leitura (PATCH → 400).
- Rotas públicas só de contrato: `GET /api/openapi.json` e `GET /api/docs` (Swagger UI).
- **Tokens de sistema** (`src/features/integrations/api-tokens/`, coleção `api_tokens`): card
  `ApiTokensCard` gera (nome; o valor `mt_sys_…` aparece **uma única vez**, `ApiTokenDialog`) e
  revoga (confirmação; não volta). Banco guarda só o hash SHA-256 e o prefixo visível; "último uso"
  atualizado no máximo a cada 5 min. Criar/revogar são auditados (`TokenApiInterna`).
- Endpoint público novo: rota com `withRoute` + `requireApiToken(req)` (401
  `UNAUTHENTICATED`), documentada na especificação e em `PUBLIC_TOKEN_ROUTES` **no mesmo commit**.

### Planejado (em desenvolvimento)

- **Archflow**: plataforma de arquitetura para solicitar deploys em QA e PRD.

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
| `DELETE /api/integrations/internal_api/tokens/[tokenId]` | Revoga token de sistema |
| `GET /api/openapi.json` · `GET /api/docs` | Especificação e Swagger UI da API interna (públicas) |
| `GET /api/v1/whoami` | Pública por token de sistema |
| `/api/integrations/go_sipal/session[/code\|/verify]` | Sessão do Go! Sipal (ver `modules/go-sipal.md`) |
| `/api/integrations/github/*` | Vínculos, mapeamento, pessoas, sincronização e opções (ver `modules/github.md`) |
| `GET/POST /api/routines/scheduler-tick` | Tick do agendador (Bearer `CRON_SECRET` ou cron secret) |
| `POST /api/pusher/auth` | Autoriza `private-app` e `private-integration-{id}` |

## Consumidores

- Pusher: `src/lib/pusher/server.ts` (`getPusherServer`), publicação em
  `src/lib/pusher/channels.ts` (`publishAppEvent`, **somente servidor**). Hooks de cliente importam
  nomes de canais de `src/lib/pusher/channel-names.ts` (módulo puro). O teste
  `__tests__/app/client-bundle-boundary.test.ts` falha se um arquivo `"use client"` alcançar
  Mongoose, banco, Pino, Pusher servidor ou `node:*`.

## Testes

`__tests__/lib/integrations/*`, `__tests__/features/integrations/*`,
`__tests__/features/public-api/public-api-openapi.test.ts` e
`__tests__/lib/pusher/channel-auth.test.ts`. O setup do Vitest faz mock de
`@/lib/integrations/store` (store vazio → todos leem o `.env`).
