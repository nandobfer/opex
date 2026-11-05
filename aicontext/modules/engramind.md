# Módulo: Engramind (`src/features/engramind/`)

O **Engramind** (contrato documentado aqui: o da 0.11.0, `docs/openapi.json` do repositório `nandobfer/engramind`; a versão em execução vem de `GET /v1/status`; instalado em `/home/engramind`) é uma rede
de memórias para agentes de IA: um serviço Rust separado do Opex (SQLite + FTS5, backup contínuo
pelo Litestream, Redator por LLM, embeddings locais ou remotos, webhooks) que guarda fatos curtos em
**canais** e os entrega por REST, MCP e CLI. O Opex é o **gestor** da rede: configura o serviço,
administra apps, agentes, tokens, canais, assinaturas e memórias e acompanha a operação.

Desde a OPE-104 o Engramind é a **fonte única das memórias dos agentes** do Opex (Agente Opex, Agente
Maddox, Agente Adversário e agente desenvolvedor das centrais): ver "Memórias dos agentes" abaixo. A
coleção antiga `agent_memories` fica intacta, lida só pelo backup da migração.

## Integração `engramind` (`/integracoes/engramind`)

- **Catálogo** (`src/lib/integrations/catalog.ts`): ambiente `externo`, `streamsDebugOverPusher`, sem
  `env`. Públicos, todos `group: "card"` (fora do detalhe e do PATCH genérico, para o card Geral não
  regravar URLs antigas): `baseUrl` (URL que o **servidor** do Opex alcança), `opexPublicUrl` (URL que o
  Engramind alcança para os webhooks) e `environmentId`. Salvar a conexão ou repetir o bootstrap
  invalida também o detalhe e a lista de `/integracoes`. Privados: `adminToken` e
  `webhookSecret` (`group: "card"`, gerado pelo Opex, nunca exibido). Tudo é gravado pela aba Conexão
  (`PUT /api/engramind/connection`), que chama o `updateIntegration` central (cifra e audita).
- **Cliente HTTP** (`server/client.ts`, só servidor): Bearer com o token privado, `User-Agent:
  opex/<versão>`, `Idempotency-Key` em toda mutação (fixa na importação), `debugFetch` mascarado e
  corpo com segredo enviado como `Blob` (o debug só registra corpos em texto). Erros do envelope
  `{ error: { code, details } }` viram `DomainError` com mensagem pt-BR (`server/errors.ts`, decide pelo
  `code`; `LAST_ADMIN_TOKEN` → "Emita outro token admin antes", `CATEGORY_IN_USE` com a contagem,
  `RATE_LIMITED` com `Retry-After`...). O `401` do Engramind vira `409 ENGRAMIND_AUTH_INVALID` no Opex
  (a sessão do dono continua válida); fora do ar → `503 ENGRAMIND_UNREACHABLE`; sem conexão →
  `409 ENGRAMIND_NOT_CONFIGURED`. Desde a 0.10.0: `422 PROVIDER_REJECTED` (o provedor recusou: chave,
  modelo ou parâmetro) mostra `details.reason` — o status e a mensagem do provedor — e, quando o motivo
  cita `temperature`, a dica "Deixe a Temperatura vazia"; `502 PROVIDER_FAILED` fica só para
  indisponibilidade/resposta inválida; `409 EMBEDDING_MODEL_LOADING` diz o modelo, se está baixando ou
  carregando e há quanto tempo. **5xx escondido pelo proxy**: o Engramind fica atrás do Cloudflare,
  que troca o corpo das respostas 5xx pela própria página; sem o envelope e com a página/JSON do
  Cloudflare (`ray_id`, `error_name`), o erro vira `502 ENGRAMIND_PROXY_MASKED` apontando Operação ›
  Chamadas ao LLM (`llm_calls.error` traz o motivo real) em vez de "respondeu HTTP 502".
- **O navegador nunca chama o Engramind** (CORS fechado): tudo passa por `/api/engramind/**`.

### Bootstrap (`server/bootstrap.ts`)

Ao salvar a conexão (token novo, URL trocada ou sem segredo de webhook):

1. `GET /v1/whoami`. Token que não é `admin` `read+write+delete` → passo `whoami` falha ("Reconfigure o token").
2. Token do app `bootstrap`: cria o app `opex` ("Opex") ou reaproveita o existente; emite um token
   `admin` `read+write+delete` "Opex"; **grava o token novo**; só então revoga o de bootstrap (com o
   token novo). O app `bootstrap` fica. Falha ao gravar → o de bootstrap **não** é revogado e o passo
   avisa (revogue o emitido e repita).
3. Webhook: gera o segredo (48 bytes aleatórios, base64), grava cifrado e faz `PATCH /v1/apps/<app do
   token>` com `webhook_url = <URL pública>/api/engramind/webhook`. Já registrado e igual → `skipped`.
4. **Memórias dos agentes** (passo `agent-memories`, `ensureAgentMemoryNetwork` em
   `server/memory-network.ts`), por último, com o token próprio: cria só o que falta (ver "Memórias dos
   agentes › Rede"). Já pronto → `skipped`; falha não desfaz os passos anteriores.
5. Cada passo é auditado (`entidade: "Engramind"`, `entidadeId: "bootstrap"`, sem segredos) e
   logado. A resposta traz os passos (`BootstrapStepDto[]`), mostrados na aba; "Repetir configuração
   automática" (`POST /api/engramind/connection/bootstrap`) é seguro.

### Teste de conexão (`server/tester.ts`)

`GET /health/ready` (o Engramind não tem `/health`) + `whoami`. Vermelho: fora do ar, token inválido,
token que não é admin `read+write+delete`, sem configuração. Amarelo (`warnResult`): token ainda de
bootstrap, webhook não registrado (ou com outra URL), jobs `webhook` `failed`, backup `fail` ou
reindexação `failed`.

### Abas (`EngramindEditorForm`, `?aba=`)

Sem conexão, as abas de Configurações em diante mostram "Configure a conexão"; token inválido ou
insuficiente, "Reconfigure o token" (`QueryBoundary`). Todas têm skeleton, vazio com ação e erro com
"Tentar novamente".

| Aba | Conteúdo |
|---|---|
| Sobre | Resumo do Engramind e tópicos expansíveis (`help/about.ts`, o mesmo do "Saiba mais" de `/engramind`). |
| Conexão (padrão) | URLs, token (só gravado, `SecretValueInput`), Ambiente (seletor com `GET /api/engramind/environments`), passos do bootstrap, estado (`whoami`: token, app, tipo, escopos, operações; webhook: URL, segredo e data), o card Geral (debug) e o card **Documentação da API** (`ApiDocsCard`): campo "Documentação Swagger (OpenAPI)" com padrão `<URL base>/openapi.json` (o contrato publicado pela versão em execução do Engramind, sem token; `defaultSwagger` do catálogo, editável) e **Explorar** (explorador Swagger; o servidor injeta `Authorization: Bearer` com o token admin do Opex, que nunca vai ao navegador — adaptador `engramind` em `openapi/adapters.ts`). |
| Configurações | Todas as chaves de `GET /v1/settings` (menos segredos; as da IA do Opex — `redator.provider/model/fallback_models/base_url` e `embedding.provider/model/dimensions/base_url` — aparecem **somente leitura**: "Edite na aba Provedores" e, nas URLs, "Definida pelo provedor escolhido"), agrupadas (Limites, Categorias, Memória, Contexto, Redator, Embeddings, Busca, Webhooks, Retenção). Cada `SettingField` tem rótulo + tooltip, controle gerado do metadado (número com intervalo, switch, `OptionTabs` até 4 opções, select, texto, chips para listas, `categories.list` reordenável com dnd-kit), padrão, intervalo, última alteração (app) e **Voltar ao padrão** (`null`). Grava só as alteradas (`changedSettings`), tudo ou nada; trocar provedor/modelo/URL/dimensão/prefixo do embedding pede confirmação ("valida o provedor e reindexa"). |
| Provedores | **IA do Opex** no topo (ver abaixo); `redator.api_key` e `embedding.api_key` (Gravar/Apagar; só "Configurada em …"), Testar Redator/embedding (configuração atual ou proposta em JSON, nada é gravado), Listar modelos por provedor (gemini/off desabilitados com tooltip) e Reindexar (confirmação; progresso de `get_status.embedding`, desabilitado durante `reindexing`). |
| Identidades | Apps (criar, editar com webhook, desativar/reativar, excluir), Agentes (idem, com as assinaturas só para leitura) e Tokens (prefixo, dono, tipo, escopos, rótulo, status, expiração, último uso; Emitir com o segredo **uma única vez** + Copiar; Editar; Revogar com confirmação). O token e o app do próprio Opex aparecem marcados ("Este Opex"). A proteção vale também no servidor (proxy e agente, `guardOwnToken` com o `whoami` atual): o token não é revogado, rebaixado nem ganha validade (`expires_at`), e o app não é desativado nem excluído (`409 ENGRAMIND_OWN_TOKEN`). |
| Operação | Status (versão, banco, backup, identidades, fila, Redator, embeddings, webhooks, retenção), Jobs (filtro por tipo/estado, Retentar nos `failed`), Chamadas ao LLM (finalidade, desde), Consumo (agrupamento e período) e Auditoria (entidade, ação e período). Listas paginadas por cursor ("Carregar mais") e virtualizadas acima de 50. |
| Variáveis de ambiente | Ver abaixo. |

### IA do Opex (aba Provedores)

O Redator e o embedding usam os provedores de IA já configurados no Opex, escolhidos **como em
`/integracoes/ia` e nos agentes** (`AiProviderTabs` + `ModelPickerField`, `useAiProviderStatuses` +
`useAiModels`). **Escolher o provedor já define a URL — não há campo de URL em lugar nenhum**
(nem na lista de modelos de embedding). Mapeamento puro em `src/features/engramind/ai-source.ts`:

| Seção | Opção | Engramind | `base_url` | Chave |
|---|---|---|---|---|
| Redator | Gemini / Anthropic | `gemini` / `anthropic` | vazia (oficial) | do Opex |
| Redator | OpenAI / DeepSeek | `openai_compatible` | `OPENAI_API_URL` / `DEEPSEEK_API_URL` (`src/lib/ai/endpoints.ts`) | do Opex |
| Embedding | Local | `local` (lista do próprio Engramind) | vazia | — |
| Embedding | Gemini / OpenAI | `gemini` / `openai_compatible` | vazia / `OPENAI_API_URL` | do Opex |
| Embedding | Desligado | `off` (só busca textual; o modelo não muda) | vazia | — |

- **Redator**: provedor (OpenCode e Jev não aparecem), modelo e **até 5 modelos de reserva** da mesma
  lista (`MultiAutocomplete`; sem repetir nem incluir o principal) e **Temperatura** (0 a 2, passo 0,1,
  `TemperatureInput`; vazia = `null`, que o Engramind não envia ao provedor — obrigatório nos modelos
  que recusam `temperature`, como a família 5.5 da Anthropic; vale para o Redator e a consolidação).
  `redator.temperature` também é somente leitura em Configurações. **Embedding**: provedor, modelo
  (`?kind=embedding` no Gemini/OpenAI; Local pela lista do Engramind) e dimensão opcional (só remotos).
  Trocar de provedor limpa o modelo. Sem variante/raciocínio (o Engramind não tem).
- **Testar com esta chave** (`POST /api/engramind/providers/from-opex/test`): a proposta vai ao
  `redator/test` ou `embedding/test` do Engramind com a chave lida **no servidor**; nada é gravado.
- **Aplicar** (`POST /api/engramind/providers/from-opex`, `applyOpexAiSource`):
  - Redator: grava as configurações (com a URL implícita) e depois `PUT /v1/secrets/redator.api_key`.
    Falha na chave mantém as configurações, grava `syncError` e a tela mostra **Reenviar a chave**.
  - Embedding: pede confirmação ("valida o provedor e reindexa"); recusado com reindexação em
    andamento (`409 ENGRAMIND_REINDEXING`, botão desabilitado). No **Local**, o estado do modelo
    (`get_status.embedding.local`: `idle|downloading|loading|ready|failed`, com tempo e erro) aparece
    na seção e na aba Operação; em `downloading`/`loading`, Testar e Aplicar ficam desabilitados e o
    card relê o estado a cada 3 s até terminar (um 409 `EMBEDDING_MODEL_LOADING` também dispara a
    releitura e aparece como aviso, não como falha); `failed` mostra o erro (nova tentativa 30 s depois). Como o Engramind valida o provedor ao
    trocar, a proposta é testada com a chave, a chave é gravada e só então as configurações (falha na
    chave aborta sem mudar nada). Local e Desligado não enviam segredo.
  - Sem chave no Opex → `409 ENGRAMIND_AI_KEY_MISSING`. Auditoria `ai_source.apply` com seção,
    provedor, modelo, reservas, temperatura e dimensão (nunca a chave); evento `settings.updated`.
- **Origem derivada do valor em uso** (`deriveOrigin`, nunca por flag): `engramind_state.sources`
  guarda o último snapshot aplicado por seção (provedor, modelo, reservas, temperatura, dimensão, `keyVersion`,
  `syncedAt`, `syncError`). "Vem do Opex" quando as chaves da seção batem com o snapshot e a chave do
  Engramind não foi trocada depois da última cópia (`updated_at` do segredo); "Configurado no
  Engramind" quando algo mudou por fora (ferramenta `update_engramind_settings`, CLI, outro admin ou
  chave gravada à mão no card Chaves); "Ainda não aplicado" sem snapshot. Aplicar de novo volta ao Opex.
