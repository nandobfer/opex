# Quota do OpenCode (`src/features/opencode-quota`)

Painel **Quota do OpenCode** na coluna "Tarefas" da Central de desenvolvimento (`/desenvolvimento`),
logo abaixo da busca. No celular (`< lg`, OPE-166) o painel sai do topo da coluna e abre numa folha de
baixo pelo botão **Quota do OpenCode** (com a bolinha da pior faixa, a mesma da barra lateral), com a mesma
preferência salva (ver `modules/agentic-dev.md`, "Coluna Tarefas no celular"). Mostra os limites que o plugin
[`@slkiser/opencode-quota`](https://github.com/slkiser/opencode-quota), instalado no servidor do
OpenCode, já calculou: o percentual usado de cada janela (5h, semanal, mensal…) e o tempo até o reset.

## Fonte dos dados

- O Opex **não consulta provedores**: pede a quota ao próprio plugin pelo **RPC
  `slkiser.opencode-quota`** (método `refresh`) no `opencode serve`, o mesmo canal que o TUI usa.
  Por isso o painel se atualiza **sem nenhum TUI aberto**. Quem decide quando consultar cada
  provedor continua sendo o plugin (respeita `minIntervalMs`, backoff e o `retryAtMs` informado pelo
  provedor); o Opex não altera ajustes do plugin.
- Chamada (`server/rpc.ts`, `callQuotaRpc`): `client.rpc.call({ rpcID: "slkiser.opencode-quota",
  method: "refresh", input: { reason }, location })` pelo `@opencode/client`, com a autenticação da
  integração OpenCode (usuário `opencode`) e timeout de 60 s (`OPENCODE_QUOTA_RPC_TIMEOUT_MS`).
  `location: { directory }` usa o "Diretório das sessões" da integração; vazio, vai sem `location`
  (o servidor usa o seu). Os erros do cliente viram um tipo fechado (`classifyQuotaRpcError`):
  `rpc.unavailable`/`rpc.method_not_found` → `unavailable`; `UnauthorizedError` (401) →
  `unauthorized`; abortado pelo timeout → `timeout`; `ClientError` de transporte → `network`; o
  resto (inclui `rpc.internal`) → `internal`.
- **Motivo** (`reason`): `poll` respeita o intervalo e o backoff do plugin; `manual` consulta todos
  os provedores na hora e ignora o backoff. A rotina usa `poll`; o botão "Atualizar" usa o campo
  **"Botão Atualizar da quota"** (`quotaRefreshReason`, `manual` | `poll`, padrão `manual`) da
  integração OpenCode (`ai_opencode`). Sem `.env`.
- **Sem reserva**: não há mais leitura pelo host (`opencode-quota show --json`) nem pelo arquivo de
  export. Plugin descarregado ou ausente mostra o estado `missing`; as demais falhas, `error`.
- **Pré-requisito no OpenCode**: plugin `@slkiser/opencode-quota` 6.x carregado no `opencode serve`.
- O snapshot v6 já traz as **janelas guardadas**: cada provedor tem as últimas linhas boas (`rows`,
  com `okAtMs`) mesmo quando a última tentativa falhou (`error`, `checkedAtMs`), como o TUI desenha.

## Servidor

- `server/service.ts`: `refreshOpencodeQuota({ reason = "poll" })` pede o snapshot, valida com Zod
  tolerante (`quotaSnapshotSchema`, `z.looseObject`, `version: z.literal(6)`) e normaliza
  (`normalizeQuotaSnapshot`, `logic.ts`). Leituras simultâneas com o **mesmo motivo** usam uma
  chamada só; um `manual` que chega com um `poll` em andamento espera-o terminar e roda o seu. O
  último resultado fica **em memória** (`globalThis`, sem coleção); `getOpencodeQuota()` devolve-o
  ou pede na hora (`poll`) quando ainda não há (ex.: depois de reiniciar).
- **Última leitura boa por provedor**: `keepLastGoodWindows` mantém as janelas da última leitura
  `ok` (`lastGood`, em memória) do provedor que veio sem linhas, como `partial` com o erro atual de
  aviso, sem limite de tempo. Com o v6 isso quase nunca é preciso (o plugin já guarda as linhas),
  mas cobre um plugin reiniciado sem o estado. Falha do RPC não apaga a memória; provedor que sumiu
  não volta.
- Estados (`OpencodeQuotaDto.state`):
  - `ok`;
  - `missing`: o plugin não respondeu (`rpc.unavailable`), "O plugin opencode-quota não respondeu
    no OpenCode: instale ou atualize… e reinicie o opencode serve.";
  - `unconfigured`: integração OpenCode sem URL (não chama o RPC);
  - `error`: senha recusada (401, "O OpenCode recusou a senha do servidor…"), rede, timeout de 60 s,
    erro interno do plugin ou snapshot de formato não reconhecido (com a versão na mensagem).
- O debug da `ai_opencode` registra a origem ("Quota do OpenCode lida do RPC do plugin"), as
  mudanças e as falhas.
- **Rotina `opencode-quota-refresh`** (Integrações › Crons, **1 min**, ligada, motivo `poll`): pede e,
  só quando o que a tela mostra muda (`quotaHash`: estado, mensagem e provedores, sem os instantes),
  publica `opencode-quota-updated` em `private-app` com `{ checkedAt }`. A migração
  `opencode-quota-cron-interval` (uma vez só, marcador em `counters`) leva para 1 min a rotina já
  salva que ainda estava no padrão antigo de 5 min; outro valor escolhido pelo usuário fica.
- Rotas: `GET /api/opencode/quota` (último resultado) e `POST /api/opencode/quota/refresh` (pede
  agora com o motivo configurado na integração; botão "Atualizar" e "Tentar novamente").

## Normalização (snapshot v6)

- Provedores na ordem do snapshot. Status: sem erro → `ok`; com linhas e erro → `partial`; sem
  linhas e com erro → `error`. Somem: `not_configured` sem linhas, os que nunca responderam e os sem
  nada a mostrar. Erros aparecem discretos sob o provedor (âmbar no parcial, vermelho na falha).
- Janelas **sem lista fixa**: linha com `percentRemaining` vira barra (`usedPercent = 100 −
  percentRemaining`, inteiro 0–100, também quando o plugin informa negativo); as demais mostram só o
  texto do valor (`rowValueText`): `text` → `flag` ("Ativo"/"Inativo") → `amount` → `remaining`
  ("… restantes"), com `Intl` pt-BR (moeda pelo código, contagem com a unidade, símbolo próprio).
  Reset pelo `resetsAt` (ISO). Id da janela: o `id` da linha com `:conta` quando houver.
- Rótulo da janela: o `label` da linha (`5h`, `Weekly`…), com `Weekly`/`Monthly`/`Daily`… em pt-BR
  (`WINDOW_LABELS`). Nome do provedor: `QUOTA_PROVIDER_NAMES` → `label` do plugin → id.
- Erros em pt-BR por código (`quotaErrorMessage`, `QUOTA_ERROR_MESSAGES`): `rate_limited` ("Limite
  de consultas atingido; tente após HH:mm" quando há `retryAtMs`, no fuso `America/Sao_Paulo`),
  `login_expired`, `no_plan`, `timeout`, `network`, `provider_error`, `bad_response`, `no_data`,
  `local_tool` (cita o programa; "não encontrado" quando falta) e `internal` (também o código
  desconhecido), com " (HTTP n)" quando houver status. O `detail` do provedor nunca aparece.
- `exportedAt` = maior `okAtMs`/`checkedAtMs` entre os provedores (`snapshotCheckedAt`).

## Interface

- `OpencodeQuotaPanel` (recolhível; preferência `{ collapsed, collapsedProviders }` em
  `opex:opencode-quota-panel:v1`, `usePersistentState`; nasce expandido; o formato antigo
  `{ collapsed }` continua válido). O título é só "Quota do OpenCode"; o card recolhe/expande
  pelo título ou pela seta (botão de ícone "Recolher quota"/"Expandir quota").
- **Cabeçalho** (OPE-161), da esquerda para a direita: título, selo "Desatualizado" (quando há),
  "Atualizar" (`RefreshIconButton`), **atalho de configuração** e a seta. O atalho é um link
  (`next/link`, ícone `Settings`, `aria-label`/`title` "Configurar OpenCode no host",
  `data-testid="opencode-quota-config"`) para `OPENCODE_SETTINGS_HREF` (`/integracoes/ia/opencode`,
  aba padrão Configuração), com o mesmo tamanho e anel de foco da seta. É um irmão dos botões de
  recolher: clicar nele navega sem recolher o card nem pedir a quota. Aparece nos dois consumidores
  (coluna Tarefas de `/desenvolvimento` e painel "Servidor e quota" da barra lateral).
- **Janela-resumo** (`summaryWindows`): uma por conta do provedor, na ordem do snapshot — a primeira
  com % (quase sempre a de 5h) ou, sem nenhuma, a primeira linha de valor; conta só com erro não entra.
- **Card expandido**: cada provedor tem cabeçalho próprio ("Recolher/Expandir {provedor}", seta,
  `aria-expanded`). Provedor expandido mostra todas as janelas e os erros; recolhido, só as
  janelas-resumo (com a conta no rótulo quando há mais de uma). Os ids dos provedores recolhidos
  ficam em `collapsedProviders` (provedor novo nasce expandido).
- **Card recolhido** (`QuotaCompactList`): abaixo do título, as barras-resumo dos provedores
  **expandidos**, rotuladas "Provedor · janela" (`summaryLabel`; com várias contas,
  "Provedor (conta) · janela"). Provedores recolhidos ficam ocultos; sem dados `ok` ou com todos
  recolhidos, aparece só o título.
- Cada janela (`QuotaWindowBar`, sobre a barra compartilhada `UsageBar` de `src/components/metrics/`): rótulo, só o tempo restante até o reset ("2 h 15 min",
  `formatResetIn`, relógio de 30 s), % usado com `AnimatedNumber` e barra `role="progressbar"`.
  O texto visível não tem o prefixo "reinicia em"; a dica (`title`, "Reinicia em dd/MM às HH:mm")
  e o `aria-label` da barra mantêm a explicação (", reinicia em 2 h 15 min").
- **Cores por uso** (tokens): `< 60%` `success`, `60–84%` `warning`, `≥ 85%` `destructive` — regra
  compartilhada `usageLevel`/`USAGE_LEVEL_CLASSES` (`src/components/metrics/usage-level.ts`), a mesma dos
  recursos do servidor.
- **Animações** (Framer Motion, respeitando movimento reduzido): a barra cresce de 0 ao carregar e
  do valor anterior ao atualizar; a cor transiciona; expandir/recolher (card e provedor) anima altura e opacidade;
  provedores entram/saem com fade; acima de 95% a barra pulsa suavemente; o ícone de atualizar gira
  durante a leitura.
- Selo **"Desatualizado"** depois de 30 min (`isQuotaStale` sobre `exportedAt`, a consulta mais
  recente a algum provedor): aparece quando o OpenCode não consulta nenhum provedor há mais de 30 min.
  Com o `opencode serve` de pé e a rotina de 1 min, não aparece.
- Estados: skeleton ao carregar; `missing` ("Plugin opencode-quota não respondeu", com instruções para instalar/atualizar o plugin 6.x e reiniciar o `opencode serve`); `unconfigured` com
  atalho para a integração; erro com "Tentar novamente"; "Nenhum provedor com quota". Falha da quota
  nunca esconde a lista de tarefas.
- **Painel "Servidor e quota" da barra lateral** (OPE-145, `modules/host-metrics.md`): o mesmo
  `OpencodeQuotaPanel`, abaixo do bloco Servidor, com a mesma preferência (`useQuotaPanelPrefs`), query e
  evento. A **bolinha da quota** usa `visibleQuotaLevel` (`logic.ts`): pior faixa entre as barras com %
  que o painel mostra com a preferência salva (`visibleQuotaWindows`) — bloco expandido: todas as
  janelas dos provedores expandidos e as barras-resumo dos recolhidos; bloco recolhido: as barras-resumo
  dos provedores não recolhidos. Cinza (`null`) sem leitura, com `missing`/`unconfigured`/`error`, sem
  nenhuma barra com % ou desatualizada (`isQuotaStale`). Segue a preferência mesmo com o painel fechado.
- Selo "Desatualizado", botão "Atualizar" e avisos usam os componentes compartilhados `StaleBadge`,
  `RefreshIconButton` e `PanelMessage` (`src/components/metrics/`).
- Tempo real: `useOpencodeQuotaRealtime` invalida a consulta no evento com `cancelRefetch: false` — com
  o painel montado na barra lateral e em `/desenvolvimento`, as duas assinaturas resultam numa busca só;
  a reconexão do Pusher refaz as
  consultas ativas (`useRealtimeConnection`). Sem polling no cliente.

## Assinatura OpenCode Go (API do Console, OPE-167)

Segunda fonte, **independente do plugin**: o consumo da assinatura OpenCode Go lido direto da API do
Console com uma chave do chaveiro `ai_opencode_go`. Aparece em `/integracoes/ia/opencode-go?aba=consumo`
(card **Assinatura OpenCode Go**, acima do consumo do Opex), não no painel de `/desenvolvimento`. O
número é da **assinatura inteira**: inclui OpenCode no host ou no desktop, não só o Opex.

### Fonte

- `GET https://opencode.ai/console/api/go/status` (`server/go-api.ts`): `product` (plano), ciclo
  (`access.startsAt`/`endsAt`) e os medidores `fiveHour`, `week` e `month` (`usedMicroCents`,
  `limitMicroCents`, `resetsAt`). O `month` não tem `startsAt`: o início do ciclo é `access.startsAt`.
- Toda chamada leva `Authorization: Bearer <chave>`, `Accept: application/json` e o **`User-Agent` do Opex**
  (sem ele o Cloudflare responde `403 Error 1010`, que parece falta de permissão e não é), com prazo de 15 s.
- **Dados de pagamento descartados**: o `go-schemas.ts` (`z.object`) só guarda os campos usados;
  `subscriberUserId`, `paymentMethodId`, `paymentMethodKind`, `upgradePrice`, `teamsUpgradePrice`,
  `nextPeriodPaid`, `useBalance` etc. não chegam ao DTO, ao log nem ao evento. O debug da integração
  registra só método, URL, cabeçalhos mascarados e status (o corpo não é lido pelo `debugFetch`).
- **Sem reserva**: falha do `go/status` (401, 403, 404, formato) vira o estado `error` com a mensagem
  pt-BR (`goConsoleStatusMessage`) e "Tentar novamente". O `/zen/go/v1/usage` não é usado.
- **Percentual** = `usedMicroCents / limitMicroCents × 100`, com **uma casa, truncado** (`meterPercent`;
  o Console mostra o inteiro truncado). **Nenhum valor do medidor em US$**: `usedMicroCents` é
  `base × Σ(uso_i / cota_i)` por modelo, não gasto real.
- **Gasto real do ciclo** (único valor em dinheiro, discreto, "Gasto real no ciclo: US$ 42,85"):
  `usage/cost-by-day` do início do ciclo até hoje, com o primeiro dia pró-rateado pelo horário de início;
  `null` (some da tela) se a chamada falhar.

### Série diária em % (sem snapshot)

- Nada é gravado no banco. A cada leitura (`server/go-series.ts`), um `GET /usage/models?from=<dia>&to=<dia>`
  por dia UTC (a API pagina de 10 em 10 e ignora `pageSize`: o cliente segue `pageInfo.pageCount`), com até
  5 chamadas simultâneas. `pp(dia) = Σ custo(dia, modelo) / cota(modelo) × 100`, com a cota
  `go.monthly_usage.<plano>` do catálogo público do gateway (`opencodeGoAllowances`).
- Modelo com custo e sem cota no catálogo não ganha regra inventada: o custo fica fora e o dia conta como
  **parcial** (aviso). Modelos gratuitos (custo 0) são ignorados.
- Cache só em memória por `(chave, dia)`: 10 min para hoje e ontem, 6 h para dias fechados. O botão
  Atualizar relê o dia de hoje.
- **Histórico**: o Console devolve ~40 dias (observado: hoje − 42, `GO_HISTORY_DAYS`); dia mais antigo volta
  vazio sem erro, então não é consultado. Dia fora do histórico ou com falha é **sem dados**.
- Catálogo indisponível: os medidores aparecem e o gráfico dá lugar ao aviso "Gráfico indisponível".

### Gráfico, ciclos e previsão (`go-logic.ts`, puro)

- O eixo cobre o período do filtro da aba (datas de São Paulo convertidas em dias; padrão Último mês). Com o
  filtro chegando a hoje, o eixo vai até a renovação, para caber a previsão.
- **Ciclos**: os anteriores são deduzidos voltando mês a mês de `access.startsAt` (`goCycles`,
  `subUtcMonths`, em UTC). O acumulado começa no início do ciclo mais antigo que toca o filtro (mesmo antes
  do filtro) e **acumula através dos ciclos** (decisão do dono). Cada ciclo tem um **teto mensal**
  tracejado em "acumulado no início do ciclo + 100" (o ponto em que aquele ciclo atinge o limite).
- O dia em que um ciclo começa é **pró-rateado** pelo horário de início (ex.: 12:15 UTC → 49% do dia fica
  no ciclo anterior); sem isso a série passava ~0,8 pp do medidor.
- **Dias sem dados**: a linha quebra (lacuna), contam **0** no acumulado e o card avisa "Acumulado parcial: N
  dias sem dados…". A ponta de hoje é sempre o **medidor** (acumulado no início do ciclo atual + % do mês).
- **Previsão linear** (`goForecast`) só no ciclo atual, depois de 1 dia de ciclo e com o mês abaixo de 100%:
  `% previsto = % usado × (fim − início) / (agora − início)`, cruzamento em
  `início + (agora − início) × 100 / % usado` (marcador vazado com a data, só se for antes da renovação) e
  média `% usado × 24 h / (agora − início)` ("Média de X% por dia"). O % previsto aparece no fim da linha
  amarela, inclusive acima de 100%.
- Eixo Y de 0% a 150%, grades a cada 50%; sobe de 50 em 50 quando um valor passa (`goYMax`).

### Servidor, rotina e tempo real

- `server/go-usage.ts`: `getOpencodeGoUsage(query)` e `refreshOpencodeGoUsage(query)` (query =
  `usageQuerySchema`: `from`, `to`, `apiKey`). Chave: "Todas" (padrão) usa a **chave em uso** (sem chave →
  `unconfigured`); uma chave do chaveiro consulta a assinatura dela (`getAiProviderKeyById`); "Sem chave
  identificada" e "Chaves removidas" → `no-key` (não apontam para uma assinatura).
- O status fica em memória por chave: a tela reaproveita a leitura de até 1 min; o botão força, no máximo,
  uma leitura a cada 30 s por chave.
- **Rotina `opencode-go-usage-refresh`** (Integrações › Crons, 5 min, ligada): relê o status da chave em uso.
  Quando os percentuais (uma casa) ou os resets mudam — na rotina ou numa leitura da tela —, publica
  `opencode-go-usage-updated` (`{ checkedAt }`) em `private-app`; `useOpencodeGoUsageRealtime` invalida
  `["opencode-go-usage"]`. Sem chave em uso, a rotina não chama a API.
- Rotas (sessão do dono, não públicas): `GET /api/opencode/quota/go` e `POST /api/opencode/quota/go/refresh`,
  com a mesma query.

### Interface (`components/go/`)

- Cabeçalho "Uso do Go · Renova em dd/MM às HH:mm" (fuso de São Paulo), % do mês em destaque
  (`AnimatedNumber`, uma casa, cor pela faixa `usageLevel`) e a situação: "Limite mensal atingido"
  (vermelho, sem previsão), "No ritmo atual, atinge o limite em dd/MM" (âmbar) ou "Previsão de X% até a
  renovação".
- As três janelas (5h, Semanal, Mensal) com a `UsageBar` compartilhada (`fractionDigits={1}`) e o tempo até
  o reset (`formatResetIn`), com "Reinicia em dd/MM às HH:mm" na dica.
- Gráfico (recharts, `ComposedChart`): uso acumulado verde (`--chart-positive-1`), previsão amarela
  (`--chart-negative-3`), tetos tracejados com o rótulo "Teto mensal", marcador vazado no cruzamento,
  legenda "Uso / Previsão / Teto mensal", rodapé "Média de X% por dia", tooltip por dia (data, uso do dia,
  acumulado, previsão) e tabela oculta para acessibilidade.
- Estados: skeleton com a mesma estrutura (`GoUsageSkeleton`, constantes de `layout.ts`), chave não
  configurada (atalho para a integração), filtro sem assinatura, erro com "Tentar novamente" e selo
  "Desatualizado" quando a última leitura passa de 15 min.
