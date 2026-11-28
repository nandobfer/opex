# Módulo: Integrações (Sistema › Integrações)

A central de Integrações vem da biblioteca pública **`@nandobfer/integracoes`** (repositório
`nandobfer/integracoes`, cópia local `~/code/integracoes`, OPE-212), a mesma usada pelo Zaturno CRM e pelo
dndicas. O Opex só **registra** as integrações e **injeta** os serviços dele: a lista, a página de cada
integração, os campos, os segredos cifrados, o teste de conexão, o debug ao vivo, o explorador OpenAPI,
o agendador e as rotas HTTP são da biblioteca. Sem permissões (app de uso pessoal): toda ação é do
dono. Valores que antes viviam no `.env` são persistidos no MongoDB.

## Features

### Biblioteca, registro e adaptadores (OPE-212)

- **Dependência**: `"@nandobfer/integracoes": "github:nandobfer/integracoes#vX.Y.Z"` (tag imutável; o
  `dist/` é versionado, sem token nem registry). O `globals.css` tem `@source` do `dist` e o
  `vitest.config.ts` põe a biblioteca em `server.deps.inline`. O `dist` não tem bundle (um arquivo por
  módulo) e cada módulo sai também em `@nandobfer/integracoes/modules/<caminho>` (ex.:
  `modules/integrations/ia/ai/stream`): o código do Opex importa daí o que precisa e os testes fazem
  `vi.mock` desse módulo (vale também dentro da biblioteca).
- **Contrato único de adaptador** (três partes ligadas pelo `id`): definição pura (`defineIntegration`),
  servidor (`defineIntegrationServer`: teste, rotas, rotinas, `onEnable`, explorador, filhos dinâmicos) e
  cliente (`defineIntegrationClient`: formulário, cards, abas, páginas próprias). Termos: integração,
  adaptador e extensão.
- **Registro do Opex** (ponto único, `src/features/integrations/registry/`):
  - `definitions.ts` (puro): a lista ordenada (`OPEX_INTEGRATIONS`), `integrationsRegistry`,
    `INTEGRATION_IDS`/`IntegrationId`, `getIntegrationDef`, `integrationPath`, `INTEGRATIONS`,
    `IN_DEVELOPMENT_INTEGRATIONS`, `KEY_RING_INTEGRATION_IDS` e a configuração da camada de IA
    (`configureIa`: nome do app, rótulos das origens de consumo, aviso do Engramind no chaveiro);
  - `jobs.ts` (puro): as rotinas internas do Opex (`OPEX_CRON_JOBS`, com as capacidades `scope`,
    `retentionDays` e `integration` declaradas por rotina e os textos de ajuda), `DEFAULT_CRON_JOBS`,
    `cronJobIntegration`, `retentionHelp`;
  - `server.ts`: as partes de servidor (`OPEX_SERVER_ADAPTERS`); `client.tsx`: as partes de cliente
    (`OPEX_CLIENT_ADAPTERS`) e o `OpexIntegrationsProvider` (montado no `app/layout.tsx`);
  - `config-map.ts`: `IntegrationConfigMap` (valores resolvidos tipados por id).
- **Comuns da biblioteca**: Pusher, API interna, Crons, GitHub, Inteligência Artificial (hub, 8 provedores,
  provedores customizados, PTAX e models.dev), SMTP, Storage S3 e Gotenberg (PDF) (OPE-217, lib `v0.5.0`). **Do Opex**
  (`src/features/integrations/adapters/`): Clientes (`orcamentos`), Builder Machine, Engramind, Evolution API e Google Drive (em
  desenvolvimento); e as **extensões** das comuns: rotas do GitHub (vínculos, mapeamento, sincronização),
  tokens e escopos da API interna, todas as rotinas do Opex nos Crons (abas **Jobs** e **Observações** do
  Agente Opex) e as abas de agentes e do OpenCode na IA.
