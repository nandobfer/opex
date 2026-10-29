# Quota do OpenCode (`src/features/opencode-quota`)

Painel **Quota do OpenCode** na coluna "Tarefas" da Central de desenvolvimento (`/desenvolvimento`),
logo abaixo da busca. Mostra os limites que o plugin
[`@slkiser/opencode-quota`](https://github.com/slkiser/opencode-quota), instalado no servidor do
OpenCode, já calculou: o percentual usado de cada janela (5h, semanal, mensal…) e o tempo até o reset.

## Fonte dos dados

- O Opex **não consulta provedores**: lê o que o plugin já guardou, no formato público de export
  (versão 3; a versão 2 do plugin 5.x também é aceita). Duas origens, nesta ordem:
  1. **Snapshot do plugin** (`opencode-quota show --json`): a **última quota conhecida** de cada
     provedor, a mesma que o TUI desenha (`~/.local/state/opencode/opencode-quota/snapshot-v6.json`).
     Provedor que falhou na última verificação (ex.: 429 da Anthropic) vem `partial`, com as janelas
     guardadas e o erro. Roda o executável já instalado pelo OpenCode (o mais recente em
     `${XDG_CACHE_HOME:-~/.cache}/opencode/npm/@slkiser/opencode-quota@*/…/dist/bin/opencode-quota.js`),
     com o `node` do PATH do host, a partir do `$HOME`; nunca `npx`. ~1 s de CPU, sem rede.
  2. **Arquivo de export** (`quota-export.json`), reserva quando não há executável, `node` ou o
     comando falha. Ele grava **só a verificação atual**: provedor que falhou vem só com o erro.
- A leitura roda **no host do OpenCode** (fora do container do app) pelo shell do `@opencode/client`
  (`createHostRunner` com `retryOnLost` e `quiet`; falhas, mudanças e troca de origem vão para o
  debug da integração `ai_opencode`). Comando em `commands.ts` (`quotaReadCommand`): a primeira linha
  diz a origem (`__OPENCODE_QUOTA_SNAPSHOT__` ou `__OPENCODE_QUOTA_EXPORT__`); na reserva
  (`quotaExportCommand`) vem o arquivo ou o marcador `__OPENCODE_QUOTA_MISSING__`.
- Caminho do export: padrão do plugin `${XDG_CACHE_HOME:-$HOME/.cache}/opencode/quota-export.json`, ou o campo
  público opcional **"Arquivo de quota (opencode-quota)"** (`quotaExportPath`) da integração OpenCode
  (absoluto ou `~/…`; outro formato vira estado de erro). Sem `.env`.
- **Pré-requisito no OpenCode**: plugin 6.x com o export ligado (`/quota_status` › Plugin › "Quota
  file (JSON)" ou `{"system": {"exportFile": true}}` em `~/.config/opencode/opencode-quota/settings.jsonc`).
  O serviço do OpenCode regrava o arquivo sempre que a quota muda.

## Servidor

- `server/service.ts`: `refreshOpencodeQuota()` lê, valida com Zod tolerante (`schemas.ts`) e
  normaliza (`normalizeQuotaExport`, `logic.ts`); leituras simultâneas compartilham a mesma promessa.
  O último resultado fica **em memória** (`globalThis`, sem coleção); `getOpencodeQuota()` devolve-o
  ou lê na hora quando ainda não há (ex.: depois de reiniciar).
- **Última leitura boa por provedor** (vale sobretudo para a reserva do export, que grava só a
  verificação atual: um 429 da Anthropic vira `{ status: "error", error }` sem linhas; o snapshot já
  traz as janelas guardadas). `keepLastGoodWindows` mantém as janelas da última leitura `ok` (`lastGood`, em memória)
  do provedor que veio sem linhas, como `partial` com o erro atual de aviso, **sem limite de tempo**
  até uma leitura boa dele. Só mescla quando o arquivo foi lido; falha ao ler o arquivo não apaga a
  memória; provedor que sumiu do export não volta. Depois de reiniciar, a primeira leitura com erro
  mostra só o erro.
- Estados (`OpencodeQuotaDto.state`): `ok`, `missing` (export desligado), `unconfigured` (integração
  OpenCode sem URL — não roda comando), `error` (OpenCode inacessível, JSON inválido ou formato não
  reconhecido, com a versão na mensagem).
- **Rotina `opencode-quota-refresh`** (Integrações › Crons, 5 min, ligada): relê e, só quando o que a
  tela mostra muda (`quotaHash`: estado, mensagem e provedores, sem os instantes de leitura/export),
  publica `opencode-quota-updated` em `private-app` com `{ checkedAt }`.
- Rotas: `GET /api/opencode/quota` (último resultado) e `POST /api/opencode/quota/refresh` (relê
  agora; botão "Atualizar" e "Tentar novamente").

## Normalização

- Provedores `unavailable` (ou sem linhas e sem erros) somem; `ok`, `partial` e `error` aparecem,
  agrupados, na ordem do export. Erros (`error`/`errors`) aparecem discretos sob o provedor (âmbar no
  parcial, vermelho na falha).
- Janelas **sem lista fixa**: toda linha `percent` vira barra (`usedPercent = 100 − percentRemaining`,
  inteiro 0–100); linhas `value` (saldo, "Enabled") mostram só o texto.
- Nome do provedor: mapa `QUOTA_PROVIDER_NAMES` → texto antes de "(conta)" → prefixo comum das
  linhas → id. Rótulo da janela: o nome da linha sem provedor/conta (ou sem o grupo `[…]` da v2),
  com reserva em `window`/id; `Weekly`/`Monthly`/`Daily`… viram Semanal/Mensal/Diária.

## Interface

- `OpencodeQuotaPanel` (recolhível; preferência `{ collapsed, collapsedProviders }` em
  `opex:opencode-quota-panel:v1`, `usePersistentState`; nasce expandido; o formato antigo
  `{ collapsed }` continua válido). O título é só "Quota do OpenCode"; o card recolhe/expande
  pelo título ou pela seta (botão de ícone "Recolher quota"/"Expandir quota").
- **Janela-resumo** (`summaryWindows`): uma por conta do provedor, na ordem do export — a primeira
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
- Selo **"Desatualizado"** depois de 30 min (`isQuotaStale` sobre `exportedAt`). Na origem snapshot,
  o `show --json` data o documento com a hora da leitura, então `exportedAt` passa a ser o `fetchedAt`
  mais recente entre os provedores (`snapshotFreshAt`): o selo aparece quando o OpenCode não verifica
  nenhum provedor há mais de 30 min. No export, é a hora do arquivo (não a idade das janelas mantidas
  de uma leitura boa anterior).
- Estados: skeleton ao carregar; `missing` com instruções para ligar o export; `unconfigured` com
  atalho para a integração; erro com "Tentar novamente"; "Nenhum provedor com quota". Falha da quota
  nunca esconde a lista de tarefas.
- Tempo real: `useOpencodeQuotaRealtime` invalida a consulta no evento; a reconexão do Pusher refaz as
  consultas ativas (`useRealtimeConnection`). Sem polling no cliente.
