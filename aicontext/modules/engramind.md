# Módulo: Engramind (`src/features/engramind/`)

O **Engramind** (v0.10.0, repositório `nandobfer/engramind`, instalado em `/home/engramind`) é uma rede
de memórias para agentes de IA: um serviço Rust separado do Opex (SQLite + FTS5, backup contínuo
pelo Litestream, Redator por LLM, embeddings locais ou remotos, webhooks) que guarda fatos curtos em
**canais** e os entrega por REST, MCP e CLI. O Opex é o **gestor** da rede: configura o serviço,
administra apps, agentes, tokens, canais, assinaturas e memórias e acompanha a operação.

Fora de escopo (entrega posterior): usar as memórias do Engramind no lugar das memórias do Agente Opex.

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
4. Cada passo é auditado (`entidade: "Engramind"`, `entidadeId: "bootstrap"`, sem segredos) e
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
| Conexão (padrão) | URLs, token (só gravado, `SecretValueInput`), Ambiente (seletor com `GET /api/engramind/environments`), passos do bootstrap, estado (`whoami`: token, app, tipo, escopos, operações; webhook: URL, segredo e data) e o card Geral (debug). |
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

## Página `/engramind`

Item "Engramind" em `APP_NAV`, logo abaixo de "Ambientes". Sem a integração configurada: estado vazio
com "Configurar integração". Com ela: card "O que é o Engramind" (+ "Saiba mais") e abas (`?aba=`):

- **Canais**: lista (`CadastroTableCard`, busca local, "Mostrar arquivados") com `channel_stats` por
  linha; criar/editar (slug imutável), arquivar, restaurar e excluir de vez (só arquivado), com
  confirmação. O nome leva ao detalhe `/engramind/canais/<slug codificado>`:
  - **Assinantes**: listar (`?channel=`), assinar agente (alvo exato ou prefixo, modo
    `inject`/`search`/`manage`, acesso = escopos do token ou restrito, prioridade), editar e remover.
  - **Configurações do canal**: só as chaves com sobreposição, com efetivo, global e "Remover
    sobreposição" (`null`).
- **Memórias**: filtros (canal, status, categoria de `categories.list`, autor, desde), busca
  (`/v1/memories/search`; `mode: "text"` mostra "Busca só textual"), histórico com **Reverter**,
  fixar/desafixar, arquivar/restaurar, mover de canal e excluir de vez (confirmação nas destrutivas).
  **Importar**: canal ativo + arquivo JSON (lista ou `{ memories }`) ou JSONL (inclusive de uma linha só); prévia com a contagem e
  os erros por índice (`parseImportFile`); acima de `limits.max_batch` recusa antes do envio (também
  no servidor); `Idempotency-Key = opex-import-<sha256(canal + conteúdo)>` (o mesmo arquivo não
  duplica); resultado com as criadas e as duplicadas (`existing_id`).

## Webhook e tempo real

- `POST /api/engramind/webhook` é **público** (`PUBLIC_ROUTES` em `src/features/auth/paths.ts`) e
  autenticado só pela assinatura: `Engramind-Signature: t=<unix>,v1=<hex>`, `|agora − t| ≤ 300 s`,
  `HMAC-SHA256(segredo, t + "." + corpo bruto)` comparado com `timingSafeEqual`. Falha → `401` sem
  corpo (log `warn` com o motivo). Não entra em `PUBLIC_TOKEN_ROUTES` (não é token de sistema).
- Válido → `204` na hora e, em `runAfterResponse`, o `id` é registrado em `engramind_webhook_events`
  (único, TTL 24 h; repetido é descartado com log) e o Opex publica `engramind-updated` em
  `private-app` com `{ type, channel?, keys? }` (sem textos nem valores).
- As mutações feitas pelo próprio Opex também publicam (`identities.updated`, `jobs.updated`,
  `status.updated`, `env.updated`, `env.applied` e os tipos do Engramind).
- `useEngramindRealtime` invalida por área: `memory.*` → memórias e canais; `channel.updated` →
  canais; `subscription.updated` → assinaturas e agentes; `settings.updated` → configurações, canais
  e status; `identities.updated` → apps, agentes, tokens e conexão; `env.*` → env, status e conexão.
  Eventos fora de ordem não importam (a tela relê). Ao reconectar, o `RealtimeStatusBanner` refaz as
  consultas ativas.

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
| `GET\|POST\|PUT\|PATCH\|DELETE /api/engramind/<recurso>` | Proxy do catálogo (`[...path]`): `settings`, `channels/:channel/settings`, `secrets/:key`, `providers/redator/test`, `providers/embedding/{test,models}`, `embeddings/reembed`, `apps[/:app]`, `agents[/:agent]`, `tokens[/:token[/revoke]]`, `channels[/:channel[/archive\|restore\|stats]]`, `subscriptions[/:id]`, `memories[/:memory[/history\|revert\|pin\|unpin\|archive\|restore\|move]]`, `memories/search`, `status`, `jobs[/:job/retry]`, `llm-calls`, `usage`, `audit`, `whoami` |
| `POST /api/engramind/memories/import` | Importação com a chave derivada |
| `GET/POST /api/engramind/providers/from-opex` | IA do Opex: estado das seções / aplicar (`applyAiSourceSchema`) |
| `POST /api/engramind/providers/from-opex/test` e `/resend` | Testar a proposta com a chave do Opex / reenviar a chave |
| `GET/PUT /api/engramind/env` | `.env` no host |
| `POST /api/engramind/env/apply` e `/env/apply/events` | Aplicar e reiniciar e o log NDJSON |
| `POST /api/engramind/webhook` | Webhook (público, assinado) |

Toda mutação é auditada no Opex (`entidade: "Engramind"`, `entidadeId` = operação, entrada sem
segredos) e logada (Pino, `feature: "engramind"`).

## Dados

- `engramind_webhook_events` (`_id` = id do evento, TTL 24 h) e `engramind_state` (singleton
  `pendingApply` e `sources` da IA do Opex) — `server/models.ts`.
- `opex_secret_reveals` (Agente Opex) — `src/features/opex-agent/server/secret-reveals.ts`.

## Testes

`__tests__/features/engramind/*` (catálogo e schemas, cliente, bootstrap, tester, webhook, serviço das
operações, `.env` com bash/awk reais, host-env, ferramentas do agente, cobertura dos tooltips, IA do
Opex: `ai-source-mapping` e `ai-source-service`), `__tests__/components/engramind/engramind-ui.test.tsx`,
`opex-ai-card.test.tsx`, `__tests__/components/ai/ai-provider-tabs.test.tsx` e
`__tests__/lib/ai/embedding-models.test.ts`. O Engramind e o host são sempre mockados.