- **Runtime** (`src/lib/integrations/runtime.ts`, só servidor): `createIntegrationsServer` com banco
  (`dbConnect`), cofre (`INTEGRATIONS_ENCRYPTION_KEY`, `src/lib/crypto/secretBox.ts`), auditoria
  (`recordAudit`), Pino, Pusher (`publishAppEvent`), o dono como ator, `after()` do Next e a guarda da
  prévia (`isPreviewInstance` desliga o agendador). Exporta `integrations`, `getIntegration` e
  `getIntegrationConfig` tipados. O `instrumentation.ts` importa o agendador (que importa o runtime) no
  boot; o servidor também importa pelas fachadas `src/lib/integrations/server.ts` (todo o
  `@nandobfer/integracoes/server`) e `src/lib/integrations/scheduler.ts`. `src/lib/pusher/server.ts`,
  `src/lib/email/mailer.ts` e `src/lib/storage/s3.ts` são fachadas finas dos clientes da biblioteca.
- **Persistência** (lib ≥ 0.4.0): a central grava e lê só pela `persistence` injetada (`configs`, `keyRing`,
  `statuses`, `logs`, `cronStates`, `apiTokens`). O Opex usa o padrão, o adaptador Mongoose da biblioteca
  (`mongoosePersistence`), nas coleções de sempre (`integration_configs`, `integration_statuses`, `integration_logs`,
  `integration_cron_jobs`, `api_tokens`). Nos testes (`OPEX_INTEGRATIONS_STORE=memory`), `extendPersistence` troca só a
  leitura das configurações (vazia) e delega o resto. Os dados de IA usam os modelos Mongoose da biblioteca
  (`configureIaServer({ models })` os trocaria).
- **Ícone e ordem** (`icon`, `order`) são opcionais no contrato da definição; o Opex não declara nenhum, então a lista
  segue a ordem do registro e mostra só o nome.
- **Rotas catch-all** (despacho pelo registro; as rotas estáticas antigas saíram para não sombrear):
  `src/app/api/integrations/[[...path]]`, `src/app/api/ai/[...path]`, `src/app/api/opencode/[...path]` e
  `src/app/api/command-code/[...path]`. URLs, métodos, corpos e status são os de antes. O ponto de montagem
  `integrations` usa o catch-all **opcional** (`[[...path]]`) porque a raiz `GET /api/integrations` é a lista da
  central (o obrigatório exige um segmento e a raiz cairia fora dele). Os demais usam `[...path]`, sem rota na raiz,
  para não sombrear as rotas estáticas do app sob o mesmo prefixo. Regra para ponto de montagem novo: rota de caminho
  vazio exige `[[...path]]`; sem ela, `[...path]` (`__tests__/app/integrations-catch-all-files.test.ts`). As rotas do
  OpenCode de sessão (`/api/ai/providers/opencode/{accounts,resources,service,...}`), das features de IA
  (`/api/ai/features/*`) e das memórias continuam rotas do Opex.
- **Página catch-all** `src/app/(app)/integracoes/[[...slug]]/page.tsx`: `integrationsRegistry.match(slug)`
  resolve a lista, a página de cada integração (`/integracoes/<id>` ou o caminho próprio), as páginas
  próprias dos adaptadores (`ia/centrais/:id`, `clientes/:clientId`), os caminhos legados
  (`/integracoes/orcamentos` → `/integracoes/clientes`) e o redirecionamento de `/integracoes/<id>` de quem
  tem caminho próprio; o resto é 404. `/integracoes/ia/custom-<slug>` é resolvido no navegador.
- **Dados**: mesmas coleções (`integration_configs`, `integration_statuses`, `integration_logs`,
  `integration_cron_jobs`, `api_tokens` e as de IA), mesmos campos, cifra e ids, mesmos canais e eventos
  Pusher. A única coleção nova é `ai_custom_providers`. Os modelos vêm de `@nandobfer/integracoes/mongoose`.
- **Integrações-filhas** (`parent`): somem da lista e aparecem dentro da página da mãe.
- **Em desenvolvimento** (`status: "in-development"`): `google_drive` (fonte de tarefas a partir de
  planilhas do Google Sheets), na lista com o selo, sem ações nem página.
- ⚠️ **Sem `.env` para integrações novas**: só as herdadas do CRM (Pusher, Crons) têm `env` legado.
- **Ambiente** (`interno`/`externo`) é campo editável; a definição traz só o padrão.
- **Resolvedor** (biblioteca): precedência por campo banco → `.env` legado → padrão; segredo limpo pela
  tela (`null`) **não** volta ao `.env`; segredo que não decifra vai para `secretErrors` e cai no `.env`.
  Cache de 30 s por instância; salvar invalida a instância atual. `isIntegrationConfigured` considera os
  campos condicionais e o chaveiro.
