# Módulo: Engramind (`src/features/engramind/`)

O **Engramind** (v0.10.0, repositório `nandobfer/engramind`, instalado em `/home/engramind`) é uma rede
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
com "Configurar integração". Com ela: card "O que é o Engramind" (+ "Saiba mais") e a **rede**
(`components/network/EngramindNetwork.tsx`), que **substitui as antigas abas Canais e Memórias**: toda a
gestão delas acontece dentro da rede. Renderização com **React Flow** (`@xyflow/react`): agentes,
canais e memórias são nodes; pulsos e partículas que viajam pelos links usam Framer Motion sobre as
arestas SVG. **Não** se arrasta node individual: arrastar move a rede inteira, scroll/pinça dão zoom,
layout automático e **Centralizar** reenquadra (`RecenterButton`; volta ao enquadramento da visão).
**Fundo no padrão do tema**: o canvas usa `bg-background` (o fundo das páginas) com um brilho violeta
bem suave no centro (`NETWORK_CANVAS_CLASS`), e o React Flow recebe `NETWORK_FLOW_THEME` (variáveis
`--xy-*` por tokens: fundo transparente, pontos da grade em `--muted-foreground`). O `colorMode="dark"`
da biblioteca sozinho pintava o canvas de cinza neutro, fora do padrão. Nada de cor fixa na pasta da
rede (teste estático).

### Visões

- **Inicial** (`OverviewView`): todos os agentes **ativos** de todos os apps (`disabled_at` nulo), com
  ícone e nome sem o prefixo "Agente" (`agentDisplayName`; agentes do Opex com o ícone das abas de
  `/integracoes/ia`, os demais com o robô genérico — `agent-icons.ts`), **na horizontal**: os agentes
  numa linha em cima (agrupados por app) e os canais ativos numa linha embaixo, as duas centralizadas
  (`layoutOverview`; links saem por baixo do agente e chegam por cima do canal). O enquadramento
  inicial (`overviewInitialBounds` + `fitBounds`) pega a largura da linha de agentes com 15% de folga
  de cada lado e a altura até a linha de canais; canais além dessa largura ficam a um arrastar. O
  Centralizar volta a esse enquadramento. Cada assinatura vira um link por canal casado (`subscriptionLinks`:
  `reaches` do Engramind para os ativos; com **Mostrar arquivados**, os arquivados casados localmente
  por `subscriptionReaches`, com aparência apagada); prefixo sem canal não gera link. Hover no link
  mostra o modo (`inject`/`search`/`manage`). Filtro por app no card de estatísticas (padrão todos).
  Clicar no agente/canal abre o universo; menu "⋯" ou botão direito no canal abre o `ChannelPanel`.
- **Nome do canal** (`ChannelName`, nos canais da visão inicial, no centro do universo do canal e na
  legenda "Por canal"): o prefixo até a última `/` numa linha discreta em cima (`splitChannelSlug`) e
  a ponta final como título destacado; o slug inteiro aparece ao passar o mouse. O card do canal tem
  até 288 px (`max-w-72`), para o prefixo caber numa linha (corta no fim só se não couber). Canal por
  central (`agentes/desenvolvedor/central/<centralId>`): o título é a **sigla do repositório** (ex.:
  `OPE`) e a dica mostra o nome do repositório (`ChannelLabelsProvider` lê as centrais com
  `useCentrals`; `centralChannelLabels` em `network/channel-labels.ts`); central desconhecida mostra
  o id.
- **Universo do canal** (`MemoryUniverse`): o canal no centro e uma partícula por memória (ativas,
  fixadas e inativas) em órbitas (`layoutUniverse`: as mais usadas mais perto), com links fracos ao
  centro. Anéis concêntricos a partir do raio 150 (+58 por anel, ~46 px entre vizinhas): o número de
  anéis é o mínimo que comporta todas, e elas são distribuídas proporcionalmente às vagas de cada anel
  (`universeRingCounts`; 15 → 1 anel, 50 → 12/17/21, 100 → 4 anéis), então o universo cresce para fora
  com densidade constante e o último anel não fica quase vazio. Canal arquivado abre apagado e somente leitura, sem Nova memória.