- **Sincronização automática**: gravar ou apagar a chave de `ai_gemini|ai_anthropic|ai_openai|ai_deepseek`
  agenda `syncEngramindProviderKey` (depois da resposta, import dinâmico): reenvia a chave a **toda
  seção** que usa o provedor; outro provedor, Engramind não configurado ou nenhuma seção → nada (log
  informativo). Chave apagada no Opex → nada é enviado e o card avisa ("A chave do X foi apagada no
  Opex"). Falha no Engramind nunca propaga: vira `syncError` + log de aviso + "Reenviar a chave"
  (`POST /api/engramind/providers/from-opex/resend`). Mudar o modelo no Opex não altera o Redator.
- O container do Engramind precisa alcançar os provedores oficiais (`ollama` e endpoints próprios não
  são configuráveis pela tela). A chave fica cifrada no Engramind (`SECRETS_KEY`).

Listas (jobs, chamadas ao LLM, auditoria, assinantes, histórico da memória) e as configurações do
canal passam pela `QueryBoundary` com skeleton da lista (`ListSkeleton`): um erro do Engramind nunca
aparece como lista vazia — mostra a mensagem com "Tentar novamente" (ou "Reconfigure o token"). Os
formulários de Configurações e de configurações do canal usam `useFormSnapshot`: refazer a consulta
(webhook, reconexão, foco) não descarta o rascunho; só remonta quando o conteúdo muda e não há
alterações pendentes. Com rascunho, aparece "As configurações mudaram fora daqui" com **Recarregar**.

Os formulários validam com os **mesmos schemas Zod** da rota e do agente (`operations.ts`,
`schemas/*`) em tempo real (`useSchemaForm`).

### Tooltips e textos

Tudo que explica algo ganha `InfoTooltip` (`src/components/ui/info-tooltip.tsx`): cada configuração
(`help/settings.ts`; chave nova cai na descrição da API), cada variável (`help/env-vars.ts`), escopos,
combinações, tipos e status de token, modos/acesso/alvo de assinatura, campos de canal e memória
(`help/identities.ts`), jobs, chamadas ao LLM, consumo, status e auditoria (`help/operation.ts`).
Um teste confere a cobertura de todas as chaves e variáveis.

## Variáveis de ambiente (`server/host-env.ts`)

- A instalação é o **Ambiente vinculado** (`environmentId`, módulo Ambientes; adote `/home/engramind`
  se ainda não aparece). Só Ambientes no servidor (PC → `422`). Sem Ambiente → `409
  ENGRAMIND_NO_ENVIRONMENT` (a aba mostra o estado vazio com "Ir para Conexão").
- Tudo roda **no host pelo OpenCode** com o executor do módulo Ambientes (`createHostRunner` com o
  debug da integração; comandos puros em `server/host-env-commands.ts`):
  - **Ler**: `sha256sum` do arquivo real + conteúdo em base64 com `TOKEN_PEPPER`, `SECRETS_KEY`,
    `BOOTSTRAP_ADMIN_TOKEN` e `LITESTREAM_SECRET_ACCESS_KEY` trocados por marcadores **pelo awk no
    host** (`quiet`, sem registrar a saída). O segredo nunca chega ao servidor do Opex.
  - **Gravar** (`PUT /api/engramind/env`, só as alteradas): o Opex monta o arquivo novo preservando
    comentários, ordem e desconhecidas (`env-file.ts`); o host confere o hash lido (diferente → `409`
    "O arquivo mudou; recarregue"), repõe as linhas sensíveis originais e troca o arquivo com
    `mktemp` + `mv` (`umask 077`). A senha do Litestream é "só gravar" (vazia mantém).
  - Editáveis com validação por tipo (`schemas/env.ts`): `APP_ENV`, `APP_HOST`, `APP_PORT`,
    `CONTAINER_NAME`, `DATABASE_PATH`, `MODELS_PATH`, `ORT_DYLIB_PATH`, `READ_POOL_SIZE`,
    `REQUEST_TIMEOUT_SECS`, `MAX_BODY_BYTES`, `MCP_ALLOWED_HOSTS`, `ENGRAMIND_NETWORK`, `S3_NETWORK`,
    `LITESTREAM_ENABLED`, `ENGRAMIND_S3_*`, `LITESTREAM_ACCESS_KEY_ID`, `RUST_LOG`, `LOG_FORMAT`,
    `LOG_ANSI`, `TZ`. Só leitura (configurada/não): `TOKEN_PEPPER`, `SECRETS_KEY`, `BOOTSTRAP_ADMIN_TOKEN`.
  - Avisos: o `docker-compose.yml` do Engramind fixa `APP_HOST`, `DATABASE_PATH` e `MODELS_PATH` e não
    repassa `ORT_DYLIB_PATH` (o valor do `.env` não chega ao container); trocar `APP_PORT`/`APP_HOST`
    pode exigir ajustar a URL base; trocar `APP_PORT` ou `CONTAINER_NAME` recria o projeto.
- **Salvar** só grava e marca "Alterações pendentes de aplicação" (`engramind_state.pendingApply`,
  com os valores anteriores de `APP_PORT`/`CONTAINER_NAME`).
- **Aplicar e reiniciar** (`POST /api/engramind/env/apply` com `{ confirm: true }`; log em
  `POST /api/engramind/env/apply/events`, NDJSON, no xterm `IntegrationConsole`): job desacoplado no
  host (sobrevive a fechar a tela) que lê a imagem do container em execução e roda `API_IMAGE=<atual>
  docker compose --env-file .env -f <arquivos do Ambiente> up -d --no-build --pull never api` (a
  instalação não tem código-fonte: build quebraria). Com a porta ou o container trocados, antes
  `docker compose -p <projeto antigo> down`, e o Ambiente adotado passa a `engramind-<porta>`. No fim,
  confere `GET /health/ready` por até 60 s. Um por vez (`409 ENGRAMIND_APPLY_BUSY`). Se o executor do
  host não responder até o tempo limite + 30 s, a execução termina em `failed` e libera a trava; falha
  na auditoria ou no evento final só vai para o log (nunca derruba o processo).
- Gravar e aplicar são auditados só com os **nomes** das chaves.

## Página `/engramind` — rede "universo de partículas" (OPE-109)

Item "Engramind" em `APP_NAV`, logo abaixo de "Ambientes". Sem a integração configurada: estado vazio
com "Configurar integração". Com ela: a **rede** e, **no fim da página** (OPE-113), o card "O que é o
Engramind" (`AboutCard`, renderizado pela rede depois da área do canvas) com o resumo e as ações:
o seletor **Distribuição da rede** (Órbita/Radial, só na visão inicial: some com fade nos universos),
**Configurar** (abre `/integracoes/engramind?aba=conexao`, o mesmo destino do estado vazio) e
**Saiba mais** (diálogo com o conteúdo da aba Sobre). A rede que **substitui as antigas abas Canais e Memórias**: toda a
gestão delas acontece dentro da rede. Renderização com **React Flow** (`@xyflow/react`): agentes,
canais e memórias são nodes; pulsos e partículas que viajam pelos links usam Framer Motion sobre as
arestas SVG. **Não** se arrasta node individual: arrastar move a rede inteira, scroll/pinça dão zoom,
layout automático e **Centralizar** reenquadra (`RecenterButton`; volta ao enquadramento da visão).
**Fundo no padrão do tema**: o canvas usa `bg-background` (o fundo das páginas) com um brilho da
primária bem suave no centro (`NETWORK_CANVAS_CLASS`), e o React Flow recebe `NETWORK_FLOW_THEME`
(variáveis `--xy-*` por tokens: fundo transparente, pontos da grade em `--color-muted-foreground`). Os
dois vêm do tema dos canvas React Flow da lib (`FLOW_THEME_STYLE`/`FLOW_SURFACE_CLASS`, reexportados em
`src/components/flow/flow-theme.ts`, também usados pelos diagramas do Agente Arquiteto), só com
`var(--color-*)` e `color-mix` (nunca `hsl(var(--x))`), e a partícula que viaja pela aresta é o
`PathTraveler` da lib (`src/components/flow/path-traveler.tsx` reexporta). O `colorMode="dark"`
da biblioteca sozinho pintava o canvas de cinza neutro, fora do padrão. O tema também neutraliza os tipos
de nó reservados da biblioteca (`--xy-node-group-background-color` transparente, raio e sombras por
token): nós próprios usam tipos com prefixo do domínio, nunca `group`/`default`/`input`/`output`. Nada de cor fixa na pasta da
rede (teste estático).

### Lib `@engramind/client` no modo gestor (OPE-116)

A rede, os universos, o painel e o detalhe do canal, o card da memória, filtros, busca, estatísticas,
importação e o consumo ao vivo **vêm da lib `@engramind/client`** (repositório `nandobfer/engramind-client`,
pacote React + servidor para apps consumidores; ver o README dela). O Opex é gestor e consumidor: usa a lib
no **modo gestor** (`mode="manager"`, visão Apps x canais e alcance global), pelo
`OpexEngramindProvider` (`components/OpexEngramindProvider.tsx`):

- **Fonte de dados**: `opexEngramindSource`, o axios do projeto nas rotas `/api/engramind/**` (o proxy do
  catálogo, com Zod, auditoria e o Pusher das abas de gestor). Erro do axios vira `EngramindError` da lib
  (`toLibError`, mesma mensagem e código pt-BR).
- **Tempo real**: o SSE da lib em `GET /api/engramind/events` (só o dono; `server/live.ts`). Exceção à regra
  do Pusher, só para a rede e os universos: as abas de `/integracoes/engramind` continuam no
  `engramind-updated` do Pusher.
- **Adaptadores**: `next/navigation` e `next/link`, toasts do `sonner`, rótulos das centrais
  (`network/channel-labels.ts`: `centralChannelLabels`, `isCentralChannel`), ícones dos agentes do Opex
  (`components/network/agent-icons.ts`), "N gravadas" pela auditoria (`useAgentActivity`), o card
  `AboutCard` no fim da rede (`slots.footer`) e as **Configurações do canal** (`ChannelSettingsCard`, só do
  gestor) no painel e no detalhe (`slots.channelDetail`). "Configurar" leva à aba Conexão; "Nenhum app" e
  "app sem agentes ativos" levam à aba Identidades (textos do Opex por `messages`). Os filtros ficam na
  mesma chave do navegador de antes (`storagePrefix=""`).
- **CSS**: a lib não importa CSS. O provider importa as folhas do React Flow e do `react-day-picker`, e o
  `globals.css` inclui `@source "../../node_modules/@engramind/client/dist"`.
- **Instalação**: pelo npm, na versão do `package.json` (a lib publica pela tag `vX.Y.Z` do repositório
  dela). Ao subir a versão, use `pnpm add @engramind/client@^<versão>`: o pnpm 11 acrescenta a entrada
  `@engramind/client@<versão>` em `minimumReleaseAgeExclude` (`pnpm-workspace.yaml`). Sem essa entrada,
  o `pnpm install --frozen-lockfile` do `Dockerfile` recusa uma versão recém-publicada. A edição de canal
  pelo token de app (lib 0.2.0 com Engramind 0.13.0) não muda nada no Opex, que roda no modo gestor.
- **Universo do agente fora da rede** (lib 0.3.0, OPE-130): `AgentUniverse` (`agent="app/agente"`,
  `defaultCreateChannel`, `allowCreate`) — o mesmo `AgentUniverseView` da rede no `?universo=agente:…`. Usado
  na aba Memórias dos agentes rotineiros. **"Nova memória"** no universo do agente escolhe o canal entre os
  assinados e não arquivados (`MemoryEditorTarget.channels`).
- **Nome no hover da partícula** (lib 0.3.0): sem hover, o nome curto cortado; com o cursor, o **nome
  completo destacado** (borda na cor da partícula, fonte maior) no `MemoryHoverLabelLayer`, uma camada fora
  da área com zoom como o card (`clampLabelRect` o mantém inteiro no quadro; sem eventos de ponteiro). No
  toque e com o card aberto, não há rótulo. Vale em todos os universos (rede, listas de `/integracoes/ia`,
  rotineiros).
- **Testes**: o `vitest.config.ts` coloca a lib em `server.deps.inline` (os `vi.mock` de `@xyflow/react`,
  `framer-motion` e `next/*` valem dentro dela). O SSE é simulado por um `EventSource` falso
  (`__tests__/helpers/engramind-live.ts`). As funções puras e os componentes que saíram do Opex (rede,
  partículas, filtros, layout, Assinantes, Importar) têm os testes no repositório da lib.
- **Universos de `/integracoes/ia`** (`MemoryNetworkView`): o `MemoryUniverse` da lib por props, dentro do
  `OpexEngramindProvider` (rótulos das centrais só no canal de central).
- **Pendências no Engramind** (para o modo app da lib, não para o Opex): o prazo de desuso e os pesos da
  busca em `get_consumer_settings`, o estado do webhook do próprio app para o token de app e a edição dos
  canais criados pelo app. A tarefa está em `docs/engramind-consumer-settings.md` do repositório da lib.

### Visões

> Desde a OPE-116 os componentes, hooks e funções puras citados nesta seção e nas seguintes (Partículas,
> Card da memória, Estatísticas, Barra e gestão, Celular, Dados) estão na lib `@engramind/client`
> (`src/react/engramind/components/network/` e `src/react/engramind/network/` do repositório dela), com os
> testes no próprio repositório da lib (`__tests__/network/`, `__tests__/react/`). Os caminhos `network/*.ts`
> abaixo são relativos a `src/react/engramind/` da lib. No Opex ficam só os adaptadores (seção anterior):
> `OpexEngramindProvider`, `AboutCard`, `components/network/agent-icons.ts` e `network/channel-labels.ts`.

- **Inicial: Apps x canais** (`AppsOverviewView`, OPE-129): um card por **app ativo** do Engramind
  (`AppNode`, tipo `app`, com as mesmas dimensões do card do agente: ícone, nome, slug e "N agentes · M
  acessíveis") e os canais, no mesmo canvas, com as mesmas distribuições, escala e enquadramento da
  visão de agentes (o `layoutOverview` recebe os apps no lugar dos agentes). O link app → canal agrega
  as assinaturas de todos os agentes ativos do app naquele canal (`appLinks` em
  `network/app-network.ts` da lib, puro: um link por par, aresta `app:<app>→<canal>`); a dica do link mostra
  "N agentes · modos". O tamanho do app é o **alcance** (`appReach`: memórias ativas dos canais que os
  agentes dele assinam). Estatísticas: apps, canais, memórias ativas/inativas, consumos ao vivo, "Por
  canal" e "Por app (alcance)". O consumo ao vivo e a partícula verde de criação de um agente pulsam o
  app dele e viajam pelo link do app (`useHubLive` em `overview-shared.tsx`, compartilhado com a visão do
  app). **Clicar no app** abre a visão dele (`?app=<slug>`); clicar no canal abre o universo do canal;
  menu "⋯" ou botão direito abre o `ChannelPanel`. Sem app ativo: estado vazio "Nenhum app no
  Engramind" com **Configurar** (aba Identidades da integração).
- **Canais vazios fora das redes** (OPE-129, decisão do dono): as duas redes (Apps x canais e a do app)
  só mostram canais com **ao menos uma memória de qualquer status** (`channelsWithMemories`; inativas
  contam), e os links para os escondidos saem junto. "Canais" e "Por canal" contam só os mostrados, e a
  busca cita só eles. Ao vivo: a primeira memória faz o canal aparecer; excluir ou mover a última o faz
  sumir. Agentes e apps sem canal com memórias continuam na tela, sem links. Os universos, o filtro
  **Canal**, o Importar e `/engramind/canais/<slug>` continuam com todos os canais.
- **Acesso aos canais sem memória** (OPE-129): como o node só existe com memória, os canais fora da
  rede ficam na lista **"Sem memórias (N)"** do card de estatísticas — nas duas redes; no app, só os
  canais que os agentes dele assinam — e, no estado vazio do app, na mesma lista (`EmptyChannelList`).
  Cada linha tem o menu do canal e abre o `ChannelPanel` (editar, assinantes, configurações,
  arquivar/restaurar, excluir de vez). No universo do canal, **Ações do canal** na trilha (ao lado de
  Importar/Novo canal) abre o mesmo painel — o caminho para `?universo=canal:<slug>` não depende de
  memória.
- **Visão do app: Agentes x canais** (`OverviewView`, `?app=<slug>`): todos os agentes **ativos** do app (`disabled_at` nulo), com
  ícone e nome sem o prefixo "Agente" (`agentDisplayName`; agentes do Opex com o ícone das abas de
  `/integracoes/ia`, os demais com o robô genérico — `agent-icons.ts`) e os canais ativos, numa das
  **duas distribuições** escolhidas no card "O que é o Engramind" (`OptionTabs` "Distribuição da rede";
  `layoutOverview` em `network/overview-layout.ts` da lib, OPE-113, puro e determinístico):
  - **Órbita** (`by-agent`, padrão): o canal usado por **um agente só** orbita esse agente numa órbita
    **justa pela caixa** (`clearDistance`: a menor distância que separa os dois cards naquela direção,
    então perto em cima e embaixo e mais afastado dos lados), em leque virado para fora (volta inteira
    com um agente só); os agentes ficam num círculo do tamanho real dos grupos (canto mais distante de
    cada card), nunca menor que o **miolo** reservado aos compartilhados (disco com a área deles); o
    canal **compartilhado** nasce no **centroide** dos agentes que o usam (entre os dois; o de todos
    perto do meio); canais sem assinante vão para um anel de fora;
  - **Radial** (`agents-center`): agentes num círculo no meio (ordem por app e id) e os canais em
    anéis em volta (mais anéis quando não cabem), cada anel girado para o **ângulo médio** dos agentes
    de cada canal (quando os ângulos se anulam, como em agentes opostos, o do primeiro agente do canal,
    para ele ficar ao lado de um dos seus); sem agente, no fim do anel. Um pouco compacta (rodada 3): primeiro anel a 0,85× da
    distância do círculo de agentes, espaço entre anéis `0,8 × largura máxima + folga` e espaço de cada
    canal no anel `1,7 ×` a meia diagonal.

  Os cards são os de sempre, **escalados pelo tamanho** (`overviewScale`, log entre 0,85× e 1,6×): o
  agente pelo **alcance** (soma das memórias ativas dos canais que ele assina), o canal por **todas as
  memórias** dele (inclusive inativas); tudo zero, o mínimo (`data-scale`). **Nenhum card se
  sobrepõe**: só os agentes ficam fixos; os canais voltam aos poucos ao seu lugar (órbita, centroide ou
  anel) enquanto um afastamento determinístico (pela menor penetração das caixas escaladas, com 16 px
  de folga e meio pixel de tolerância) separa o que encostar, seguido de passadas só de afastamento até
  ninguém encostar. O círculo de agentes só cresce num caso residual (1,1×, no máximo 3 vezes): o
  aumento sem teto de antes não separava os compartilhados empilhados no centroide e deixava a Órbita
  com ~27.000 px. Os links são **curvas suaves de
  centro a centro** (`overviewLinkPath`, curvatura alternada entre links vizinhos), saindo do centro dos
  cards: minimizam cruzamentos, sem garantia absoluta de não passar por cima de outro card. Trocar de
  distribuição desliza os cards até as novas posições (`usePositionSlide`, ~300 ms; movimento reduzido:
  instantâneo) e reenquadra. A escolha fica no navegador com os filtros (`overviewLayout`) e o Limpar
  não a desfaz.

  O enquadramento inicial (`overviewInitialBounds` + `fitBounds`) pega a caixa de todos os cards
  escalados com 10% de folga. O Centralizar volta a esse enquadramento. Os links da visão inicial são sempre roxo primário. Cada assinatura vira um link por canal casado (`subscriptionLinks`:
  `reaches` do Engramind para os ativos; com **Mostrar arquivados**, os arquivados casados localmente
  por `subscriptionReaches`, com aparência apagada); prefixo sem canal não gera link. Hover no link
  mostra o modo (`inject`/`search`/`manage`). Só entram os canais que os agentes do app assinam (e
  que têm memórias); o card de estatísticas tem o nome do app como título. App sem agentes ativos ou
  sem canal com memórias: estado vazio com "Voltar à rede".
  Clicar no agente/canal abre o universo; menu "⋯" ou botão direito no canal abre o `ChannelPanel`.
- **Partícula de criação** (OPE-113): memória criada por um agente (`authorAgent` = `author.agent` do
  Engramind, `app/agente`) que chega pelo tempo real (`memory.created` → relê as memórias) pulsa o
  agente, manda uma **partícula verde** (`--color-success`, `Travel.tone: "success"`) pelo link do
  agente até o canal e pulsa o canal, sem recarregar. Sem link visível, só os pulsos. Só conta id que
  apareceu depois da primeira carga **e** foi criado há até 2 min (`agentWritesOf`,
  `AGENT_WRITE_WINDOW_MS`; `useAgentWrites` sobre `useEnteringIds`, com todas as memórias da rede):
  ligar Mostrar arquivados, trocar o filtro de app ou mover memória não gera partícula. Memória do
  dono ou do Mentor (sem `author.agent`) não gera. No universo do agente, a memória nova que ele
  escreveu recebe a partícula verde do centro até ela (aresta `orbit`, sentido inverso, 300 ms depois
  do nascimento). Movimento reduzido: sem partícula nem pulso.
- **Nome do canal** (`ChannelName`, em duas linhas, nos canais da visão inicial, no centro do universo do canal e na
  legenda "Por canal" do universo): o prefixo até a última `/` numa linha discreta em cima (`splitChannelSlug`) e
  a ponta final como título destacado; o slug inteiro aparece ao passar o mouse. O card do canal tem
  até 288 px (`max-w-72`), para o prefixo caber numa linha (corta no fim só se não couber). Canal por
  central (`agentes/desenvolvedor/central/<centralId>`): o título é a **sigla do repositório** (ex.:
  `OPE`) e a dica mostra o nome do repositório (`ChannelLabelsProvider` lê as centrais com
  `useCentrals`; `centralChannelLabels` em `network/channel-labels.ts`); central desconhecida mostra
  o id. **Numa linha** (OPE-113), o helper único `channelDisplayName(slug, labels)` troca a ponta pela
  sigla (`agentes/desenvolvedor/central/OPE`; `channelDisplayHint` dá repositório + slug na dica), com
  o hook `useChannelLabels()` (fora do provider, mapa vazio: o slug como está) e o componente
  `ChannelDisplayName`. Usado no chip de canal do card da memória, na lista "Por canal" da visão
  inicial, na trilha ("Canal …/central/OPE"), nas opções e nos chips do filtro **Canal** (o filtro
  grava o slug; a busca da opção acha pela sigla e pelo slug), no `ChannelPanel` e no editor de
  memória. Todo lugar novo que mostrar um canal usa esse helper.
- **Universo do canal** (`MemoryUniverse`): o canal no centro e uma partícula por memória (ativas,
  fixadas e inativas) em órbitas pela **idade** (`layoutUniverse`, OPE-114: as mais novas, pela
  criação, mais perto; as mais antigas mais longe; data inválida no anel externo), com links fracos ao
  centro. Todas as partículas do universo do canal usam o **roxo primário** (o canal é o maior do seu
  universo), também em `/integracoes/ia`. Anéis concêntricos a partir do raio 150 (+58 por anel, ~46 px entre vizinhas): o número de
  anéis é o mínimo que comporta todas, e elas são distribuídas proporcionalmente às vagas de cada anel
  (`universeRingCounts`; 15 → 1 anel, 50 → 12/17/21, 100 → 4 anéis), então o universo cresce para fora
  com densidade constante e o último anel não fica quase vazio. Canal arquivado abre apagado e somente leitura, sem Nova memória.
- **Universo do agente**: as memórias de todos os canais que ele assina, nas mesmas órbitas por idade
  (o agente no centro). A **partícula** e a legenda "Por canal" (cor e total) têm a **cor do canal**
  (OPE-114), assim como o selo de canal do card. A cor estável vem de `channelColors`, calculado sobre
  **todos** os canais e lido por universo com `pickChannelColors`: base `--chart-2..6` pelo hash do slug
  (o `--chart-1` é o roxo primário e fica fora da paleta); canais que caem na mesma base ganham
  variação de tom. Por cima dela, `universeChannelColors` dá o **roxo primário** (`var(--color-primary)`)
  ao canal com **mais memórias naquele universo** (todas, inclusive inativas; empate pelo slug, então é
  sempre a primeira linha da legenda). O roxo é por universo: um canal pode ser roxo num agente e ter a
  sua cor estável em outro; os demais canais têm a mesma cor em qualquer universo.
- **Links ao centro**: no universo do agente, o link de cada partícula tem a **cor do canal** (a mesma
  da partícula e da legenda, OPE-114); a memória que **o agente do centro escreveu**
  (`isAuthoredByCenter`: `authorAgent === center.id`, OPE-113) tem o link **destacado**: mesma cor,
  traço mais grosso (`ORBIT_STROKE_WIDTH`: 2,25 contra 1) e mais opaco (`data-authored`); o card de
  estatísticas explica ("Link destacado: memória escrita por este agente"). No universo do canal (e
  nos de `/integracoes/ia`), links fracos em roxo primário, sem destaque.
- **Navegação** (`useUniverseParam`): `?app=<slug>` (visão do app, OPE-129) e `?universo=canal:<slug>` / `agente:<app/agente>` (`router.push`:
  link compartilhável e voltar do navegador); trilha "Rede › App X › Agente Y" / "Rede › Canal X" com
  **Voltar**; no universo do canal, **Ações do canal** abre o `ChannelPanel`; Voltar e **Esc** sobem **um nível** (universo → app, se houver → Apps x canais; fora de diálogos e campos), e o
  universo aberto a partir do app mantém o `?app=`. App inexistente → toast "App não encontrado: voltando à rede." e
  a visão inicial com `router.replace`. Universo inexistente → toast e visão inicial com `router.replace` (o endereço inválido sai do
  histórico, e o voltar do navegador não fica preso nele).
  A troca de visão anima (escala/opacidade + `fitView` com duração; 0 com movimento reduzido).

### Partículas (`network/network-math.ts` + `network/particles.ts` da lib, puros)

| Atributo | Regra |
|---|---|
| Cor | A do canal da memória (`universeChannelColors`): roxo primário para o canal com mais memórias do universo (e em todo universo de canal), cor estável `--chart-2..6` para os demais. Apagada em direção ao cinza pelo brilho (`particleColor`); a bolinha do card usa a cor do canal sem o brilho (`baseColor`). |
| Distância | A idade (criação): mais nova no anel interno, mais antiga no externo (data inválida conta como a mais antiga). Anéis e `universeRingCounts` como descrito no universo do canal; vale com o agente ou o canal no centro. |
| Tamanho | `consultas + injeções` em escala `log1p` relativa (10–34 px); tudo zero: mínimo. Consumo ao vivo soma +2 px até a releitura. |
| Brilho | 1 no último uso, linear até 0 (cinza) em `consolidation.stale_after_days` (global; a chave não aceita sobreposição por canal; padrão 90). Último uso = `last_retrieved_at` do Engramind ou a criação (`verified_at` do consolidador não é consumo e não conta) (nunca usada conta da criação), igual para todos os apps (OPE-116). Consumida ao vivo desde a última leitura: brilho cheio na hora, inclusive a `stale_candidate` (a releitura traz o estado do Engramind). |
| Fixada | Anel primário e alfinete no card; brilho mínimo 0,25. |
| Inativa | Contorno tracejado, sem brilho nem cor; o switch Ativa muda na hora. |

Desde a OPE-116 o Opex não registra mais o consumo dos seus agentes: `engramind_memory_usage` e
`GET /api/engramind/memory-usage` saíram. A coleção fica no banco, intacta e sem uso, até o dono decidir
apagá-la (o índice TTL de 365 dias dela continua no Mongo).

### Card da memória (`MemoryCardLayer` + `MemoryCard`)

A **partícula vira o card**, que abre **só pelo clique ou toque** (OPE-113): clicar na partícula abre
(fixado), clicar nela de novo ou fora fecha, e clicar em outra troca de card (um só aberto). Passar o
mouse (fora do toque) **não abre o card**: só afasta as vizinhas (`repelOffset`) e aumenta levemente a
partícula em foco (1,35×), sem atraso; com um card aberto, o foco fica na aberta e o hover em outra não
muda nada. **Sem piscar** (OPE-113): o React Flow trata objeto de node novo como ainda não medido
e o esconde até medir, então hover, foco e card aberto chegam só pelo `UniverseFocusContext` (nada
disso entra no array de nodes) e `useStable` (`useStableNodes.ts`) reaproveita o objeto anterior de
cada node e aresta quando os dados não mudaram (também nas releituras e na visão inicial). Ao abrir, o card
nasce no lugar, no tamanho e na cor da partícula na tela e se expande até o retângulo final (~220 ms),
com o conteúdo entrando em fade; ao fechar, encolhe de volta para ela. A partícula fica invisível
(`data-expanded`) enquanto o card está aberto. O card fica numa **camada fora da área com zoom**
(filho do React Flow, irmão do viewport): **quadrado de 360 × 360 px** (`MEMORY_CARD_WIDTH` /
`MEMORY_CARD_HEIGHT`, OPE-113) e fonte fixa em qualquer zoom, posição
convertida da partícula para a tela e acompanhando o arrastar/zoom, e sempre **inteiro dentro do
quadro** (`clampCardRect`, 8 px de margem; `memoryCardSize` encolhe o quadrado só quando o quadro não
comporta). Dentro, em coluna: título em cima, o **texto rolando** no meio (`flex-1`) e chips, dados e
ações sempre visíveis embaixo. Tirar o mouse da partícula ou do card não fecha o card
aberto (o antigo hover com dois sinais de presença, `useHoverPresence`, saiu). Esc dentro do card (ele não é modal, `data-network-card`) volta à visão inicial como em qualquer
ponto da rede; nos diálogos modais e campos, não. Movimento reduzido: troca instantânea. O card tem título, texto, chips de categoria, canal (legível, `ChannelDisplayName`) e **autor**
(OPE-113: o agente que criou, com o ícone e o nome sem "Agente" — `AgentLabelsProvider` com os nomes de
todos os agentes, inclusive desligados —, e o `app/agente` na dica; agente desconhecido mostra o
`app/agente`; memória gravada por um app sem agente: "App `<app>`"; com a origem do Opex, o selo
"Gravada por …" de sempre; sem autor, nada), idade, relevância (consultas +
injeções), última vez usada ("nunca usada"), switch **Ativa**, **Fixar/Desafixar**, **Editar** (o
`MemoryEditor` num diálogo; `update_memory` com `expected_version`: conflito mostra "Esta memória mudou
enquanto você editava. Confira a versão atual.", mantém o rascunho e relê a memória: o próximo Salvar usa a versão atual), **Mover de canal**, **Histórico**
(com Reverter) e **Excluir** (confirmação). O card só abre a partir do zoom 0,6 (`CARD_MIN_ZOOM`); com
zoom afastado os rótulos somem. Memória aberta que some por outra origem: o card fecha com toast e a
partícula sai animada (`useLeavingItems`: um timer por item que sai, independente de novas leituras da
lista, então o node e o link somem depois de `LEAVE_MS` mesmo com a lista relida no meio). Excluir ou
mover **daqui** não avisa: a remoção é marcada só na confirmação do diálogo (`useLocalRemovals`; cancelar
não marca, falha desmarca, a marca é esquecida quando o item sai). As listas do Engramind
(`useEngramindList().items`) e os dados da rede (`useEngramindNetwork` da lib) mantêm a referência enquanto os
dados não mudam, para o layout e os nodes não recalcularem a cada render.

**Memória nova** (criada, movida para cá ou chegada pelo tempo real, depois da primeira carga;
`useEnteringIds`, `ENTER_MS` = 600 ms): a partícula nasce do centro do universo e vai até a sua órbita
crescendo de 0 (mola) até a sua órbita pela idade (a recém-criada, aqui ou por outra origem, vai ao anel
interno; a movida mantém a criação original e vai ao anel da sua idade), o link se desenha (`pathLength`) e um pulso marca a chegada. As vizinhas cuja
órbita mudou com o recálculo deslizam da posição antiga para a nova (~450 ms). A animação de entrada
espera o React Flow medir e mostrar o node (dois quadros). Na lista otimista de `/integracoes/ia`, a
provisória (`pendente-…`) nasce e a definitiva herda o estado. Movimento reduzido: aparece direto.

### Estatísticas (`StatsCard`, números com `AnimatedNumber`)

- Apps x canais: apps, canais, memórias ativas/inativas, consumos ao vivo, total por canal e por app
  (alcance). Visão do app: agentes, canais, memórias ativas/inativas, consumos ao vivo desde que a tela
  abriu, total por canal e por agente (alcance = soma das memórias dos canais ligados). Os canais
  contados são os mostrados (sem os vazios).
- O antigo **filtro por app** do card (OPE-113) saiu (OPE-129): a escolha do app é a navegação
  (`?app=`), e o valor `apps` salvo no navegador é ignorado pelo schema.
- Universos: ativas, inativas, fixadas, consultas + injeções, última consulta, assinantes (canal),
  esquecidas (cinza) e consumos ao vivo; no do agente, a legenda por canal.

### Barra e gestão

**Importar** (o mesmo `ImportMemoriesDialog`: prévia, erros por índice, `limits.max_batch`, sem
duplicar) e **Novo canal** ficam na **linha da trilha** (Voltar / Rede / nome), à direita
(`NetworkActions` no `actions` do `NetworkBreadcrumb`, OPE-113). Embaixo, o `NetworkToolbar` com a **busca e os filtros no
padrão de `/tarefas`** (OPE-113, `NetworkFiltersBar`): o cartão recolhível `ListFilters collapsible`
(começa recolhido com os chips dos filtros ativos, removíveis um a um, e o total de memórias que casam
na visão atual), com a busca ("Buscar por sentido e por texto"), **Canal** e **Categoria** na primeira
linha e **Status**, **Autor**, **Período** (`PresetDateRangeFilter`, pela última alteração, de/até) e
**Arquivados** (`FilterSwitch` "Mostrar", compartilhado com `/tarefas`) na segunda. Canal, Status,
Categoria e Autor são `CadastroMultiSelect` com várias escolhas (pesquisáveis, menos Status; Autor
lista os autores que aparecem nas memórias). O **Limpar** zera busca e filtros, mas não a distribuição.
Filtros, busca, Arquivados e a distribuição ficam **no navegador** (`usePersistentState`, chave
`opex.engramind.network-filters.v1`, schema `networkFiltersSchema` em `network/filters.ts` da lib; valor
inválido cai no padrão campo a campo).

**Busca automática** (`useNetworkSearch`): roda sozinha 500 ms depois de parar de digitar (a espera é
do `ListFilters`, `useDebouncedSearch`), sem botão nem Enter, por TanStack Query (resultado anterior
mantido enquanto busca de novo). **Cada busca conta como consulta no Engramind** (`retrieval_count` e
`last_retrieved_at` das memórias devolvidas, que alimentam tamanho e brilho das partículas), então ela
só roda quando o termo, os canais citados ou as categorias mudam: a chave fica **fora** da área
`memories` (memória alterada pelo tempo real não refaz a busca; ela entra na próxima mudança do termo)
e a consulta não se refaz por foco, reconexão nem idade do cache, nem repete sozinha na falha.
**Falha** (Engramind fora do ar, 4xx/5xx): toast "Busca falhou: …", aviso na barra com **Tentar
novamente** e nenhum destaque (o resultado do termo anterior não é reaproveitado). Ela **cita os canais da visão atual** (o do universo, os do agente ou os visíveis na
visão inicial, cortados pelo filtro de Canal) em lotes de 50 (`channelBatches`), porque o Engramind só
busca nos canais `manage` e arquivados quando citados. **Destaque só do que é relevante**
(`relevantSearchIds`): o ramo vetorial do Engramind não tem limiar e devolve as memórias mais próximas
até o `limit` mesmo sem relação com o termo (com poucas memórias, todas), o que deixava a busca sem
destacar nada. No modo `hybrid` destacam os resultados que os **dois ramos** encontraram (sentido e
texto) e os que **um ramo sozinho** pôs nas 3 primeiras posições (`SEARCH_SINGLE_BRANCH_TOP`; acerto
forte só pelo sentido ou só pelo texto): score ≥ `max(search.vector_weight, search.text_weight) /
(search.rrf_k + 3)`, com os pesos das configurações (padrão 1/1/60). Um termo sem relação nenhuma
ainda destaca as 3 memórias mais próximas pelo sentido. No modo `text` ("Busca só textual"), todos.

**Busca e filtros destacam sem remover** (`matchesFilters`): nos universos as que casam ficam em
destaque e as demais apagadas, sem recalcular a escala; na visão inicial os canais mostram "N na
busca" e os sem resultado ficam apagados. **Nova memória** (`create_memory`) no universo de canal
ativo. `ChannelPanel` (Sheet): Editar (slug imutável), Arquivar / Restaurar / Excluir de vez (só
arquivado, com confirmação), `SubscribersCard` (assinar, editar, remover) e `ChannelSettingsCard`
(sobreposições com "Remover sobreposição"). A página `/engramind/canais/<slug>` continua (o voltar
leva ao universo do canal).

**Novo canal** (OPE-129): depois de criar, a tela abre o universo do canal novo (`ChannelDialog.onCreated`),
onde fica **Nova memória**; como nasce vazio, ele só entra nas redes quando ganhar a primeira memória. O aviso
de canal inexistente espera a releitura da lista de canais (`channelsFetching`).

Estados: skeleton com as dimensões e o fundo da rede (`NetworkSkeleton`, mesmas classes de
`layout-classes.ts`; a distribuição padrão: agentes em volta do centro, cada um com canais em órbita), vazio (ícone + texto + Nova memória) e erro com Tentar novamente
(`QueryBoundary`). Movimento reduzido desliga pulsos e viagens; números e cores se atualizam.

### Celular (`useIsMobile`, até 767 px)

As redes de `/engramind` e os universos de `/integracoes/ia` se adaptam à tela estreita; no computador
nada muda.

- **Estatísticas recolhidas:** o `StatsCard` começa como um botão no canto com o resumo ("N agentes ·
  M canais" na visão inicial, "N memórias" no universo); o toque abre o card por cima do quadro (largura
  toda menos a margem) e "Recolher estatísticas" fecha. O filtro por app fica dentro do card aberto.
- **Barra compacta** (`NetworkToolbar`): a busca ocupa a linha e roda sozinha ao digitar (o × dentro
  do campo limpa); embaixo, **Filtros** (com quantos estão ativos, sem contar a busca) abre os mesmos
  campos do computador (Canal, Categoria, Status, Autor, Período e Arquivados) empilhados numa gaveta
  de baixo para cima (`NetworkFiltersSheet`, com Limpar e Ver rede). Importar/Novo canal ficam na
  linha do Voltar, só com ícone e dica.
- **Enquadramento inicial:** nunca afasta abaixo do zoom `MOBILE_FIT_MIN_ZOOM` (0,5): se a rede
  não cabe, centraliza nela com esse zoom e o resto fica a um arrastar (`minZoomCenter`); o
  Centralizar volta a esse enquadramento. Os universos continuam enquadrando tudo.
- **Toque na partícula:** o "passar o mouse" (afastar as vizinhas) ignora ponteiro de toque; tocar fixa o card,
  tocar fora fecha, tocar em outra troca. Com o zoom abaixo de 0,6 (celular ou computador), o clique ou
  toque aproxima até 0,6 centralizado na partícula e o card abre.
- **Card limitado ao quadro** (vale em qualquer tela, `memoryCardSize`): largura e altura cabem no quadro
  menos 8 px de cada lado; texto longo rola dentro do card.
- **Link:** no toque, o modo da assinatura aparece por 1,5 s (`LINK_TOUCH_LABEL_MS`).
- **Quadro e botões:** altura dinâmica da tela (`70dvh` na rede, `60dvh` nos cards de `/integracoes/ia`),
  sobrando margem para rolar a página fora do quadro; Centralizar, Nova memória e o menu "⋯" do canal
  com área de toque de 40 px; a trilha mostra só Voltar e o nome atual. O skeleton acompanha (card
  recolhido no canto).

### Dados (`useEngramindNetwork` da lib)

Canais (com arquivados), apps, agentes, assinaturas e memórias (`status=active,permanent,archived`,
todas as páginas) pelo proxy e `settings` (prazo, pesos da busca, categorias, limites, `max_batch`).
Tudo por `/api/engramind/**` (o navegador nunca chama o Engramind).

## Webhook e tempo real

- `POST /api/engramind/webhook` é **público** (`PUBLIC_ROUTES` em `src/features/auth/paths.ts`) e
  autenticado só pela assinatura: `Engramind-Signature: t=<unix>,v1=<hex>`, `|agora − t| ≤ 300 s`,
  `HMAC-SHA256(segredo, t + "." + corpo bruto)` comparado com `timingSafeEqual`. Falha → `401` sem
  corpo (log `warn` com o motivo). Não entra em `PUBLIC_TOKEN_ROUTES` (não é token de sistema).
- Válido → `204` na hora e, em `runAfterResponse`, o `id` é registrado em `engramind_webhook_events`
  (único, TTL 24 h; repetido é descartado com log). Todo evento vai ao **SSE da rede** (barramento da lib
  no processo, `forwardWebhookLive` em `server/live.ts`, só ids, slugs e tipos), e, menos
  `memory.consumed`, o Opex publica `engramind-updated` em `private-app` com `{ type, channel?, keys? }`
  (sem textos nem valores) para as abas de gestor.
- As mutações feitas pelo próprio Opex também publicam, no Pusher e no SSE (`publishEngramind`):
  `identities.updated`, `jobs.updated`, `status.updated`, `env.updated`, `env.applied` e os tipos do
  Engramind.
- **SSE da rede** (`GET /api/engramind/events`, só o dono): `event: engramind` com o evento, sinal de vida a
  cada 25 s. Um processo só (o Opex roda num container): o barramento vive no processo. O cliente
  reconecta com espera crescente e relê as consultas do Engramind ao voltar.
- **Memórias dos agentes**: em `memory.*`, `listOfChannel(event.channel)` (`src/features/ai/agents.ts`)
  acha a lista; mapeada → publica também `ai-memories-updated` `{ agentId, centralId?, clientId? }` em
  `private-integration-ai` (os cards de memórias atualizam, inclusive com o que o agente gravou
  sozinho). Canal fora do mapeamento é ignorado (log `debug`). A migração publica
  `engramind-updated` `{ type: "migration.updated" }`.
- **Consumo ao vivo** (OPE-109, OPE-116): vem do webhook **`memory.consumed`** do Engramind (um evento por
  canal, com `consumption`, `operation`, `agent`, `memory_ids`, `title_ids` e `context_version`), emitido
  pelas leituras com o token do agente: o contexto do turno (`get_context`, inclusive o `304`), as dicas,
  a busca e o `get_memory`. O Opex **não publica mais o próprio consumo** (`publishConsumption` saiu):
  - **Rede**: o evento vai pelo SSE e a lib agrupa pelo `consumption`, animando **uma vez** por leitura
    (pulso no agente, partícula até os canais e de volta dos que entregaram, brilho cheio e +tamanho até a
    releitura de 6 s). Leitura sem agente (token admin ou de app, como as buscas do dono na tela) não anima.
    As dicas e a busca do Agente Opex e do Maddox do dono (`get_engramind_hints`,
    `search_engramind_memories`) usam o token do agente (`opex/opex`, `opex/maddox`) e pulsam como esse
    agente. Id de memória que a
    tela não carregou é ignorado. Agente de outro app que lê um canal visível pulsa só o canal.
  - **Atividade dos agentes** (fora da rede): `forwardWebhookLive` agrupa os eventos pelo `consumption` e
    publica **um** `engramind-consumption` em `private-app` com
    `{ agent, kind, channels, delivered, memoryIds, titleIds?, version? }` (só ids e slugs), que o
    `useAgentActivityRealtime` usa para reler a adoção.
  - `memory.consumed` **nunca** invalida listas, cards nem o contexto em cache.
  - Sem webhook ou com `webhooks.enabled = false`, não há consumo ao vivo, e a tela atualiza pelas
    próprias ações e ao reconsultar.
- `useEngramindRealtime` (o da lib pelo SSE na rede; o do Opex pelo Pusher nas abas de gestor) invalida por
  área: `memory.*` (menos `memory.consumed`) → memórias e canais; `channel.updated` →
  canais; `subscription.updated` → assinaturas e agentes; `settings.updated` → configurações, canais
  e status; `identities.updated` → apps, agentes, tokens e conexão; `env.*` → env, status e conexão.
  Eventos fora de ordem não importam (a tela relê). Ao reconectar, o `RealtimeStatusBanner` refaz as
  consultas ativas.

## Memórias dos agentes (OPE-104)

### Listas e canais (`src/features/ai/agents.ts`, puro)

| Lista (`agentId`) | Canal | Consumidor |
|---|---|---|
| `app-global` (Memórias do Opex) | `opex` | todos (assinado por todos os agentes) |
| `opex-global` / `opex-owner` / `opex-client` | `agentes/opex/global` / `dono` / `cliente` | `opex` |
| `opex-client-specific` (por cliente) | `agentes/opex/clientes/<clientId>` | `opex` |
| `maddox-global` / `maddox-owner` / `maddox-client` | `agentes/maddox/global` / `dono` / `cliente` | `maddox` |
| `maddox-client-specific` (por cliente) | `agentes/maddox/clientes/<clientId>` | `maddox` |
| `adversarial` | `agentes/adversario` | `adversario` |
| `architect` | `agentes/arquiteto` | `arquiteto` |
| `developer-global` | `agentes/desenvolvedor/global` | `desenvolvedor` |
| `developer-central` (por central) | `agentes/desenvolvedor/central/<centralId>` | `desenvolvedor` |
| `routine-global` (Memórias dos rotineiros) | `agentes/rotineiros/global` | todos os agentes rotineiros (e o dono) |
| `routine-specific` (por agente rotineiro, `scope: "routine"`) | `agentes/rotineiros/<slug>` | o agente rotineiro `opex/rotineiro-<slug>` |

- `memoryChannelOf(agentId, scope)` e `listOfChannel(slug)` (canal desconhecido → `null`).
- `contextChannelsFor(consumer, turn)`: sempre `opex` primeiro; Opex/Maddox com o dono → global e dono;
  no portal → global, cliente (todos) e `clientes/<clientId>` da sessão; Adversário e Arquiteto → o canal de cada um;
  desenvolvedor → global e a central (sem central, só as globais).
- `writableListsFor(consumer, turn)`: com o dono, todas as listas do agente (e `app-global`); **no
  portal, só `*-client-specific` do cliente da sessão** (o cliente é forçado pelo servidor). O dono
  cria memórias globais, só dele, de todos os clientes ou de um cliente específico.

- **Agentes rotineiros (OPE-130)**: cada rotineiro é uma identidade dinâmica `opex/rotineiro-<slug>`
  (fora de `MEMORY_IDENTITIES` e do bootstrap), provisionada pela feature `routine-agents` com o token
  de app; o token `agent` (`read`, `write`) fica cifrado no documento do agente. Assina `opex`, o
  global dos rotineiros, o canal próprio e os extras que o subagente de provisionamento escolher.
  `getAgentMemoryContext` e `createAgentMemory` aceitam o alvo explícito (`target`) com o token do
  rotineiro; `isOpexMemoryAgent` e o ícone da rede reconhecem `rotineiro-*`. O fake dos testes ganhou
  `GET /v1/channels` (lista). Ver `modules/routine-agents.md`.

### Rede (`server/memory-network.ts`)

`ensureAgentMemoryNetwork` (idempotente): os 10 canais fixos (`fixedMemoryChannels`; existente é
reaproveitado e arquivado é restaurado), os **seis** agentes
`opex/{opex,maddox,adversario,arquiteto,desenvolvedor,mentor}` (`MEMORY_IDENTITIES`: os cinco consumidores de
contexto e o Agente Mentor, que só escreve e não tem canal, contexto nem aprendizado autônomo), um token
`agent` por agente com `MEMORY_TOKEN_SCOPES` (**`read+write+delete`**; o Mentor **`read+write`**,
porque só cria e edita), cifrado em `engramind_state.agentTokens[<identidade>]` (nunca em DTO, log,
auditoria ou resposta; conferido pela listagem `GET /v1/tokens?agent=opex/<identidade>` — o contrato
não lê token por id —, seguindo o `next_cursor` por até 10 páginas; reemitido quando falta na lista, foi
revogado, expirou ou tem escopos diferentes dos esperados, revogando o anterior), e as assinaturas `inject` (`MEMORY_SUBSCRIPTION_TARGETS`: `opex` +
`agentes/<agente>/*`; o Adversário assina exato `agentes/adversario` e o Arquiteto `agentes/arquiteto`; o Mentor assina só onde grava,
`agentes/adversario` e `agentes/desenvolvedor/*` — o token de agente só escreve nos canais que assina).
A aba Identidades marca os seis com "Memórias do Opex" (`isOpexMemoryAgent`). Sem token gravado, `agentTokenFor` dispara o provisionamento sob demanda (uma vez a cada 5 min) e o
turno espera no máximo 3 s (`LAZY_WAIT_MS`): com o Engramind lento, o turno segue sem o token (cache ou
sem memórias) e o provisionamento termina em segundo plano. Nos testes, o Engramind falso
(`__tests__/helpers/fake-engramind.ts`) só aceita as rotas do contrato (`CONTRACT_ROUTES`, copiadas do
`openapi.json`): qualquer outra responde 405, como o serviço real; rota nova no fake exige conferir o contrato. Os canais por central/cliente nascem na primeira gravação
(`ensureMemoryChannel`); excluir a central arquiva o canal dela (melhor esforço, auditado como
`canalMemoriasArquivado`).

### Contexto com cache (`server/memory-context.ts`)

`getAgentMemoryContext(consumer, channels, { focus? })` → `{ block, source: live|cache|none, cachedAt, counts, reason, focusMode }`
(foco e rastreio: ver "Contratos 0.11.0 e OPE-117" abaixo):
`GET /v1/context?channels=…&format=tagged` (desde a OPE-109; o `markdown` não traz ids) com o token do
agente e `If-None-Match` (a `version` do cache, só quando o cache já é `tagged` — a `version` muda
com o formato; `304` reaproveita). `parseTaggedContext` (`context-tagged.ts`, puro) lê os ids da
faixa 1 (com o canal) e da faixa 2; o cache guarda `format`, `memoryIds` (faixa 1) e `delivered`, e o
a última entrega é registrada fora do caminho do turno (o consumo ao vivo vem do `memory.consumed` que o
Engramind emite para esse `get_context`, OPE-116). Sucesso grava `engramind_context_cache` (`_id` = sha256 do consumidor + canais)
e `engramind_state.memoryContext.lastOkAt`; falha (fora do ar, sem token, `AUTH_INVALID`) loga `warn`,
grava `unavailableSince` e usa o cache (ou nenhum bloco) — **nunca lança**. O bloco entra **sem
alteração** depois do cabeçalho curto (`memoriesSection`); `memoryCacheNotice` gera o aviso do turno
("Memórias carregadas do cache de <data> (Engramind indisponível)" / "Engramind indisponível: turno sem
memórias"). Quem monta: `src/features/ai/server/agent-memory-context.ts` (`agentMemoryContext`,
`adversarialMemoryContext`, `developerMemoryContext`). O orçamento global não muda sozinho: os cards
mostram as memórias fora do texto completo (`counts`) com link às configurações.

### Contratos 0.11.0 e OPE-117

Contratos conferidos no `docs/openapi.json` e nas decisões 0025 e 0028–0033 do Engramind. Onde o texto da
tarefa divergia do contrato, vale o contrato:

- **Foco no contexto** (decisão 0029): `GET /v1/context?focus=…` (query, **não** `POST`), até 2.000
  caracteres depois de juntar os espaços (`400 FOCUS_TOO_LONG`); a resposta traz `focus_mode`
  (`hybrid`/`text`/`none`, também no cabeçalho `Engramind-Focus-Mode`) e a `version` muda com o foco (o
  Engramind guarda só o hash). O Opex monta o foco por consumidor em `src/features/ai/memory-focus.ts`
  (puro): Opex/Maddox (dono e portal) e Arquiteto, o pedido do turno; desenvolvedor, código + título +
  etapa/mesa e a descrição no restante (lida do banco só com a conexão aberta, prazo de 1,5 s);
  Adversário, tarefa + veredito da rodada anterior + pedido/implementação. Segredos saem **antes** do
  corte (`redactFocusText`: tokens `eng.tk_…`, `mt_sys_…`, `Bearer`, `sk-`/`ghp_`/JWT e `KEY=valor`).
  Engramind sem suporte (400 de validação) → a chamada é refeita uma vez sem foco (log
  `focus_fallback`, sem o texto). O cache guarda `focusHash` (sha256, nunca o texto) e `focusMode`:
  `If-None-Match` só com o mesmo foco, e bloco degradado (`text`/`none`) não entra no cache.
- **Faixa de títulos com categoria e canal** (0030): `#id [CATEGORIA] @canal: título` (sem tags).
  `parseTaggedContext` lê o formato novo (e o antigo `#id: título`) e devolve `titleItems` com categoria
  e canal.
- **Rastreio por turno**: cada entrega (200 ou 304) grava `engramind_deliveries` (`_id` = consumidor,
  sobrescrito): `fullIds`, `titleIds`, `overflow` (o bloco não lista os ids do overflow, só a contagem),
  `counts`, `channels`, `delivered`, `version`, `focusMode`, `source` e `at`. Nunca texto nem foco.
  Gravação fire-and-forget com `.catch`. `engramind-consumption` ganhou só `titleIds` e `version` (desde a OPE-116, montado pelo Opex a partir do
  `memory.consumed` agrupado).
- **Adoção** (`server/agent-activity.ts`, `GET /api/engramind/agent-activity`): por identidade, gravações
  `total`/`last7d`/`lastWriteAt` da auditoria (`entidade: MemoriaAgente`, `dadosNovos.ator =
  agente:<identidade>`, índice `{ entidade, dadosNovos.ator, timestamp }`), a última entrega e `stale`
  (aprendizado ligado e sem gravar há 14 dias ou mais; nunca gravou com o agente criado há mais de 14
  dias). O card "Aprendizado autônomo" de cada agente (`SelfMemorySwitch` + `AgentMemoryActivity`)
  mostra "Memórias gravadas (7d)", "Última gravação", "Último contexto lido" (zeros explícitos:
  "0"/"Nunca"), o aviso discreto e o bloco recolhível "Última entrega"; falha ao carregar mostra o erro
  com "Tentar novamente" (nunca zeros). Invalidação: `engramind-updated`
  (`memory.*`, `memories.context`), `ai-memories-updated` e `engramind-consumption` (3 s depois).
- **Rede**: o node do agente mostra "N gravadas · M acessíveis" (gravadas: auditoria, só os agentes do app
  opex, com os 7 dias no tooltip; acessíveis: soma das memórias ativas dos canais assinados — o alcance
  já usado no tamanho). Largura e altura fixas (`AGENT_NODE_SIZE_CLASS`), também no skeleton.
- **Dicas** (`POST /v1/hints`): só `{ id, title, channel, score, method, duplicate }`; sem embeddings,
  vazio. Usadas pelas ferramentas de leitura da memória própria (ver `aicontext/modules/ai.md`) e pela
  operação `get_hints` do catálogo (`get_engramind_hints`, `{ text 1–2000, channels?, limit 1–20 }`,
  leitura), presente no Agente Opex e no Maddox do dono e ausente no portal. Chamada por eles, vai com o
  **token do próprio agente** (`opex/opex`, `opex/maddox`), como os outros agentes (decisão do dono); por
  token de sistema ou sem token do agente, pelo admin.
- **Debug sem texto do usuário**: no `engramindCall`, o `focus` da query e o `text`/`query` de
  `/v1/hints` e `/v1/memories/search` aparecem no debug da integração (console, `integration_logs`,
  stream) só como `[foco|texto omitido: N caracteres]` (`debugView`; `debugFetch` aceita a URL e o corpo
  registrados).
- **Consolidação** (0025/0026): `consolidation.schedule` é cron de 5 campos em **UTC** (sem apelidos);
  `POST /v1/consolidation/run { channel?, dry_run?, tasks? }` (admin): `dry_run` → `200 channels[]`
  (plano, sem gravar nem LLM); senão `202 jobs[{ channel, job_id, already_queued }]`; `409
  CONSOLIDATION_DISABLED`/`CHANNEL_ARCHIVED`. Operação `run_consolidation` no catálogo.
- **Retenção**: sem execução manual (só a automática); `status.retention.last_run_at` + `removed`.
  **Webhooks**: sem rota de reenvio/teste; entrega falha é reprocessada por `retry_job`.
- **Tokens** (0028): `kind: app` (só o admin emite; opera o próprio app, `403 FOREIGN_APP`; não muta
  memória a memória); `POST /v1/tokens/{id}/rotate` emite igual e revoga o antigo numa transação
  (`rotate_token`, destrutiva); `update_token` muda só rótulo, escopos e validade (o vínculo é imutável);
  `create_agent`/`subscribe` repetidos com os mesmos campos → `200 created: false`.
- **Configuração por canal**: `context.category_priorities` (tipo `map`, −1000..1000, por canal),
  `context.text_max_chars`, `context.focus_min_score`, `context.focus_embed_timeout_ms`,
  `memory.vector_similar_threshold` e `memory.vector_duplicate_threshold`; `/v1/consumer-settings` e
  `/v1/categories` (categorias globais: o agente não tem campo de categorias).

### Token de app no provisionamento

`ensureAppToken` confere o token salvo no campo privado `appToken` da integração (`whoami` com
`kind: app` do app opex); sem ele, emite UMA vez com o admin, grava cifrado, guarda id/prefixo em
`engramind_state.appToken` e revoga o anterior. Agentes, assinaturas e tokens de agente passam a ser
provisionados com ele; sem token de app (Engramind antigo, gravação falhou), segue com o admin e avisa.
**Follow-up**: os canais (fixos e por central) continuam com o admin — `POST /v1/channels` é só do admin;
pelo app, o canal nasceria por assinatura exata com nome = slug, e o arquivamento pelo app só vale para
canais que ele criou (`409 CHANNEL_SHARED`).

Os dois tokens do próprio Opex (o admin da Conexão e o de app) são "Este Opex" na aba Identidades e
protegidos por `guardOwnToken` (sem revogar, rebaixar ou ganhar validade). **Rotacionar** um deles grava
o novo segredo no campo privado no mesmo passo (`RotatedTokenResult.savedOwn`, sem segredo na resposta);
se a gravação falhar, o segredo volta uma vez com o aviso de colá-lo na Conexão. O Agente Opex rotaciona
pelo mesmo caminho do "Ver token" (o Maddox não tem a ferramenta, como em `issue_engramind_token`).

### Aba Identidades (dois níveis)

Lista de apps (`AppsCard`: agentes, tokens ativos, última atividade e alertas; busca, status e "Com
alertas") e a lista geral **só com os tokens administrativos** (decisão do dono; todo token tem app). O
detalhe do app (`AppDetail`) tem o **token em uso** fixo no topo (`appTokenInUse`: o de app do Opex, ou o
`kind: app` ativo usado por último) e as abas Visão geral · Agentes · Tokens (sem agente, sem o em uso) ·
Webhook; o do agente (`AgentDetail`): Configuração · Tokens · Assinaturas · Memórias gravadas ·
Memórias acessíveis. "Emitir token" vem escopado ao app (`app`/`admin`) ou ao agente. Alertas
(`tokenHealth`): expira em até 7 dias, sem uso há 30 dias ou mais (nunca usado criado há mais de 30) e
app/agente desativado com token ativo. Regras puras em `src/features/engramind/identities.ts`.

### Configurações (`SettingsTab`)

Controles por tipo do metadado (`boolean` switch; `integer`/`number` com min/max e passo 0,01 em 0–1;
`enum` abas/select; `list` com `choices` vira chaves por opção; `categories`; `map` →
`CategoryPrioritiesEditor`; `cron` → `ScheduleSettingControl`), selo "por canal" quando
`channel_override`, busca (fuse.js) e "Só alteradas". O agendamento usa o `ScheduleEditor` das Rotinas
(horário de Brasília) convertido para o cron UTC (`schedule-cron.ts`, puro: virada de dia desloca os dias
da semana; mensal só até o dia 28; intervalo só em divisores de 60 min/24 h), com o modo "Expressão cron"
validado inline (5 campos, sem apelidos); cron fora do editor abre no modo avançado. "Executar agora"
(`RunNowButton`/`RunNowDialog` de `src/components/ui/run-now-button.tsx`, extraído das Rotinas, fundo do
card): Consolidação (todos com consolidação ativa ou um canal; "Ver plano" com `dry_run`; resultado com
jobs/`already_queued` ou o plano) e Embeddings ("Reindexar agora", `reembed_all`); Retenção só mostra a
última execução. Com alterações pendentes, a confirmação vira "Salvar e executar" (grava antes; falha ao
gravar não executa); com chave de embedding pendente, o "Salvar e executar" pede a mesma confirmação
"Trocar o embedding?" do Salvar (cancelar não grava nem executa), e o "Reindexar agora" não dispara o
`reembed_all` quando a gravação já reindexou. O resultado/erro da consolidação, o "em execução" das duas
ações e a busca/"Só alteradas" ficam no `SettingsTab` e sobrevivem ao remonte do formulário depois de
salvar. O editor de agendamento segue o rascunho ("Voltar ao padrão", "Desfazer"); agendamento que não
cabe no cron UTC (mensal depois do dia 28) entra no rascunho como marcador inválido e bloqueia o Salvar
com a mensagem da conversão. Erro acionável com "Tentar novamente".

### Serviço (`src/features/ai/server/agent-memory-service.ts`)

Mesmo contrato das rotas antigas, sobre o Engramind: listar (todas as páginas, `status=active,permanent,archived`;
ativas, fixadas primeiro, depois inativas), ler (canal divergente → 404), criar (origem, categoria padrão =
a primeira de `categories.list`, `duplicate` → `duplicada`), editar com `expected_version`
(`409 MEMORY_VERSION_CONFLICT`: "Esta memória mudou enquanto você editava. Confira a versão atual."),
fixar/desafixar (`pin`/`unpin`), inativar (`archive`; fixada é desafixada antes)/reativar (`restore`) e
excluir de vez. Limites e categorias vêm de `GET /v1/settings` (+ sobreposição do canal; cache 60 s,
`memory-settings.ts`). Ator: dono (token admin, origem `{source:"dono"}`), agente (token do agente,
origem `{source:<consumidor>}`) ou Mentor (token do agente `opex/mentor`, origem
`{source:"mentor", label:"Mentor · <tarefa>"}`, auditoria `ator: agente:mentor`; o autor no Engramind é
`opex/mentor` nas memórias novas — as gravadas antes ficam com o autor `opex`). **Memória do dono**: o agente edita, mas não exclui nem
inativa (`403 OWNER_MEMORY_PROTECTED`). Auditoria `MemoriaAgente` com texto, origem, escopo e ator
(`agente:<consumidor>`), sem segredos; `GET /api/ai/memories/meta` dá limites, categorias, migração
pendente, disponibilidade e memórias fora do contexto. O resumo é o título do Redator (primeira frase
enquanto `title_state = pending`).

### Aprendizado autônomo ("Memória própria")

Ver `aicontext/modules/ai.md`, "Aprendizado autônomo".

### Migração (`?aba=migracao`, `server/migration.ts`)

Etapas no servidor (estado no singleton `engramind_memory_migration`, progresso por `migration.updated`;
etapa em andamento num reinício vira falha "Interrompida pelo reinício do Opex"):

1. **Backup**: lê `agent_memories` crua (somente leitura) → JSON com SHA-256 em `engramind_memory_backups`,
   para download.
2. **Curador** (`memory-curator.ts` + `server/memory-curator.ts`): modelo escolhido (`OpexAiModelPicker`,
   Gemini/Anthropic/OpenAI/DeepSeek, por `streamAi`), uma chamada por lista. `applyCuratorRules`: sem
   classificação válida → `revisar_dono` ("Sem classificação válida do curador"); `descartar` em memória
   do dono (`createdBy` local sem `origin`) → `revisar_dono`; original ou reescrita proposta
   (`migrar_reescrevendo`) acima de `text_max` → `revisar_dono`;
   categoria inválida → a primeira; **o destino é sempre o canal da lista de origem** (troca sugerida
   pelo modelo só aparece no motivo). Cada chamada tem tempo máximo (`CURATOR_TIMEOUT_MS`, 8 min; o
   stream é abortado). Na triagem, um bloco que falha (erro do provedor ou tempo esgotado) **preserva a
   decisão e a revisão anteriores** das memórias dele; a que ainda não tinha decisão vai para
   `revisar_dono` com o erro real ("Curador indisponível: …"). Se **todos** os blocos falham, a etapa
   vira falha com o erro e nada do que já foi decidido ou aprovado é trocado. Na compactação, a falha
   vira etapa falha com "Tentar novamente" — nenhuma etapa fica "em andamento" para sempre.
3. **Orçamento**: estimativa (~4 caracteres/token) por combinação de turno contra `context.budget_tokens`;
   estourou → "Compactar com o curador" (reescritas e fusões, de volta à revisão).
4. **Revisão**: original × proposta, Aprovar/Rejeitar/Editar por item ou por lista (aprovar a lista
   pula, deixando pendente, a memória cujo texto final não cabe nos limites do canal). Em `descartar`, os
   botões são **"Aceitar descarte"** (não importa) e **"Migrar mesmo assim"** (ação explícita); o lote
   nunca aprova uma descartada ("Aprovar incluindo as de revisão do dono" aprova só as `revisar_dono`).
5. **Importação** (com confirmação): só as aprovadas, no canal da lista, em lotes de `limits.max_batch`,
   com `importIdempotencyKey` (a mesma da importação manual da página `/engramind`): repetir não duplica,
   falha no meio retoma do que faltou, `duplicates` guardam o id existente. `firstCompletedAt` encerra
   o aviso "Migração de memórias pendente".

Rotas (`/api/engramind/migration/**`): `GET /` (estado), `POST provision`, `GET|POST backup`,
`POST triage`, `POST compact`, `PATCH items`, `POST review/bulk`, `POST import`.

## Agente Opex (só o dono)

Grupo `engramind` (`server/tools/engramind.ts`): uma ferramenta por operação do catálogo
(`operations.ts`), mais `get_engramind_connection`, `run_engramind_bootstrap`,
`import_engramind_memories`, `get_engramind_env`, `update_engramind_env` e `apply_engramind_env`. Todas
chamam o serviço (`runEngramindOperation`, `importEngramindMemories`, `host-env.ts`), nunca o HTTP do
app. Não existem no Agente Opex do portal. No MCP do Agente Maddox (`mcp:owner`) o grupo entra, **menos
`issue_engramind_token`** (`MADDOX_EXCLUDED_TOOLS` em `src/features/maddox-agent/catalog.ts`): lá não há
o card com "Ver token" e o token emitido ficaria inalcançável. Se o cofre do "Ver token" falhar logo
depois da emissão, o token recém-emitido é revogado na hora e a ferramenta pede para emitir de novo
(`ENGRAMIND_TOKEN_REVEAL_FAILED`; sem conseguir revogar, `ENGRAMIND_TOKEN_ORPHAN` diz qual revogar).

- IA do Opex: `get_engramind_ai_source`, `apply_engramind_ai_source` (`write` com confirmação por
  padrão; entrada objeto `applyAiSourceToolSchema`, a chave nunca passa pelo modelo) e
  `resend_engramind_ai_key`. Também no MCP do Maddox.
- Memórias brutas (OPE-109): `create_engramind_memory` e `update_engramind_memory` (texto/categoria com
  `expected_version`), `write`. A busca `search_engramind_memories` roda com o token do agente da sessão
  (`opex/opex` no Agente Opex, `opex/maddox` no Maddox; `agentRead`), então o `memory.consumed` chega com o
  agente e a rede pulsa (OPE-116). O token do agente só alcança os canais que ele assina: busca sem canais
  devolve o resultado com `reach: "agent"` e um `notice` dizendo ao modelo que ficou restrita e como pedir
  outros canais. Caem na busca do admin, com a rede inteira e sem pulso: canal pedido fora desse alcance
  (`403`), token do agente recusado (`AUTH_INVALID`, log `warn`) e busca sem canais e sem resultado. Por token de sistema (MCP do dono), ou sem token do agente, vai direto pelo admin.
- `destructive` (confirmação por padrão; o dono troca ferramenta a ferramenta): excluir canal,
  memória, app e agente; arquivar canal e memória; revogar token. O resto roda direto.
- Segredos fora do histórico e dos cards (`redact` em `set_engramind_secret`, webhooks, propostas de
  teste e `update_engramind_env`).
- **Emitir token**: o modelo recebe só o prefixo; o segredo fica cifrado em `opex_secret_reveals`
  (10 min, TTL) e o card mostra **"Ver token"** (`resultAction: reveal-secret`, `POST
  /api/opex/reveals/[id]` lê e apaga). Já visto ou vencido: "revogue e emita outro".

## APIs (sessão do dono)

| Rota | Descrição |
|---|---|
| `GET/PUT /api/engramind/connection` | Estado da conexão / gravar + bootstrap |
| `POST /api/engramind/connection/bootstrap` | Repetir o bootstrap |
| `GET /api/engramind/environments` | Opções do seletor de Ambiente |
| `GET\|POST\|PUT\|PATCH\|DELETE /api/engramind/<recurso>` | Proxy do catálogo (`[...path]`): `settings`, `channels/:channel/settings`, `secrets/:key`, `providers/redator/test`, `providers/embedding/{test,models}`, `embeddings/reembed`, `apps[/:app]`, `agents[/:agent]`, `tokens[/:token[/revoke]]`, `channels[/:channel[/archive\|restore\|stats]]`, `subscriptions[/:id]`, `memories[/:memory[/history\|revert\|pin\|unpin\|archive\|restore\|move]]` (`POST memories` = `create_memory` e `PATCH memories/:memory` = `update_memory` com `expected_version`, OPE-109; `status` da listagem aceita vários separados por vírgula), `memories/search`, `status`, `jobs[/:job/retry]`, `llm-calls`, `usage`, `audit`, `whoami` |
| `POST /api/engramind/memories/import` | Importação com a chave derivada |
| `GET /api/engramind/events` | SSE da rede e dos universos (lib `@engramind/client`, OPE-116) |
| `GET/POST /api/engramind/providers/from-opex` | IA do Opex: estado das seções / aplicar (`applyAiSourceSchema`) |
| `POST /api/engramind/providers/from-opex/test` e `/resend` | Testar a proposta com a chave do Opex / reenviar a chave |
| `GET/PUT /api/engramind/env` | `.env` no host |
| `POST /api/engramind/env/apply` e `/env/apply/events` | Aplicar e reiniciar e o log NDJSON |
| `POST /api/engramind/webhook` | Webhook (público, assinado) |

Toda mutação é auditada no Opex (`entidade: "Engramind"`, `entidadeId` = operação, entrada sem
segredos) e logada (Pino, `feature: "engramind"`).

## Dados

- `engramind_webhook_events` (`_id` = id do evento, TTL 24 h), `engramind_state` (singleton
  `pendingApply`, `sources` da IA do Opex, `agentTokens` cifrados e `memoryContext`) e
  `engramind_context_cache` (último contexto por consumidor + canais, com `format`, `memoryIds` e
  `delivered`) — `server/models.ts`.
- `engramind_memory_usage`: sem uso desde a OPE-116 (o modelo saiu do código). A coleção fica intacta até o
  dono decidir apagá-la.
- `engramind_memory_backups` e `engramind_memory_migration` — `server/migration-models.ts`.
- `opex_secret_reveals` (Agente Opex) — `src/features/opex-agent/server/secret-reveals.ts`.

## Testes

Rede e universos (OPE-109, OPE-113, OPE-129; desde a OPE-116 na lib): as funções puras (cor, tamanho,
brilho, links, layout das duas distribuições, filtros, estatísticas, Apps x canais) e os componentes (rede,
card, filtros, painel do canal, Assinantes, Importar, regressão do piscar) têm os testes no repositório de
`@engramind/client` (`__tests__/network/*.test.ts` e `__tests__/react/*.test.tsx`, inclusive o teste estático
de cor fixa do pacote). No Opex ficam os testes da integração, com a lib real e o React Flow mockado por
`__tests__/helpers/xyflow.tsx` (o happy-dom não mede o canvas) e o SSE pelo `EventSource` falso de
`__tests__/helpers/engramind-live.ts`:

- `__tests__/components/engramind/network.test.tsx`: a rede pelo `OpexEngramindProvider` (visões, Apps x
  canais por `?app=`, card da memória, filtros no navegador, "N gravadas", rótulos das centrais, consumo ao
  vivo e eventos pelo SSE).
- `__tests__/components/engramind/opex-engramind-provider.test.tsx`: o detalhe do canal com as Configurações
  do canal do Opex (`slots.channelDetail`), o link de volta, o "Configurar" e o `toLibError`.
- `__tests__/components/engramind/engramind-page.test.tsx`: card "O que é o Engramind" depois da rede,
  Configurar e Saiba mais.
- `__tests__/features/ai/memory-network-view.test.tsx`: universos de `/integracoes/ia` e o teste estático dos
  adaptadores do Opex (sem cor fixa nem controles nativos).
- `__tests__/features/engramind/live.test.ts`, `events-route.test.ts` e `publish-engramind.test.ts`: o SSE da
  rede, o `memory.consumed` agrupado em `engramind-consumption` e as mutações do Opex no SSE (`{ live: false }`
  no webhook).
- `channel-labels.test.ts` (rótulos das centrais), `memory-context.test.ts` (formato `tagged`, ids no cache,
  última entrega) e `agent-tools.test.ts` (dicas e busca do Agente Opex e do Maddox com o token do agente,
  com queda para o admin).
Demais: `__tests__/features/engramind/*` (catálogo e schemas, cliente, bootstrap, tester, webhook, serviço das
operações, `.env` com bash/awk reais, host-env, ferramentas do agente, cobertura dos tooltips, IA do
Opex: `ai-source-mapping` e `ai-source-service`), `__tests__/components/engramind/engramind-ui.test.tsx`,
`opex-ai-card.test.tsx`, memórias dos agentes (`memory-context`, `memory-curator`, `migration`,
`migration-review.test.tsx`, com o Engramind falso de `__tests__/helpers/fake-engramind.ts`), `__tests__/components/ai/ai-provider-tabs.test.tsx` e
`__tests__/lib/ai/embedding-models.test.ts`. O Engramind e o host são sempre mockados.