- **Migração** `seed-integrations-from-env` (roda no boot): cria cada documento com `$setOnInsert`.

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

- **Campo de chaveiro** (`keyRing: true`, OPE-155): o segredo vem da **chave principal** de um chaveiro de
  chaves nomeadas (`apiKeys` + `activeApiKeyId` no documento da integração), não de `secretValues`.
  Desde a OPE-179 várias chaves ficam **em uso** (`selectedApiKeyIds`, lido por `selectedApiKeysOf`, sempre
  com a principal) e os clientes de IA revezam entre elas por geração, trocando de chave em 401/402/403/429;
  o valor resolvido da integração (`values.apiKey`) continua sendo só a principal.
  Hoje é o `apiKey` de `ai_gemini`, `ai_anthropic`, `ai_openai`, `ai_deepseek`, `ai_opencode_go` (OPE-156) e `ai_jev`
  (`KEY_RING_INTEGRATION_IDS`, `src/lib/integrations/key-ring.ts`). O PATCH genérico recusa gravar ou
  limpar esse campo e o card "Campos privados" não o mostra; a gestão fica nas rotas de chaves
  (`modules/ai.md`, "Chaves de API").
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
  com tooltip), Nome + badges (**origem do adaptador** e "Não configurado"), descrição truncada e um chevron. **O
  card inteiro é um link** para a página da integração (`integrationPath`) — não há mais botão
  "Editar".
- **Badge de origem** (`SourceBadge`, OPE-212): **"Biblioteca"** (`bg-primary/15 text-primary`) quando o
  adaptador vem da `@nandobfer/integracoes` e **"Próprio"** (`bg-muted text-muted-foreground`) quando existe só
  no Opex. A origem vem da definição (`source`: as da biblioteca saem com `library`; as criadas com
  `defineIntegration` no Opex valem `app`) e chega na lista como `IntegrationListItemDto.source`. Estender uma
  definição da biblioteca (`extendDefinition`, ex.: o GitHub com `commentOnCreate`) mantém "Biblioteca". No
  Opex são "Próprio": Clientes (`orcamentos`), Builder Machine, Engramind, Evolution API e Google Drive (a
  Gotenberg é "Biblioteca" desde a OPE-217).
- Ações por card (fora do link): **Testar conexão** e **Debug** (sempre disponível: o debug é sempre ativo).
- Cards "Em desenvolvimento" (Google Drive) no fim, sem ações.
- Peças compartilhadas com o submenu da sidebar: `useTopLevelIntegrations` (lista sem as filhas, na
  ordem da API, com o status ao vivo), `IntegrationRowActions` (Testar conexão e Debug) e `IntegrationActionDialogs` + `useIntegrationActionDialogs` (os dois diálogos).

### Submenu de Integrações na sidebar (OPE-120)

"Integrações" é um item próprio do menu do dono (fora do grupo Configurações, que ficou só com
Ambientes). Com a barra recolhida (desktop), o **clique navega para `/integracoes`** e **passar o
mouse** abre um submenu à direita (`IntegrationsSidebarItem`, em
`src/features/integrations/components/sidebar/`, montado pelo `AppLayoutShell` via
`itemPanels.integrations`; comportamento do painel em `modules/layout.md`).

- Lista as mesmas integrações da página, **na mesma ordem**, sem as filhas (provedores de IA) e sem as
  "Em desenvolvimento" (não têm status, teste nem debug).
- Cada linha: bolinha de status (`IntegrationStatusDot`) e nome formam um **link para a página da
  integração** (`integrationPath`, a linha inteira menos os botões); à direita, os botões **Testar
  conexão** e **Debug** (`IntegrationRowActions size="sm"`), com a mesma ação da página. A integração
  da rota atual fica marcada (`aria-current`).
- Testar/Debug fecham o submenu e abrem os mesmos diálogos da página, montados fora do painel.
- A consulta (`useIntegrations`, mesmo cache da página) e as assinaturas do status ao vivo só existem
  com o submenu aberto: a sidebar não faz polling nem assina os canais em todas as telas. Estados:
  skeleton no formato das linhas (constantes em `integrations-nav-layout.ts`), erro com "Tentar
  novamente" e vazio com atalho para `/integracoes`.
