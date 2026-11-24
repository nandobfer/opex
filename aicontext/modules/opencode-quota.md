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
- **Sem reserva** (decisão do dono no planejamento de 16/11/2026, à pergunta "cair para `/zen/go/v1/usage`
  se o `go/status` falhar?": "Não"; substitui o trecho da especificação técnica): falha do `go/status` (401, 403, 404, formato) vira o estado `error` com a mensagem
  pt-BR (`goConsoleStatusMessage`) e "Tentar novamente". O `/zen/go/v1/usage` não é usado.
- **Percentual** = `usedMicroCents / limitMicroCents × 100`, com **uma casa, truncado** (`meterPercent`;
  o Console mostra o inteiro truncado). **Nenhum valor do medidor em US$**: `usedMicroCents` é
  `base × Σ(uso_i / cota_i)` por modelo, não gasto real.
- **Gasto real do ciclo** (decisão do dono no planejamento de 16/11/2026: "% destacado, e $
  discreto/secundário", com o gasto real do ciclo — não o "US$" do medidor; substitui o "nenhum valor em US$"
  da descrição e o "US$ usado de US$ do teto" do critério de aceite) (único valor em dinheiro, discreto, "Gasto real no ciclo: US$ 42,85"):
  `usage/cost-by-day` do início do ciclo até hoje, com o primeiro dia pró-rateado pelo horário de início;
  `null` (some da tela) se a chamada falhar.

### Série diária em % (sem snapshot)

- Nada é gravado no banco. A cada leitura (`server/go-series.ts`), um `GET /usage/models?from=<dia>&to=<dia>`
  por dia UTC (a API pagina de 10 em 10 e ignora `pageSize`: o cliente segue `pageInfo.pageCount`), com até
  5 chamadas simultâneas. `pp(dia) = Σ custo(dia, modelo) / cota(modelo) × 100`, com a cota
  `go.monthly_usage.<plano>` do catálogo público do gateway (`opencodeGoAllowances`).
- Modelo com custo e sem cota no catálogo não ganha regra inventada: o custo fica fora e o dia conta como
  **parcial** (aviso). Modelos gratuitos (custo 0) são ignorados.
- Cache só em memória por `(chave, dia)`: 10 min para hoje e ontem, 6 h para dias fechados; dia cuja
  leitura falhou (429, Cloudflare, rede) fica 90 s como "sem dados" antes de nova tentativa
  (`GO_FAILED_DAY_CACHE_MS`), para não repetir a rajada a cada leitura da tela. O botão
  Atualizar relê o dia de hoje.
- **Histórico**: o Console devolve ~40 dias (observado: hoje − 42, `GO_HISTORY_DAYS`); dia mais antigo volta
  vazio sem erro, então não é consultado. Dia fora do histórico ou com falha é **sem dados**.
- Catálogo indisponível: os medidores aparecem e o gráfico dá lugar ao aviso "Gráfico indisponível".

### Gráfico, ciclo e previsão (`go-logic.ts`, puro)

- **Um ciclo por vez** (decisão do dono, 17/11/2026, depois da prévia; substitui o "acumula através dos
  ciclos" da primeira versão, que com o padrão "Último mês" somava o ciclo anterior e mostrava 97% e um
  cruzamento em 155%). `goCycleFor` escolhe o ciclo pelo **fim do filtro** da aba: o atual quando o fim
  alcança o início dele — o padrão "Último mês" termina hoje, então abre sempre no ciclo atual (05/11 → 05/12),
  inclusive entre 21h e 24h em São Paulo —; senão o ciclo anterior que contém o fim do filtro (deduzido
  voltando mês a mês de `access.startsAt`, `subUtcMonths`, em UTC). O início do filtro não muda o gráfico.
- Só os dias UTC do ciclo exibido são consultados (`cycleDayKeys`, no máximo ~31 chamadas).
- **Eixo X em tempo contínuo** (`t` em ms, domínio = início → fim do ciclo). A linha nasce em **0% no início
  do ciclo**, ganha um ponto no fim de cada dia UTC (primeiro e último dia pró-rateados pelos horários de
  início e fim do ciclo) e, no ciclo atual, termina em **agora** com o valor exato do **medidor** (o mesmo do
  cabeçalho). Num ciclo passado termina na renovação, com a soma dos dias.
- O "Uso do dia" da dica no primeiro e no último dia do ciclo é o mesmo pedaço pró-rateado que entra no
  acumulado (não o balde UTC cheio).
- O catálogo de cotas é lido com a **chave do filtro** (não exige chave em uso) e com prazo de
  `GO_REQUEST_TIMEOUT_MS`; sem resposta, o gráfico vira "indisponível" e os medidores aparecem normalmente.
- **Dias sem dados**: a linha quebra, contam **0** no acumulado e o card avisa "Acumulado parcial: N dias do
  ciclo sem dados…".
- **Teto mensal fixo em 100%** (nunca relativo).
- **Previsão linear** (`goForecast`) só no ciclo atual, depois de 1 dia de ciclo e com o mês abaixo de 100%:
  `% previsto = % usado × (fim − início) / (agora − início)`, cruzamento em
  `início + (agora − início) × 100 / % usado` (só se for antes da renovação) e média
  `% usado × 24 h / (agora − início)`. Desenhada como **reta** de agora até a renovação, com **um ponto no fim de cada
  dia UTC** (todos sobre a mesma reta; o último é a renovação). Cada ponto traz `dayForecast`, a previsão do
  dia: média diária × fração do dia que cai na previsão (o dia de hoje e o da renovação pró-rateados).
- Eixo Y de 0% até o maior valor do gráfico (uso ou previsão) arredondado para o próximo múltiplo de 10
  **estritamente acima** dele, no mínimo 110% para o teto de 100% aparecer com respiro (`goYMax`: 113% → 120%,
  120% → 130%, 96% → 110%; OPE-171). Marcas com passo adaptativo (`goYTicks`): o menor passo de 50, 100, 200,
  500, 1000… que deixe **no máximo 6 marcas**, sempre com o 0%, o 100% (teto) e o próprio topo como última marca
  (120 → 0, 50, 100, 120; 490 → 0, 100, 200, 300, 400, 490). A marca a menos de 8% do topo sai para os rótulos não
  se encavalarem; o 100% só sai quando encavalaria com o 0% (topo acima de 1250%), e a linha pontilhada continua.
- Faixa de datas (`goAxisTicks`): início, ⅓ e ⅔ do ciclo, cruzamento (destacado) e fim; marca a menos de 3 dias
  de outra mais importante sai. Rótulos em caixa alta no fuso de São Paulo ("5 NOV", `axisDateLabel`).

### Servidor, rotina e tempo real

- `server/go-usage.ts`: `getOpencodeGoUsage(query)` e `refreshOpencodeGoUsage(query)` (query =
  `usageQuerySchema`: `from`, `to`, `apiKey`). Chave: "Todas" (padrão) usa a **chave principal** (`getPrimaryAiProviderKey`;
  a cota da assinatura é por chave, então com várias chaves em uso, OPE-179, as outras são vistas escolhendo
  cada uma no filtro; sem chave → `unconfigured`); uma chave do chaveiro consulta a assinatura dela (`getAiProviderKeyById`); "Sem chave
  identificada" e "Chaves removidas" → `no-key` (não apontam para uma assinatura).
- O status fica em memória por chave: a tela reaproveita a leitura de até 1 min; o botão força, no máximo,
  uma leitura a cada 30 s por chave.
- **Rotina `opencode-go-usage-refresh`** (Integrações › Crons, 5 min, ligada): relê o status da chave principal.
  Quando os percentuais (uma casa) ou os resets mudam — na rotina ou numa leitura da tela —, publica
  `opencode-go-usage-updated` (`{ checkedAt }`) em `private-app`; `useOpencodeGoUsageRealtime` invalida
  `["opencode-go-usage"]`. Sem chave principal, a rotina não chama a API.
- Rotas (sessão do dono, não públicas): `GET /api/opencode/quota/go` e `POST /api/opencode/quota/go/refresh`,
  com a mesma query.

### Interface (`components/go/`)

Reproduz o card de uso do Console do OpenCode Go:

- Cabeçalho (`GoUsageHeader`): o % do mês grande (`AnimatedNumber`, uma casa, `text-foreground`) e abaixo
  "Uso do Go · Renova em 5 dez · No ritmo atual, atinge o limite em 1 dez" (trecho final em âmbar; ou
  "Previsão de X% até a renovação", ou "Limite mensal atingido" em vermelho). Datas no fuso de São Paulo
  (`formatGoDate`); a dica da renovação traz data e hora. "Gasto real no ciclo" discreto à direita.
- As três janelas (5h, Semanal, Mensal) com a `UsageBar` compartilhada (`fractionDigits={1}`) e o tempo até
  o reset (`formatResetIn`), com "Reinicia em dd/MM às HH:mm" na dica.
- Gráfico (`GoUsageChart`, recharts `ComposedChart`, 260 px): grade horizontal apagada nas marcas de `goYTicks` (passo adaptativo de no máximo 6 marcas, com o 100% e o
  topo; ex.: "0%", "50%", "100%", "120%");
  **teto de 100% pontilhado e destacado** (mais claro e mais grosso que a grade, sem texto); verticais
  tracejadas apagadas em hoje e no cruzamento; uso em área verde (`--chart-positive-1`, gradiente) até o
  círculo vazado de hoje; previsão em reta amarela (`--chart-negative-3`) com hachura diagonal por baixo;
  círculos vazados no cruzamento (sobre os 100%) e no fim, com o % previsto inteiro ("116%") acima; faixa de
  datas arredondada (`GoAxisStrip`, desenhada dentro do gráfico com `usePlotArea`/`useXAxisScale`) com a data
  do cruzamento em amarelo e negrito. Rodapé: "Média de **3,9%** por dia" e a legenda Uso / Previsão / Teto
  mensal (barrinhas verticais, a do teto pontilhada, `LegendBar`). Ciclo passado ganha o título "Ciclo de 5 out
  a 5 nov" e não tem previsão. Dica por ponto, que acompanha o mouse dia a dia: no trecho verde, data, "Uso do
  dia" e "Acumulado"; no trecho amarelo, data, "Previsão do dia" e "Acumulado previsto" (pedido do dono na
  prévia de 17/11). Tabela oculta com as mesmas colunas.
- Cores do SVG (`chart-style.ts`): só cores prontas — as variáveis com prefixo do tema (`--color-foreground`,
  `--color-muted-foreground`, `--color-border`, `--color-card`) ou as de gráfico (`--chart-*`). As variáveis base
  (`--foreground`, `--border`…) guardam só os números do HSL e, num `fill`/`stroke`, deixavam o texto preto e o
  teto sem desenho (achado da prévia de 17/11). Teto de 100%: `--color-foreground` com opacidade 0,7 e 1,5 px,
  contra a grade em `--color-border` a 0,5 e 1 px; a marca "Teto mensal" da legenda usa a mesma cor do teto.
- Estados: skeleton com a mesma estrutura (`GoUsageSkeleton`, constantes de `layout.ts`), chave não
  configurada (atalho para a integração), filtro sem assinatura, erro com "Tentar novamente" e selo
  "Desatualizado" quando a última leitura passa de 15 min.
