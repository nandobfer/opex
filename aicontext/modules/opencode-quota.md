# Quota do OpenCode (`src/features/opencode-quota`)

Painel **Quota do OpenCode** na coluna "Tarefas" da Central de desenvolvimento (`/desenvolvimento`),
logo abaixo da busca. Mostra os limites que o plugin
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
- Cada janela (`QuotaWindowBar`): rótulo, "reinicia em 2 h 15 min" (`formatResetIn`, relógio de
  30 s; dica com data/hora exata), % usado com `AnimatedNumber` e barra `role="progressbar"`.
- **Cores por uso** (tokens): `< 60%` `success`, `60–84%` `warning`, `≥ 85%` `destructive`.
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
- Tempo real: `useOpencodeQuotaRealtime` invalida a consulta no evento; a reconexão do Pusher refaz as
  consultas ativas (`useRealtimeConnection`). Sem polling no cliente.