- Na gaveta do celular não há submenu: "Integrações" é só um link.

### Página da integração (`/integracoes/[id]`)

- Coluna do formulário: cabeçalho (voltar, nome + status, descrição, última alteração), cartões
  Documentação da API, Campos públicos, Campos privados (só com segredos), na API interna **Tokens de
  sistema**. Não há escolha de ambiente (Interno/Externo) nem switch de modo debug (OPE-212).
- Rodapé (`border-t`, `justify-end`): **Desfazer** e **Salvar**, desabilitados sem alterações.
- **Logs de debug sob demanda (OPE-169)**: o cabeçalho mostra sempre, à direita do título, um botão de
  ícone de debug (`DebugToggleButton`, "Abrir/Fechar logs de debug", `aria-expanded` + `aria-controls`
  apontando para a coluna). O botão é um liga/desliga só de visualização: nada é salvo.
  - Os componentes do terminal são compartilhados com o debug dos plugins (OPE-172): `DebugLogConsole`
    (+ `useDebugTerminal`), `useDebugLogStream`, `DebugLogsPanel`, `DebugLogsDialog` e
    `DebugToggleIconButton`. `IntegrationDebugConsole`, `LogsPanel`, `IntegrationDebugDialog` e
    `DebugToggleButton` são os adaptadores da integração (mesmo comportamento de antes).
  - Estado no `IntegrationEditor` (`debugOpen`), entregue ao `DetailHeader` de todos os formulários
    pelo contexto `IntegrationDebugToggleProvider` (`detail/debug-toggle-context.tsx`). Começa
    **fechado** ao entrar ou trocar de integração.
  - A partir de `xl`, abre o cartão de Logs na coluna da direita (`sticky`, altura da área visível do
    `<main>` via `useScrollViewportHeight`); a grade só ganha duas colunas com ela aberta. A barra do
    console tem sempre **Fechar** (X, `DebugConsoleCloseButton`, o mesmo da janela da lista). Fechar
    maximizado devolve a tela ao normal (`useLogsMaximized(colunaAberta)`).
  - Abaixo de `xl` (`DEBUG_DIALOG_MEDIA_QUERY`), por decisão do dono, o botão abre os logs na mesma
    janela da lista de integrações (`IntegrationDebugDialog`, sem Maximizar); fechar a janela volta o
    botão para fechado.
- **Abas** (`components/tabs/`: `IntegrationTabs` + `useIntegrationTab`, copiados do Orquestrador
  WhatsApp do CRM): aba ativa na URL (`?aba=`, padrão omitida), troca animada (`tabMotionProps`) e
  "Descartar alterações?" ao sair de uma aba com mudanças. Usadas pelo GitHub (`GithubEditorForm`:
  Geral, Vínculos, Mapeamento, Sincronização), Inteligência Artificial (`AiEditorForm`:
  Provedores e uma aba por agente, na ordem do catálogo de agentes — ver `modules/ai.md`), página de
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
- Testers (o `tester` de cada adaptador de servidor; os das comuns são da biblioteca e os do Opex ficam em `src/features/integrations/adapters/`):
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

### Debug (sempre ativo)

- Não existe modo debug a ligar (OPE-212): `integrationDebug(id)` (`@nandobfer/integracoes/modules/server/debug`)
  e `debugFetch(...)` registram **todo** evento de toda integração. Cada evento vai para o console do servidor,
  para `integration_logs` (TTL 48 h) e para o Pusher `private-integration-{id}`, evento `debug-log`, agrupado a
  cada 500 ms.
- Os campos `environment` e `debugMode` dos documentos de `integration_configs` continuam no banco só por
  compatibilidade (versões anteriores leem o mesmo Mongo): documentos novos gravam `LEGACY_DOC_DEFAULTS` e a
  central não lê nem expõe os dois. O PATCH recusa `environment` e `debugMode`.