- **Universo do agente**: as memórias de todos os canais que ele assina; o link de cada partícula tem
  a **cor do canal** (`channelColors` calculado sobre **todos** os canais e lido por universo com
  `pickChannelColors`: base `--chart-1..6` pelo hash do slug; canais que caem na mesma base ganham
  variação de tom, e o mesmo canal tem a mesma cor em qualquer universo) e a legenda "Por canal" mostra cor e total.
- **Navegação** (`useUniverseParam`): `?universo=canal:<slug>` / `agente:<app/agente>` (`router.push`:
  link compartilhável e voltar do navegador); trilha "Rede › Canal X" / "Rede › Agente Y" com
  **Voltar**; **Esc** volta (fora de diálogos e campos). Universo inexistente → toast e visão inicial com `router.replace` (o endereço inválido sai do
  histórico, e o voltar do navegador não fica preso nele).
  A troca de visão anima (escala/opacidade + `fitView` com duração; 0 com movimento reduzido).

### Partículas (`network/network-math.ts` + `network/particles.ts`, puros)

| Atributo | Regra |
|---|---|
| Cor | Relativa ao universo: a mais nova verde (`--color-success`), a mais antiga o roxo primário, gradiente pela criação (`color-mix`). Uma só ou datas iguais: verde. |
| Tamanho | `consultas + injeções` em escala `log1p` relativa (10–34 px); tudo zero: mínimo. Consumo ao vivo soma +2 px até a releitura. |
| Brilho | 1 no último uso, linear até 0 (cinza) em `consolidation.stale_after_days` (global; a chave não aceita sobreposição por canal; padrão 90). Último uso = maior entre `last_retrieved_at` e o registro do Opex (`engramind_memory_usage`), ou a criação (`verified_at` do consolidador não é consumo e não conta) (nunca usada conta da criação). `stale_candidate` → 0. |
| Fixada | Anel primário e alfinete no card; brilho mínimo 0,25. |
| Inativa | Contorno tracejado, sem brilho nem cor; o switch Ativa muda na hora. |

O Engramind não expõe `last_injected_at` no DTO: por isso o Opex registra o último consumo dos seus
agentes (`server/memory-usage.ts`); consumo de apps de fora só conta por `last_retrieved_at`.

### Card da memória (`MemoryCardLayer` + `MemoryCard`)

