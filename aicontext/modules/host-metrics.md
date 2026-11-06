# Recursos do servidor (`src/features/host-metrics`)

Mostra CPU, RAM, swap e disco da **máquina do OpenCode** no painel **"Servidor e quota"** da barra
lateral do dono (OPE-145), com os mesmos números da TUI do plugin `opencode-htop`. Fora do escopo:
recursos do PC (Builder Machine), histórico/minigráfico, Prometheus/node_exporter e o portal do cliente.

> A medição é da máquina onde roda o `opencode serve` da integração OpenCode. Se a integração apontar
> para um servidor remoto, os números são os daquela máquina (sem aviso na tela).

## Fonte dos dados

- **Primária — RPC do plugin** `opencode-htop.stats` (`server/rpc.ts`, `client.rpc.call`, timeout 5 s,
  `location` = "Diretório das sessões" quando houver). Saída `{ cpu, memory, swap, disk }`, cada um
  `{ percent, used, total }` (bytes; na CPU, núcleos lógicos), validada por `hostMetricsSchema`.
- **Detecção**: `client.plugin.list()` (`isHtopPluginActive`: id/pacote `opencode-htop`, `features.rpc` e
  `state.status: "active"`), em cache por 60 s. Um erro do RPC (ou resposta inválida) marca o plugin como
  ausente até o cache expirar: a leitura cai para o shell na hora e o plugin reinstalado volta sozinho.
- **Fallback — shell do OpenCode** (`server/shell.ts`, `createHostRunner` com o debug da `ai_opencode`,
  `quiet`, `retryOnLost`, timeout 10 s): comando fixo `HOST_METRICS_SHELL_COMMAND` (duas linhas `cpu` de
  `/proc/stat` com 150 ms entre elas, `/proc/meminfo`, `df -B1 -P /` e `getconf _NPROCESSORS_ONLN`, com
  marcadores `@@…`). O parser puro `parseShellMetrics` faz a mesma conta do plugin (CPU por delta,
  `MemAvailable` com fallback, disco = total − livre para o usuário).
- A origem (`plugin`/`shell`) não aparece na tela: só no debug da integração `ai_opencode`, quando troca.

## Regras (`logic.ts`, puro)

- `normalizeHostMetrics`: percentuais limitados a 0–100; RAM ou disco com total 0 é leitura inválida
  (erro); swap com total 0 = servidor sem swap.
- Faixas pela regra compartilhada `usageLevel` (`src/components/metrics/usage-level.ts`): verde abaixo de
  60%, amarelo de 60% a 84%, vermelho a partir de 85%.
- `hostMetricsLevel` (bolinha do servidor): pior faixa entre CPU, RAM, disco e swap (só se houver swap);
  `null` (cinza) carregando, com estado `unconfigured`/`error`, sem leitura ou desatualizado.
- **Desatualizado** (`isHostMetricsStale`): sem leitura boa há mais de `staleAfterMs`, que é o maior entre
  30 s e `2 × intervalo da rotina + 5 s` (`staleAfterMsFor`). O servidor envia o prazo no DTO, pelo
  intervalo da rotina ligada (com o agendador ativo); rotina ou agendador desligados → 30 s.
- `hostMetricsHash`: estado, mensagem, prazo e percentuais **arredondados**.
- `formatBytes`: GB com 1 casa e TB a partir de 1.000 GB (pt-BR).

## Servidor

- `server/service.ts`: `refreshHostMetrics()` (single-flight: leituras simultâneas usam uma chamada só),
  `getHostMetrics()` (memória em `globalThis.__hostMetrics`; sem resultado — ex.: após reiniciar — lê na
  hora) e a rotina `runHostMetricsRefresh()`.
- DTO (`hostMetricsDtoSchema`): `{ state: "ok" | "unconfigured" | "error", message, metrics, checkedAt
  (última leitura boa), attemptedAt, staleAfterMs }`. Falha com leitura anterior mantém `metrics` e
  `checkedAt` da última boa. Sem URL do OpenCode → `unconfigured`, sem chamar nada.
- **Tempo real**: `host-metrics-updated` em `private-app` com o **DTO inteiro** (números, estado,
  `checkedAt`), publicado quando o hash muda **ou**, sem mudança, quando a última publicação tem 20 s ou
  mais (heartbeat, para o "desatualizado" não aparecer com números estáveis).
- **Rotina** `host-metrics-refresh` (Integrações › Crons, "Ler CPU, RAM, swap e disco do servidor
  (opencode-htop)"): nasce ligada, a cada **10 segundos** (intervalo em segundos — ver
  `modules/integrations.md`, "Crons e agendador interno"); o dono pode alterar.
- Rotas (só o dono, `withRoute`, `runtime = "nodejs"`; não são públicas por token):
  `GET /api/host-metrics` (último resultado) e `POST /api/host-metrics/refresh` (lê na hora).

## Interface

- **Item da barra lateral** `ServerQuotaSidebarItem` (rodapé do menu do dono, acima do Agente Opex; via
  `SidebarHoverButtonItem` de `src/features/layout/components/sidebar/`): ícone `Gauge`, tooltip e
  `aria-label` "Servidor e quota"; abre por hover (`useHoverPopover`), clique, toque e teclado
  (Enter/Espaço); não navega. Na gaveta do celular, a linha **"Servidor"** com o ícone e as bolinhas.
- **Bolinhas** (`StatusDots`): esquerda = servidor (`hostMetricsLevel`), direita = quota
  (`visibleQuotaLevel`, ver `modules/opencode-quota.md`); cor = token da barra (`bg-success`,
  `bg-warning`, `bg-destructive`) ou `bg-muted-foreground` sem dado confiável. Ficam vivas com o painel
  fechado (relógio de 5 s para o "desatualizado").
- **Painel**: `HostMetricsPanel` em cima e o próprio `OpencodeQuotaPanel` embaixo (mesma query, cache,
  preferência e evento de `/desenvolvimento`).
- **Bloco Servidor** (`HostMetricsPanel`): cabeçalho "Servidor", "Atualizado às HH:mm:ss", selo
  "Desatualizado" (`StaleBadge`) e botão "Atualizar" (`RefreshIconButton`); linhas `UsageBar` na ordem
  CPU (só %), RAM, Swap ("Sem swap" sem swap) e Disco, com "usado / total" em texto pequeno. Falha sem
  leitura anterior: "Não foi possível ler os recursos do servidor pelo OpenCode." com "Tentar novamente";
  sem URL: "Configure o OpenCode em Integrações para ver os recursos do servidor."; falha com leitura
  anterior: mantém as barras e marca desatualizado. Skeleton (`HostMetricsSkeleton`) com cabeçalho e
  quatro linhas, nas mesmas classes (`host-metrics-layout.ts`).
- Cliente (`hooks/useHostMetrics.ts`): GET só na carga inicial (`staleTime: Infinity`), POST no
  "Atualizar"; `useHostMetricsRealtime` grava o payload do evento no cache (validado pelo schema), sem
  nova consulta. **Sem polling no navegador**; várias abas recebem o mesmo evento.

## Riscos conhecidos

- O plugin refaz a amostra base da CPU quando a anterior passou de 10 s: com a rotina de 10 s, a CPU
  costuma medir uma janela de 150 ms (os números batem com a TUI, mas oscilam mais).
- Memória por processo: com mais de uma instância, só a que reivindica a rotina lê; as outras leem na
  hora no primeiro GET.

## Testes

`__tests__/features/host-metrics/{logic,service,host-metrics-routes}.test.ts` e
`__tests__/features/host-metrics/server-quota-sidebar.test.tsx`.