- Segredos e chaves sensíveis (`password`, `token`, `authorization`...) são mascarados.
- O **Pusher não retransmite os próprios logs** (recursão).
- Painel/modal **Logs** com busca (`DebugSearchBar` + `@xterm/addon-search`: Enter/Shift+Enter,
  ↑/↓, contador, Esc limpa), Maximizar/Restaurar só no painel do formulário
  (`useMaximizedFrame`, em `src/hooks/`), Atualizar (`GET /api/integrations/[id]/logs?after=`) e Testar conexão
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

- Motor: agendador da biblioteca (`runSchedulerTick`, pela fachada `src/lib/integrations/scheduler.ts`). Os executores das
  rotinas são declarados nos adaptadores (`jobs`; os do Opex em `adapters/crons.server.ts`) e os ganchos do fim do tick
  em `OPEX_SCHEDULER_TICK_HOOKS`. O `src/instrumentation.ts` inicia `startCronScheduler()` (tick por `setInterval` a cada minuto) —
  o app roda só em processo Node persistente (local ou Docker); **não há variante Vercel**.
- No fim de cada tick, depois dos jobs do Agente Opex, da saúde do Docker local e dos ambientes, roda
  `runDueRoutineAgents` (agentes rotineiros: disparos agendados, retomadas das hibernadas, fila, turnos
  interrompidos e expirações — `modules/routine-agents.md`).
- `GET/POST /api/routines/scheduler-tick` executa o mesmo motor sob demanda (ex.: cron do
  sistema), com `Bearer` igual ao `CRON_SECRET` do ambiente **ou** ao cron secret da integração.
- **Guarda de prévia (OPE-147)**: a prévia do Opex (mesa publicada pelo `/desenvolvimento`) usa o banco
  do Opex original. Com a marcação `OPEX_PREVIEW=1` (`src/lib/instance.ts`, `isPreviewInstance`),
  `startCronScheduler` não liga o tick periódico (registra no log "Agendador automático desligado:
  instância de prévia"), `runSchedulerTick`/`runFastSchedulerTick` devolvem `skipped: "preview"` sem
  reivindicar lease, e o tick sob demanda responde `{ success: true, executed: [], skipped: "preview",
  message }`. Nada roda sozinho na prévia (crons, fila agêntica, PRs, limpezas, rotineiros). O
  **disparo manual** continua: "Executar agora" (`runJobNow`, com o mesmo lease) e o disparo de um
  agente rotineiro rodam no container da prévia. Sem a marcação (`pnpm dev`, produção) o agendador liga
  como sempre. A tela mostra, só na prévia, "Agendador desligado nesta prévia: as rotinas rodam só no
  Opex original." (`PreviewSchedulerNotice`, `GET /api/instance`).
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
  `modules/opex-agent.md`), `agent-usage-daily` (60 min — sincroniza as execuções e as conversas dos
  agentes e gera o resumo diário de uso; a primeira execução faz o backfill retroativo; ver
  `modules/agent-metrics.md`), `opencode-quota-refresh` (5 min — relê a quota do plugin `opencode-quota` no
  host do OpenCode e publica `opencode-quota-updated` só quando muda; ver `modules/opencode-quota.md`),
  `opencode-go-usage-refresh` (5 min, ligada — relê o status da assinatura OpenCode Go no Console e publica
  `opencode-go-usage-updated` só quando os percentuais ou os resets mudam; ver `modules/opencode-quota.md`),
  `command-code-usage-refresh` (5 min, ligada, OPE-190 — relê pela API da CLI do Command Code a conta de cada chave
  em uso e publica `command-code-usage-updated` só quando os percentuais ou os resets mudam; sem chave em uso, não
  chama a API; ver `modules/opencode-quota.md`, "Assinatura Command Code") e
  `builder-machine-cleanup` (diária às 03:00, **nasce desligada**; ligada
  ao ativar a Builder Machine — ver `modules/builder-machine.md`) e `environments-registry-cleanup`
  (diária às 04:00, **nasce desligada** — mantém as últimas tags de cada ambiente no registry; ver
  `modules/environments.md`) e as **limpezas de sessões sem interação** (OPE-106; diárias às 05:00,
  **nascem desligadas**, X = 30 dias): `opencode-sessions-cleanup` (exclui do servidor OpenCode as
  sessões paradas há X dias — inclusive as pessoais do dono —, nunca as vinculadas ao Opex nem as em
  execução; ver `modules/agentic-dev.md`), `opex-agent-sessions-cleanup` e
  `maddox-agent-sessions-cleanup` (arquivam as sessões do agente paradas há X dias e excluem as
  arquivadas há X dias; ver `modules/opex-agent.md`, "Limpeza automática das sessões"). O tick do agendador também chama `runEnvironmentsTick` (retoma deploys
  interrompidos e reabre os repasses das portas dos ambientes no PC).