A **partícula vira o card**: no hover (ou toque/clique, que fixa o card; clicar fora fecha) o card
nasce no lugar, no tamanho e na cor da partícula na tela e se expande até o retângulo final (~220 ms),
com o conteúdo entrando em fade; ao fechar, encolhe de volta para ela. A partícula fica invisível
(`data-expanded`) enquanto o card está aberto. O card fica numa **camada fora da área com zoom**
(filho do React Flow, irmão do viewport): tamanho e fonte fixos (`w-72`) em qualquer zoom, posição
convertida da partícula para a tela e acompanhando o arrastar/zoom, e sempre **inteiro dentro do
quadro** (`clampCardRect`, 8 px de margem). Hover com **dois sinais de presença** (cursor na partícula e no card,
ambos por eventos de ponteiro): o fechamento (300 ms) só é agendado quando os dois estão desligados e
é cancelado quando qualquer um liga, então a ordem dos eventos não importa (o navegador avisa "entrei
no card" antes de "saí da partícula"). Sair do card fecha depois do atraso. Movimento reduzido: troca instantânea. As
vizinhas se afastam levemente (`repelOffset`). O card tem título, texto, categoria, canal, idade, relevância (consultas +
injeções), última vez usada ("nunca usada"), switch **Ativa**, **Fixar/Desafixar**, **Editar** (o
`MemoryEditor` num diálogo; `update_memory` com `expected_version`: conflito mostra "Esta memória mudou
enquanto você editava. Confira a versão atual.", mantém o rascunho e relê a memória: o próximo Salvar usa a versão atual), **Mover de canal**, **Histórico**
(com Reverter) e **Excluir** (confirmação). O card só abre a partir do zoom 0,6 (`CARD_MIN_ZOOM`); com
zoom afastado os rótulos somem. Memória aberta que some por outra origem: o card fecha com toast e a
partícula sai animada (`useLeavingItems`).

**Memória nova** (criada, movida para cá ou chegada pelo tempo real, depois da primeira carga;
`useEnteringIds`, `ENTER_MS` = 600 ms): a partícula nasce do centro do universo e vai até a sua órbita
crescendo de 0 (mola), o link se desenha (`pathLength`) e um pulso marca a chegada. As vizinhas cuja
órbita mudou com o recálculo deslizam da posição antiga para a nova (~450 ms). A animação de entrada
espera o React Flow medir e mostrar o node (dois quadros). Na lista otimista de `/integracoes/ia`, a
provisória (`pendente-…`) nasce e a definitiva herda o estado. Movimento reduzido: aparece direto.

### Estatísticas (`StatsCard`, números com `AnimatedNumber`)

- Inicial: agentes, canais, memórias ativas/inativas, consumos ao vivo desde que a tela abriu, filtro
  por app, total por canal e por agente (alcance = soma das memórias dos canais ligados). Respeita o
  filtro por app.
- Universos: ativas, inativas, fixadas, consultas + injeções, última consulta, assinantes (canal),
  esquecidas (cinza) e consumos ao vivo; no do agente, a legenda por canal.

### Barra e gestão

`NetworkToolbar`: busca (`/v1/memories/search`; "Busca só textual" quando `mode: text`), filtros
(canal, status, categoria, autor, desde), **Mostrar arquivados**, **Importar** (o mesmo
`ImportMemoriesDialog`: prévia, erros por índice, `limits.max_batch`, sem duplicar) e **Novo canal**.
**Busca e filtros destacam sem remover** (`matchesFilters`): nos universos as que casam ficam em
destaque e as demais apagadas, sem recalcular a escala; na visão inicial os canais mostram "N na
busca" e os sem resultado ficam apagados. **Nova memória** (`create_memory`) no universo de canal
ativo. `ChannelPanel` (Sheet): Editar (slug imutável), Arquivar / Restaurar / Excluir de vez (só
arquivado, com confirmação), `SubscribersCard` (assinar, editar, remover) e `ChannelSettingsCard`
(sobreposições com "Remover sobreposição"). A página `/engramind/canais/<slug>` continua (o voltar
leva ao universo do canal).

Estados: skeleton com as dimensões e o fundo da rede (`NetworkSkeleton`, mesmas classes de
`layout-classes.ts`; linha de agentes em cima e de canais embaixo), vazio (ícone + texto + Nova memória) e erro com Tentar novamente
(`QueryBoundary`). Movimento reduzido desliga pulsos e viagens; números e cores se atualizam.

### Dados (`hooks/useEngramindNetwork.ts`)

Canais (com arquivados), apps, agentes, assinaturas e memórias (`status=active,permanent,archived`,
todas as páginas) pelo proxy, `settings` (prazo, categorias, limites, `max_batch`) e
`GET /api/engramind/memory-usage`. Tudo por `/api/engramind/**` (o navegador nunca chama o Engramind).

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
- **Memórias dos agentes**: em `memory.*`, `listOfChannel(event.channel)` (`src/features/ai/agents.ts`)
  acha a lista; mapeada → publica também `ai-memories-updated` `{ agentId, centralId?, clientId? }` em
  `private-integration-ai` (os cards de memórias atualizam, inclusive com o que o agente gravou
  sozinho). Canal fora do mapeamento é ignorado (log `debug`). A migração publica
  `engramind-updated` `{ type: "migration.updated" }`.
- **Consumo ao vivo** (OPE-109): `engramind-consumption` em `private-app` (só o dono vê, inclusive o
  consumo dos agentes do portal), publicado **só pelo servidor** por `publishConsumption`
  (`server/consumption.ts`, nunca lança) depois do consumo bem-sucedido, com payload
  `{ agent: "app/agente", kind: "context" | "search", channels, delivered, memoryIds }` — **só ids e
  slugs**, nunca textos ou títulos (`delivered` = canais que entregaram ao menos uma memória: a
  partícula volta ao agente). Origens: o contexto do turno (`getAgentMemoryContext`, faixa 1 do bloco
  `tagged`; a resposta `304` usa os ids do cache e anima do mesmo jeito; cache por indisponibilidade
  ou turno sem memórias não publica) e a ferramenta `search_engramind_memories` do Agente Opex
  (`opex/opex` no chat, `opex/maddox` pelo MCP do Maddox; sem resultados não publica). As buscas do
  dono na tela não contam. Também grava `engramind_memory_usage`. No cliente,
  `useEngramindConsumption` marca o uso no cache, anima localmente (`useLiveEffects`: pulso, partícula,
  +tamanho) e relê memórias e uso 6 s depois (o Engramind grava contadores em lote a cada 5 s); id de
  memória que a tela não carregou é ignorado.
- `useEngramindRealtime` invalida por área: `memory.*` → memórias e canais; `channel.updated` →
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
| `developer-global` | `agentes/desenvolvedor/global` | `desenvolvedor` |
| `developer-central` (por central) | `agentes/desenvolvedor/central/<centralId>` | `desenvolvedor` |

- `memoryChannelOf(agentId, scope)` e `listOfChannel(slug)` (canal desconhecido → `null`).
- `contextChannelsFor(consumer, turn)`: sempre `opex` primeiro; Opex/Maddox com o dono → global e dono;
  no portal → global, cliente (todos) e `clientes/<clientId>` da sessão; Adversário → o canal dele;
  desenvolvedor → global e a central (sem central, só as globais).
- `writableListsFor(consumer, turn)`: com o dono, todas as listas do agente (e `app-global`); **no
  portal, só `*-client-specific` do cliente da sessão** (o cliente é forçado pelo servidor). O dono
  cria memórias globais, só dele, de todos os clientes ou de um cliente específico.

### Rede (`server/memory-network.ts`)

`ensureAgentMemoryNetwork` (idempotente): os 9 canais fixos (`fixedMemoryChannels`; existente é
reaproveitado e arquivado é restaurado), os **cinco** agentes
`opex/{opex,maddox,adversario,desenvolvedor,mentor}` (`MEMORY_IDENTITIES`: os quatro consumidores de
contexto e o Agente Mentor, que só escreve e não tem canal, contexto nem aprendizado autônomo), um token
`agent` por agente com `MEMORY_TOKEN_SCOPES` (**`read+write+delete`**; o Mentor **`read+write`**,
porque só cria e edita), cifrado em `engramind_state.agentTokens[<identidade>]` (nunca em DTO, log,
auditoria ou resposta; conferido pela listagem `GET /v1/tokens?agent=opex/<identidade>` — o contrato
não lê token por id —, seguindo o `next_cursor` por até 10 páginas; reemitido quando falta na lista, foi
revogado, expirou ou tem escopos diferentes dos esperados, revogando o anterior), e as assinaturas `inject` (`MEMORY_SUBSCRIPTION_TARGETS`: `opex` +
`agentes/<agente>/*`; o Adversário assina exato `agentes/adversario`; o Mentor assina só onde grava,
`agentes/adversario` e `agentes/desenvolvedor/*` — o token de agente só escreve nos canais que assina).
A aba Identidades marca os cinco com "Memórias do Opex" (`isOpexMemoryAgent`). Sem token gravado, `agentTokenFor` dispara o provisionamento sob demanda (uma vez a cada 5 min) e o
turno espera no máximo 3 s (`LAZY_WAIT_MS`): com o Engramind lento, o turno segue sem o token (cache ou
sem memórias) e o provisionamento termina em segundo plano. Nos testes, o Engramind falso
(`__tests__/helpers/fake-engramind.ts`) só aceita as rotas do contrato (`CONTRACT_ROUTES`, copiadas do
`openapi.json`): qualquer outra responde 405, como o serviço real; rota nova no fake exige conferir o contrato. Os canais por central/cliente nascem na primeira gravação
(`ensureMemoryChannel`); excluir a central arquiva o canal dela (melhor esforço, auditado como
`canalMemoriasArquivado`).

### Contexto com cache (`server/memory-context.ts`)

`getAgentMemoryContext(consumer, channels)` → `{ block, source: live|cache|none, cachedAt, counts, reason }`:
`GET /v1/context?channels=…&format=tagged` (desde a OPE-109; o `markdown` não traz ids) com o token do
agente e `If-None-Match` (a `version` do cache, só quando o cache já é `tagged` — a `version` muda
com o formato; `304` reaproveita). `parseTaggedContext` (`context-tagged.ts`, puro) lê os ids da
faixa 1 (com o canal) e da faixa 2; o cache guarda `format`, `memoryIds` (faixa 1) e `delivered`, e o
consumo é publicado fora do caminho do turno. Sucesso grava `engramind_context_cache` (`_id` = sha256 do consumidor + canais)
e `engramind_state.memoryContext.lastOkAt`; falha (fora do ar, sem token, `AUTH_INVALID`) loga `warn`,
grava `unavailableSince` e usa o cache (ou nenhum bloco) — **nunca lança**. O bloco entra **sem
alteração** depois do cabeçalho curto (`memoriesSection`); `memoryCacheNotice` gera o aviso do turno
("Memórias carregadas do cache de <data> (Engramind indisponível)" / "Engramind indisponível: turno sem
memórias"). Quem monta: `src/features/ai/server/agent-memory-context.ts` (`agentMemoryContext`,
`adversarialMemoryContext`, `developerMemoryContext`). O orçamento global não muda sozinho: os cards
mostram as memórias fora do texto completo (`counts`) com link às configurações.

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
  `expected_version`), `write`. A busca `search_engramind_memories` publica o consumo na rede
  (`engramind-consumption`, só ids).
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
| `GET /api/engramind/memory-usage` | Último consumo de cada memória pelos agentes do Opex (rede, OPE-109) |
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
- `engramind_memory_usage` (`_id` = id da memória, `lastUsedAt` com `$max`, `liveCount`; TTL de 365 d
  pelo último uso) — `server/memory-usage.ts`.
- `engramind_memory_backups` e `engramind_memory_migration` — `server/migration-models.ts`.
- `opex_secret_reveals` (Agente Opex) — `src/features/opex-agent/server/secret-reveals.ts`.

## Testes

Rede (OPE-109): `__tests__/features/engramind/network-math.test.ts` (cor, tamanho, brilho, cores dos
canais, links, layout, filtros, estatísticas e o parser `tagged`), `consumption.test.ts`,
`memory-context.test.ts` (formato `tagged`, ids no cache e consumo), `agent-tools.test.ts` (busca
publica o consumo), `__tests__/components/engramind/network.test.tsx` e
`__tests__/features/ai/memory-network-view.test.tsx` (React Flow mockado por
`__tests__/helpers/xyflow.tsx`: o happy-dom não mede o canvas). Demais: `__tests__/features/engramind/*` (catálogo e schemas, cliente, bootstrap, tester, webhook, serviço das
operações, `.env` com bash/awk reais, host-env, ferramentas do agente, cobertura dos tooltips, IA do
Opex: `ai-source-mapping` e `ai-source-service`), `__tests__/components/engramind/engramind-ui.test.tsx`,
`opex-ai-card.test.tsx`, memórias dos agentes (`memory-context`, `memory-curator`, `migration`,
`migration-review.test.tsx`, com o Engramind falso de `__tests__/helpers/fake-engramind.ts`), `__tests__/components/ai/ai-provider-tabs.test.tsx` e
`__tests__/lib/ai/embedding-models.test.ts`. O Engramind e o host são sempre mockados.