- **Rotinas de integração ativável** (`INTEGRATION_CRON_JOBS`, `cronJobIntegration`): com a
  integração dona desativada (campo `active`), a rotina some da aba Rotinas (`hiddenJobIds` em
  `CronJobsCard`/`CronJobsEditor`); continua salva e a edição a preserva.
- A rotina `ai-task-tags-concluded` permite persistir
  `scope: "pending" | "all"` no card da rotina ("Só pendentes" / "Todas"), para geração de tags
  de concluídas não arquivadas. O escopo salvo vale tanto para "Executar agora" quanto para o
  agendamento; editar exige salvar antes de executar. Rotinas desativadas não rodam no tick,
  mas podem ser executadas manualmente, inclusive com o agendador desligado.
- As rotinas de limpeza de sessões (`SESSION_CLEANUP_JOB_IDS`, `jobSupportsRetentionDays`) persistem
  `retentionDays` (inteiro de 1 a 3650; mensagens "Dias sem interação: …" no PATCH) no campo
  **"Dias sem interação"** do card (`CronJobExtraFields`, com texto de ajuda da regra de cada rotina).
  O runner lê `jobRetentionDays(job)` (valor salvo válido ou o padrão de 30). Vale para "Executar agora"
  e para o agendamento; editar exige salvar antes de executar.
- Cada rotina é reivindicada atomicamente em `integration_cron_jobs` (lease de 15 min); a
  reivindicação já avança `nextRunAt`. ⚠️ Nunca combine upsert com filtro
  `scheduleSignature: { $ne }` em `syncJobState`.
- Agenda amigável (`@nandobfer/integracoes/modules/core/schedule`, horário de Brasília): intervalo, diário,
  semanal e mensal. Editar o agendamento recalcula na hora (`rescheduleJobs`).
- **Intervalo em segundos** (OPE-145): `{ type: "interval", seconds }` (10 a 3600; `isSecondsSchedule`,
  `intervalMs`), ao lado do formato em minutos, que não muda. Roda no **tick rápido**
  (`runFastSchedulerTick`, `setInterval` de 10 s iniciado junto pelo `startCronScheduler`): mesmo lease no
  Mongo, mas de 60 s (`FAST_JOB_LEASE_MS`), referência na grade de 10 s, sem os ganchos pesados do tick de
  minuto e sem debug a cada execução (só falhas). O tick de minuto ignora essas rotinas; o
  `/api/routines/scheduler-tick` roda os dois. No editor, a unidade "segundos" só aparece nas rotinas
  (`ScheduleEditor allowSeconds`, no `CronJobsEditor`); o agendamento do Engramind recusa segundos.
  Hoje usada por `host-metrics-refresh` (10 s, recursos do servidor — `modules/host-metrics.md`).
- Rotinas **HTTP** chamam `POST {URL interna}{path}` com `Bearer {cron secret}`. URL interna =
  campo "URL base interna" ou `http://127.0.0.1:${PORT}` (padrão 3100).
- **Executar agora** (com confirmação): executa a versão salva, só reivindica o lease
  (`runJobNow`), 404 rotina não salva, 409 em execução, falha da rotina → 200 `ok:false`.
  Auditado (`execucaoManual`, `resultado`, `mensagem`, `duracaoMs`).
- **Página em abas** (`CronsEditorForm`): **Geral** (agendador, URL base interna, cron secret e
  documentação), **Rotinas** (lista), **Jobs** (`OpexJobsTab`: prompts agendados do Agente Opex, do
  dono e dos usuários do portal — ver `modules/opex-agent.md`, "Jobs"; sempre presente) e **Observações**
  (`OpexWatchesTab`, `?aba=observacoes`, OPE-194: eventos que o Agente Opex observa para acordar — ver
  `modules/opex-agent.md`, "Observação de eventos"; sempre presente).
- Depois dos jobs, o tick roda as **observações do Agente Opex** (`runDueOpexWatches`, import dinâmico): vencidas,
  entregas perdidas e as disparadas pendentes (inclusive as reservadas por uma prévia do Opex).
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
  `engramind` usa a URL base do campo `baseUrl` e injeta `Authorization: Bearer` com o token admin
  (campo privado), só no servidor.
- **Documentação padrão do serviço** (`defaultSwagger` no catálogo: campo público com a URL base +
  caminho, via `defaultSwaggerUrl`): vale enquanto o dono não salvar outra URL e o campo continua
  editável (Engramind: `<baseUrl>/openapi.json`).

### API interna — documentação e tokens de sistema

- **Especificação gerada no código** (`src/features/public-api/openapi/spec.ts`,
  `buildPublicApiSpec`): OpenAPI 3.1, versão do `package.json`, `servers: ["/"]`, esquema
  `apiToken` (Bearer). Corpos/respostas vêm dos schemas Zod (`src/features/public-api/schemas.ts`).
  Hoje documenta `GET /api/v1/whoami` (confere o token; 200/401), `POST /api/v1/routine-agents/{id}/runs`
  (webhook dos agentes rotineiros; parâmetro `id`, corpo `{ request?, payload? }`, 201/400/401/403/404/409 —
  ver `modules/routine-agents.md`) e o **servidor MCP do Opex usado
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
  | `api:v1:routine-agents` | Webhook externo dos agentes rotineiros: `POST /api/v1/routine-agents/{id}/runs` (OPE-130, `ROUTINE_AGENTS_API_SCOPE`) |
  | `mcp:owner` | O MCP do dono (`initialize`/`ping`/`tools/list`) e o grupo Contexto |
  | `mcp:owner:tool:*` | Todas as ferramentas do dono (dinâmico: ferramenta nova entra sozinha) |
  | `mcp:owner:group:<grupo>` | Um grupo (dinâmico; ex.: `mcp:owner:group:appearance`, as cores favoritas — que não pedem confirmação, então não exigem `mcp:owner:destructive`) |
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
  - **Fora do token**: o grupo `files` (arquivos do chat dependem de uma conversa do Maddox) e o
    grupo `http` (Chamada HTTP sem bloqueio de rede, OPE-130: faria do Opex um proxy aberto da rede
    interna) — `MADDOX_TOKEN_EXCLUDED_GROUPS` —, além dos jobs (já fora do Maddox).
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
`/api/engramind/**` (mais `/api/engramind/providers/from-opex[/test|/resend]`, a "IA do Opex"). Gravar
ou apagar a chave de `ai_gemini`, `ai_anthropic`, `ai_openai` ou `ai_deepseek` em `updateIntegration`
agenda (`runAfterResponse` + import dinâmico, sem ciclo) o reenvio da chave ao Engramind
(`syncEngramindProviderKey`), que nunca derruba o salvamento. O **webhook** `POST /api/engramind/webhook` é público e autenticado só pela
assinatura HMAC (não é token de sistema). Componentes compartilhados nascidos aqui: `InfoTooltip`
(`src/components/ui/info-tooltip.tsx`) e `SecretReveal` (`src/components/ui/secret-reveal.tsx`, usado
também pelo `ApiTokenReveal`). Detalhes em `modules/engramind.md`.

### Evolution API

Integração `evolution-api` (OPE-192, interno, sem `env`): WhatsApp pela Evolution API. Pré-preenchimento pelo
ambiente `evolution-api` sem expor a chave, instância com pareamento por QR code ou código, webhook público
`POST /api/evolution/webhook` autenticado só pelo header `x-opex-webhook-secret` (não é token de sistema),
operações e aba Debug. A rotina interna `engramind-pending-writes` (1 min) entrou nos Crons padrão com a fila de
pendências do Engramind. Detalhes em `modules/evolution-api.md` e `modules/secretary-agent.md`.

### Custos de IA: PTAX e models.dev (OPE-203)

Duas integrações públicas, sem credencial (externo, sem `env`), usadas pelo custo de tabela e pelo custo efetivo dos
agentes rotineiros (`modules/ai.md`, "Plano de cobrança" e "Custo de tabela"):

- **Cotação do dólar (PTAX)** (`fx_ptax`): campo `baseUrl` (padrão: serviço OData Olinda do Banco Central). A PTAX de
  **venda** de `CotacaoDolarPeriodo` é gravada por dia corrido em `fx_rates_daily` (fim de semana e feriado herdam o
  último dia útil; hoje só é gravado com a cotação do próprio dia, publicada à tarde — até lá a tela usa a última
  conhecida sem gravar). Rotina **`fx-ptax-daily`** (3 h, ligada) preenche os últimos 45 dias que faltam; a leitura das
  telas pede o preenchimento em segundo plano quando falta um dia. Tester: lê os últimos 10 dias.
- **Preços de modelos (models.dev)** (`models_dev`): campo `apiUrl` (padrão `https://models.dev/api.json`); só os
  preços de Anthropic, OpenAI e Gemini (`google`) ficam em memória (6 h) e a última cópia boa em `ai_price_catalogs`.
  Tester: relê o catálogo (falha se só houver a cópia antiga).
- Rotina **`ai-subscription-days`** (30 min, ligada): grava em `ai_subscription_days` o uso total diário das chaves com
  plano de Assinatura do OpenCode Go (custo por dia do Console, ~40 dias) e do Command Code (créditos por dia do ciclo
  atual), agrupadas por assinatura. As duas rotinas publicam `ai-billing-updated` (`{ kind: "fx" | "subscription-days" }`)
  em `private-app` quando gravam dado novo.
- `ai_deepseek` ganhou o campo público **"Feriados fora de pico"** (`offPeakHolidays`, textarea), lido pela tabela do
  DeepSeek.

### Gotenberg (PDF) (OPE-210, adaptador da biblioteca desde a OPE-217)

Integração `gotenberg` (interno, sem `env`, sem segredos; `gotenbergIntegration`/`gotenbergServer` de
`@nandobfer/integracoes/gotenberg[/server]`, com o Opex injetando só a descrição e os textos do campo URL): conversão de HTML em PDF e PNG dos documentos dos agentes
pelo Gotenberg compartilhado no host (rede `gotenberg-network`). Campos: `url` (URL interna, `http://gotenberg:3000`),
`timeoutSeconds` (30 s), `urlTtlMinutes` (validade padrão das URLs dos documentos, 15 min) e `urlTtlMaxMinutes`
(validade máxima, 60 min; abaixo da padrão vale a menor, `gotenbergUrlTtlMinutes`). Tester: `GET /health` (Gotenberg e
Chromium `up`) e conversão de um HTML mínimo em PDF dentro do `timeoutSeconds` (confere o `%PDF`); URL ausente,
rede inalcançável, tempo esgotado, Chromium indisponível e conversão recusada voltam como falha com mensagem em pt-BR.
O id e as chaves são os de antes: a configuração salva continua valendo, sem migração. Debug sem o conteúdo do HTML. Detalhes em `modules/agent-documents.md`.

### Planejado (em desenvolvimento)

- **Google Drive**: fonte de tarefas a partir de planilhas do Google Sheets.

## APIs

Todas as rotas abaixo de `/api/integrations` são atendidas pelo catch-all (`[...path]`) da biblioteca.

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

- Biblioteca: o núcleo (resolvedor, cofre, serviço, teste de conexão, agendador, roteador, IA e
  provedores customizados) é testado no repositório `nandobfer/integracoes`, inclusive os testes que
  vieram do Opex.
- Opex: `__tests__/app/ai-integration-pages.test.tsx` (página catch-all), `__tests__/features/integrations/*`,
  `__tests__/lib/integrations/*`, `__tests__/lib/email/mailer.test.ts`, `__tests__/lib/storage/*` e os de
  cada adaptador. Helpers: `__tests__/helpers/integrations-render.tsx` (render dentro do
  `IntegrationsProvider` com o registro do Opex), `integrations-route.ts` (`legacyRoute`: handlers com a
  assinatura antiga chamando os catch-alls), `opex-editors.ts` (formulário como o Opex registra) e
  `opex-testers.ts` (teste de conexão de cada adaptador).
- O setup define `OPEX_INTEGRATIONS_STORE=memory` (nenhuma configuração salva nem provedor customizado:
  tudo resolve pelo `.env` e pelos padrões) e liga o runtime antes de cada caso quando o teste alcança o
  servidor da biblioteca.
