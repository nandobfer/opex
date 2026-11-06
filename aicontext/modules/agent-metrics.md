# Módulo: Agentes — páginas e métricas (OPE-122)

A categoria **Agentes** da sidebar lista todos os agentes de IA do Opex. Cada agente tem uma página
com **Visão geral** (KPIs e gráficos), **Histórico** (agentes novos), as abas próprias e o botão
**Configurar**. Objetivo: achar gargalos e pontos fracos do loop de desenvolvimento agêntico.

## Catálogo (`src/features/agent-metrics/catalog.ts`)

`AGENT_CATALOG` é a fonte única da sidebar (`APP_NAV`, grupo `agentes`), das abas de
`/integracoes/ia` (`src/features/ai/tabs.ts`, depois de Provedores) e do cabeçalho das páginas. A ordem
segue o fluxo de trabalho; `navLabel` (sidebar e aba) não leva "Agente", `title` (cabeçalho) leva.

| Agente | Página | Aba de configuração | Filtros | Abas da página |
|---|---|---|---|---|
| Opex | `/agente-opex` | `agente-opex` | cliente | Visão geral, Histórico, Memórias |
| Maddox | `/agente-maddox` | `agente-maddox` | cliente | Visão geral, Histórico, Memórias |
| Orçamentista | `/agente-orcamentista` | `orcamentista` | cliente, repositório, margem | Visão geral, Histórico |
| Catalogador | `/agente-catalogador` | `catalogador` | cliente, repositório | Visão geral, Histórico |
| Refinador | `/agente-refinador` | `refinar-tarefa` | cliente, repositório | Visão geral, Histórico |
| Desenvolvedor | `/agente-desenvolvedor` | `desenvolvimento-agentico` | cliente, repositório | Visão geral, Histórico, Memórias |
| Arquiteto | `/agente-arquiteto` | `agente-arquiteto` | cliente, repositório | Visão geral, Histórico, Memórias |
| Adversário | `/agente-adversario` | `agente-adversario` | cliente, repositório | Visão geral, Revisões, Memórias |
| Revisor | `/agente-revisor` | `revisao-pr` | cliente, repositório | Visão geral, Revisões |
| Mentor | `/agente-mentor` | `agente-mentor` | cliente, repositório | Visão geral, Execuções |
| Rotineiros (OPE-130) | `/agentes-rotineiros` (lista) e `/agentes-rotineiros/[id]` | `rotineiros` | período | Visão geral, Execuções, Entradas, Memórias (por agente rotineiro) |

O item **Rotineiros** (`id: "rotineiros"`, título "Agentes rotineiros") abre a lista dos agentes rotineiros; cada um tem a própria página sobre a moldura compartilhada `AgentPageFrame` (`src/components/list/AgentPageFrame.tsx`, extraída da `AgentPage`, que passou a usá-la). O cabeçalho das páginas de agente (`AgentPageHeader`) põe "Configurar" e as ações na linha do título, sempre juntos e sem quebrar entre si, com a descrição abaixo na largura inteira (OPE-130, D19); `onSettings` troca o link do "Configurar" por um botão (a página do rotineiro abre o editor ali mesmo). As métricas do catálogo (`routineMetrics`, fonte `routineRuns` no `agent-usage-daily`) somam todas as execuções; a Visão geral de cada agente vem de `GET /api/routine-agents/[id]/metrics`. Ver `modules/routine-agents.md`.

O item de chat do Agente Opex/Maddox no rodapé da sidebar continua (é o chat; a página é das métricas).

## Página (`AgentPage`, `src/features/agent-metrics/components/`)

- **Cabeçalho** (`AgentPageHeader`): ícone, "Agente X", descrição, **Configurar** (aba do agente em
  `/integracoes/ia`, `agentSettingsHref`) e ações extras (ex.: "Revisar PR").
- **Aviso de disponibilidade** (`AvailabilityNotice`) quando o agente está desligado ou sem provedor:
  nas páginas novas vem da Visão geral (`availability`, mesma regra da aba de configuração; os agentes
  fundidos ficam disponíveis se qualquer feature estiver); nas antigas, do hook de configuração delas.
- **Abas na URL** (`?aba=`, `OptionTabs` + `AnimatePresence mode="wait"`): **Visão geral** primeiro e
  padrão (omitida da URL); depois **Histórico** (`historico`, agentes novos) e as abas próprias
  (`revisoes`, `execucoes`, `memorias`). As listas e filtros das abas antigas não mudaram.
- **Filtros na URL** (`?periodo=&de=&ate=&clientes=&repositorios=&margem=`, `AgentFiltersBar` sobre o
  `MetricsFiltersBar` compartilhado, fundo do card): período **7 dias, 30 dias (padrão), 90 dias,
  12 meses ou personalizado** (intervalo com o `PresetDateRangeFilter`), **Clientes** e
  **Repositórios** combináveis. Filtro que não se aplica ao agente fica oculto (Opex e Maddox não têm
  repositório). Valem para a Visão geral e o Histórico. Item sem cliente ou sem repositório sai do
  resultado quando o filtro correspondente está ativo. A margem (±%) é só do Orçamentista: padrão 20;
  vazia, negativa, acima de 100 ou inválida volta a 20 (`parseMargin`).
- **Visão geral** (`AgentOverviewTab`):
  - KPI **Último uso** (`LastUsedKpi`): data e hora `dd/MM/yyyy HH:mm` e o tempo relativo abaixo
    (`formatRelativePast`: "há 3 dias", "há 2 semanas", "há 4 meses"); sem uso, **"Nunca usado"**.
    Ignora período e filtros.
  - KPIs do agente (`KpiCard` com `AnimatedNumber`); sem base, **"—"** (nunca 0%). Métrica não
    retroativa mostra "Dados desde dd/mm/aaaa" no cartão e no aviso do topo (`DataSinceNotice`);
    aproximada no passado mostra "Aproximado antes de dd/mm/aaaa".
  - **KPIs das execuções** (OPE-141, porte do `runKpis` do MT-40 do my-tasks; `runKpis` em
    `logic/common.ts`, DTO `runKpis`): **Execuções**, **% de falhas**, **Custo** (soma), **Tokens**
    (soma, entrada + saída) e **Duração média** (minutos) das execuções do período em `agent_runs`
    (`runTotalsOf`, com os filtros de cliente e repositório; execuções excluídas não contam). Sem
    registro de custo, tokens ou duração, ou sem execuções no caso da % de falhas, **"—"** (nunca 0).
    Aparecem **mesmo sem base** no período, depois dos KPIs do agente. Decisão do dono: quando o agente
    já mostra um KPI com o mesmo significado, fica o dele e o comum não se repete (`RUN_KPIS_COVERED`
    em `server/metrics.ts`): Revisor sem Duração média e % de falhas, Mentor e Catalogador sem % de
    falhas, Agentes rotineiros sem Execuções e % de falhas. O esqueleto mostra 10 cartões
    (`OVERVIEW_SKELETON_KPIS`).
  - **Gráfico de linhas único** por agente com as porcentagens ao longo do tempo (eixo X = data, uma
    linha por métrica; `MultiLineChart`): a legenda tem uma **caixa de seleção por linha**; a seleção
    fica salva no navegador por gráfico (`usePersistentState`, chave
    `opex:metrics:lines:<agente>:<gráfico>:v2`; a `v2` descartou as escolhas da `v1` para todos
    abrirem com o padrão novo); todas desmarcadas → "Selecione ao menos uma métrica". Ao abrir, no
    máximo 3 linhas vêm marcadas (as principais de cada agente; ver abaixo). Desenho (modelo puro em
    `src/components/metrics/line-chart-model.ts`):
    - **cor e traço por significado** (decisão do dono na OPE-141, porte do MT-40 do my-tasks;
      módulo puro `series-style.ts`, aplicado no servidor por `styleLineChart`): a mesma métrica tem a
      mesma cor e o mesmo traço em todos os agentes — positivas em verde/azul (`--chart-positive-1/2`:
      one shot, concluídas, com resumo, dentro da margem, 1ª aprovação em verde; CI corrigido, tags,
      aprovados, sugestões aceitas em azul), informativas em roxo/rosa/branco (`--chart-info-1..3`:
      lições, ações confirmadas, nós; interrompidas, retomadas, ligações) e negativas por criticidade,
      vermelho > laranja > amarelo (`--chart-negative-1..3`: regressão e falhas em vermelho; bloqueio,
      correção de prévia e erro médio em laranja; conflito, CI com falha, nova tentativa e prévias
      corrigidas em amarelo). Linhas da mesma cor no mesmo gráfico se diferenciam pelo traço (cheio,
      tracejado `6 3`, pontilhado `2 3`: regressão cheia, reabertas tracejada, achado de regressão
      pontilhada). Só do Opex: bloqueios ignorados (`ignored`) e erros dos rotineiros (`errors`) em
      vermelho; **Conversas por data** com Dono em roxo e Portal em rosa, ambos cheios (decisão do
      dono); **Tokens por data** em roxo. Achados por categoria do Adversário têm escala própria
      (`CATEGORY_STYLE`: segurança/bug/regressão em vermelho, dados/requisito/tratamento de erro em
      laranja, caso de borda/testes/regra do projeto em amarelo, design/consistência/estilo em branco).
      **Série sem significado** (chave fora do mapa) mantém a cor pela posição na lista completa do
      gráfico: `LINE_SERIES_COLORS` (`charts/palette.ts`, tokens `--chart-1..10`); acima de 10 séries a
      cor se repete com traço tracejado. A legenda e o tooltip mostram o mesmo traço (`LineSwatch`);
    - **linha suave** (`type="monotone"`): a curva passa por todos os pontos e, por ser monotônica
      entre dois deles, nunca ultrapassa os valores reais (sem "bicos" nem picos inventados). Decisão
      do dono na OPE-131, que substitui a linha reta (`type="linear"`) da OPE-122. O eixo de % é fixo
      em 0–100 (marcas de 25) e só cresce quando um valor passa de 100 de verdade (ex.: erro da
      estimativa);
    - **dias sem dados**: o bucket sem base continua `null` (sem ponto, nunca 0%), e a **linha é
      contínua**, ligando os pontos vizinhos (`connectNulls`). Decisão do dono na revisão do plano da
      OPE-122, que substitui o critério original "dias sem dados quebram a linha" (a linha quebrada
      parecia sumir e aparecer). O tooltip do dia sem amostra diz "Sem <amostra> (n = 0)"; num dia com
      amostra em que as séries visíveis não têm base (ex.: "% de CI corrigido" sem CI falho, ou métrica
      não retroativa antes da data de início), diz "Sem base para as métricas selecionadas nesta data
      (n da data = N …)". O tooltip usa a moldura padrão `ChartTooltipFrame` de `ui/chart.tsx`;
    - **amostra (n)**: cada gráfico declara o que conta (`sampleLabel`, ex.: "mesas concluídas";
      `null` nos gráficos de soma, sem n). `percentSeries`/`valueSeries` gravam `n:<série>` junto do
      valor e `finalizeLineChart` separa isso em `samples` (`base` do bucket = maior n entre as séries;
      `mergeLineSeries` junta séries de bases diferentes). O eixo X mostra a data e `n=5`; o tooltip
      mostra a data ("Semana de dd/MM" no agrupamento semanal), "n = 5 mesas concluídas" e, por série
      visível com valor, o nome, o valor e o próprio n quando a base da série é outra (ex.: "% de CI
      corrigido", só mesas com CI falho); a tabela acessível tem a coluna n. Ponto com n abaixo de 3
      (`MIN_RELIABLE_SAMPLE`) sai **vazado** (pouco representativo), com a nota no tooltip e a
      explicação abaixo do gráfico.
  - **Uso por data** (`UsageByDateChart`): execuções (roxo, `SINGLE_MEASURE_COLOR`) e falhas
    (vermelho, `--chart-negative-1`) por dia, semana ou mês (OPE-141).
  - Distribuições em barras (`RankedBarsCard`): categorias, ferramentas, destinos, tags, etapas. Barras de
    uma medida só ficam em **roxo contínuo** (`SINGLE_MEASURE_COLOR`); o **Destino das lições** do Mentor
    tem cor por lista (`styleBarChart`: Adversário roxo, Desenvolvedor global rosa, por central branco;
    `color` de cada item, desenhada com `colorKey` no `RankedBarsCard`).
  - Agrupamento: por dia até 31 dias, por semana até ~6 meses, por mês acima disso.
  - Estados: esqueleto com a mesma grade (`MetricsOverviewSkeleton`, classes de
    `src/components/metrics/layout.ts`), erro com **Tentar novamente**, sem base no período →
    estado vazio que explica o motivo (Último uso e Uso por data continuam).
- **Histórico** (`AgentHistoryTab`, `InfiniteListView`): a lista das execuções do período com os
  mesmos filtros; cada linha leva ao item de origem:

  | Agente | Lista | Link |
  |---|---|---|
  | Desenvolvedor | mesas com atividade no período | `/desenvolvimento/<tarefa>` |
  | Refinador | refinamentos iniciados | `/tarefas/<tarefa>` |
  | Arquiteto | versões de diagrama | `/desenvolvimento/<tarefa>` |
  | Opex e Maddox | conversas (registro durável) | `/agente-<opex|maddox>/conversas/<id>` |
  | Orçamentista e Catalogador | execuções | `/tarefas/<tarefa>` (sem tarefa: sem link) |

  A conversa abre **só para leitura** para o dono, inclusive a do portal (`ConversationViewer`,
  `GET /api/agents/conversations/[id]`, sem reconciliar nem alterar a sessão). Conversa apagada pela
  retenção aparece como **"Conversa removida pela retenção"**, sem link.
- **Tempo real** (`useAgentMetricsRealtime`): os eventos que já existem de cada agente
  (`agentic-updated`, `adversarial-review-updated`, `adversarial-mentor-updated`, `pr-review-updated`,
  `refinement-updated`, `architect-diagram-updated`, `opex-/maddox-session-*`, `tasks-updated`,
  `orcamentos-updated`, `ai-consumption-updated`) e o `agent-metrics-updated` (`{ agents }`, publicado
  pela rotina) invalidam a Visão geral e o Histórico, agrupados em 1 s.

## Métricas (servidor)

Calculadas em `GET /api/agents/[agent]/metrics` (`withRoute`, Zod `agentMetricsQuerySchema`, só o
dono): `server/metrics.ts` monta o bloco comum (Último uso, Uso por data, opções dos filtros,
disponibilidade) e chama o cálculo do agente (`server/developer.ts`, `server/agents.ts`), que carrega
os documentos e usa as **regras puras** de `logic/` (`developer.ts`, `agents.ts`, `common.ts`). Antes
de calcular, sincroniza as execuções recentes do agente (no máximo a cada 30 s, `ensureFreshRuns`).
Mesa excluída e tarefa arquivada saem das métricas (os eventos gravados ficam para auditoria). Fuso
fixo **America/Sao_Paulo** (`METRICS_TIME_ZONE`) para os dias, os eventos e os buckets.

### Agente Desenvolvedor

Base: mesas **concluídas** no período, pela data da última conclusão (`completedAt`: a mesa reaberta e
concluída de novo conta uma vez). Mesa aberta fica fora da base (o uso dela aparece em Uso por data).

| Métrica | Definição | Fonte |
|---|---|---|
| % de regressão | Ao menos um dos três casos abaixo | — |
| ↳ % reabertas | Reaberta depois de concluída | `pastPrs`, mensagem "Mesa reaberta:" e evento `reopened` |
| ↳ % com achado de regressão | O Adversário apontou achado da categoria `regression` | `adversarial_reviews` |
| ↳ % com correção de prévia | Ao menos um pedido de correção da prévia | evento `correction` (`preview`); antes dele, classificação retroativa (abaixo) |
| % de bloqueio pelo Adversário | Ao menos uma rodada com achado bloqueante | `adversarial_reviews` |
| % de lições do Mentor | Ao menos uma memória criada ou editada pelo Mentor a partir dela | `adversarial_mentor_runs` |
| % de one shot | Uma versão de plano só e nenhuma correção (plano, prévia ou PR) | `plans` + eventos |
| % de conflito de merge | Ao menos uma resolução de conflito | turno `resolving_conflicts` e evento `conflict` |
| Ciclos de correção por mesa | Média de correções de plano + prévia + pedidos do PR | idem |
| % de CI com falha / % corrigido | Mesas com CI falho / entre essas, as que voltaram a passar depois da correção automática | turno `fixing_ci`, eventos `ci-failed` e `ci-fixed` (não retroativo) |
| Tempo de mesa | Média da abertura (`startedAt`) ao merge (`pr.mergedAt`); por etapa, em barras | eventos `stage-entered` (não retroativo) |
| % interrompidas / retomadas / com nova tentativa | Ao menos uma interrupção pedida pelo dono / uma reconexão / um "Tentar novamente" | eventos (interrupção e retomada não são retroativas; nova tentativa também pelas mensagens) |
| Custo e tokens por mesa | Média das mesas com registro | `usage` da mesa |

Classificação retroativa das correções (`classifyLegacyCorrections`): cada versão de plano depois da
primeira é uma correção; houve "Pedido de mudança no PR" entre a versão anterior e esta → PR; a mesa saiu
do planejamento nesse intervalo (implementou, revisou, gerou prévia ou PR) → prévia; senão → plano.
Depois da data dos eventos `correction`, vale o tipo exato. O gráfico traz todas as porcentagens, na
ordem `DEVELOPER_LINE_ORDER` (as subdivisões da regressão como "Regressão: % reabertas"…); ao abrir,
vêm marcadas só regressão, bloqueio pelo Adversário e one shot (`DEVELOPER_DEFAULT_LINES`).

Linhas marcadas ao abrir nos demais gráficos: Orçamentista (dentro da margem e aprovados),
Catalogador (com resumo e com tags), Revisor (aprovação na 1ª revisão e sugestões aceitas),
Adversário/categorias (as 3 primeiras); Mentor, Opex, Maddox e Arquiteto têm 2 linhas por gráfico,
ambas marcadas.

### Demais agentes

- **Orçamentista**: erro médio da estimativa (`|real − estimada| ÷ estimada` de `estimate.hours`
  contra as horas apontadas, só tarefas concluídas no período — conclusão pela auditoria, como no
  Financeiro; sem estimativa, estimativa 0 ou sem horas reais fica fora), % dentro da margem, % de
  orçamentos aprovados (rascunhos **do portal** com prévia, criados no período, que viraram tarefa
  aprovada) e % de prévias corrigidas (pedido de correção antes do envio; campo `correction` ou evento
  `budget-correction-requested`).
- **Catalogador**: cobertura (% das tarefas não arquivadas criadas no período com resumo e com tags),
  tags por tarefa (média sobre todas essas tarefas) e as 10 mais usadas em barras, % de falhas das
  gerações de resumo ou de tags (as falhas de tags passaram a ser registradas: "Dados desde").
- **Refinador** (não retroativo: o refinamento é apagado no recomeço e não guardava a aplicação): %
  concluídos sem abandono (chegaram à especificação final, contra os recomeçados ou excluídos antes
  dela; em andamento fica fora), perguntas por refinamento (campos dos formulários) e tempo do início
  até a especificação aplicada.
- **Arquiteto**: média de nós e de ligações e duração média da geração das versões concluídas.
- **Adversário**: % de bloqueio (rodadas com achado bloqueante), achados por categoria (barras e
  linhas ao longo do tempo), rodadas por mesa e % de bloqueios ignorados (`decision: "skipped"`).
- **Revisor**: % de aprovação na 1ª revisão de cada PR, achados por revisão (campo `findings` do bloco
  JSON da revisão: "Dados desde"), % de sugestões aceitas — pedido de mudança seguido de "Replanejar
  com o pedido do PR" (evento `pr-review-replanned`, ligado à revisão) conta como aceita; PR mergeado
  sem isso, descartada; PR fechado sem merge não entra. Antes do evento, aproximação por PR (o contador
  `autoReviewReplans` da mesa), com o aviso "Aproximado antes de" —, duração média e % de falhas.
- **Mentor**: % de lições registradas (criadas + editadas contra descartadas + não registradas),
  memórias criadas e editadas, destino (Adversário, Desenvolvedor global ou por central; sem destino
  = Adversário) e % de falhas.
- **Opex e Maddox** (cada um na sua página): conversas por data (dono × portal), mensagens por
  conversa, ferramentas mais usadas com % de falha, % de ações destrutivas confirmadas contra
  canceladas, tokens por conversa e por data e custo (só quando houver registro; o Opex não grava
  custo → "—").

## Persistência (`src/lib/db/models/AgentMetrics.ts`, sem expiração)

- `agent_runs`: uma execução por documento, idempotente por `dedupKey` vinda do id de origem.
  Sincronizada das fontes do app (`server/sync.ts`): turnos das mesas (`agentic_events` `turn-end`),
  rodadas do Adversário, revisões de PR, execuções do Mentor, versões de diagrama, respostas do Opex e
  do Maddox, `ai_usage_logs` (Estimar prazos, Resumos, Tags) e `ai_consumption_logs` (Orçamentos e o
  passado das demais; o limite entre um e outro é fixado na primeira sincronização para não contar
  duas vezes). O Refinador grava uma execução no fim de cada turno.
- `agent_metric_events`: fatos gravados no momento em que acontecem (`server/record.ts`, sem bloquear o
  fluxo — falha vira aviso no log): `stage-entered` (`update()` da mesa), `reopened`, `interrupted`,
  `resumed`, `retried`, `correction` (`plan`/`preview`/`pr`), `ci-failed`, `ci-fixed`, `conflict`,
  `pr-review-replanned`, `refinement-started`/`-questions`/`-completed`/`-abandoned` e
  `budget-correction-requested`.
- `agent_conversations`: estatística durável de cada conversa do Opex e do Maddox (mensagens,
  respostas com erro, ferramentas, confirmações, tokens); antes de a retenção (ou a exclusão) apagar a
  conversa, a estatística é gravada e marcada com `purgedAt`.
- `agent_usage_days`: resumo diário de uso por agente, dia (São Paulo), cliente e repositório
  (execuções, falhas, tokens, custo e duração). A Visão geral usa os dias fechados daqui e o dia de
  hoje ao vivo das execuções.
- `agent_metric_tracking`: "Dados desde" de cada fato não retroativo, gravado uma vez na primeira
  subida (migração `agent-metrics-tracking-start`, `$setOnInsert`).
- **Rotina** `agent-usage-daily` (Crons, a cada 60 min, `server/usage-daily.ts`): na primeira execução
  faz o **backfill retroativo** (execuções e conversas desde o início e os resumos de todos os dias) e
  marca `backfill`; depois sincroniza e recalcula os últimos 3 dias. Publica `agent-metrics-updated`.

## APIs (só o dono, por sessão; não são endpoints públicos)

| Rota | Uso |
|---|---|
| `GET /api/agents/[agent]/metrics?periodo&de&ate&clientes&repositorios&margem` | Visão geral (`AgentMetricsDto`) |
| `GET /api/agents/[agent]/history?…&page&limit` | Histórico paginado (agentes novos; os demais → 404) |
| `GET /api/agents/conversations/[id]` | Conversa do Opex/Maddox só para leitura |

## Componentes compartilhados (`src/components/metrics/`)

Extraídos dos Dashboards (que passaram a usá-los): `charts/` (`ChartCard`, `TrendLineChart`,
`BarsChart`, `RankedBarsCard`, `DonutChart`, `EmptyChart`, `ChartDataTable`, `palette`), `KpiCard` e
`KpiGrid`, `formatBucketLabel` e `formatMetricValue`; novos: `LastUsedKpi`, `MultiLineChart` +
`SelectableLegend` (com `line-chart-model.ts`, `LineChartTooltip`, `SampleAxisTick`, `line-dots.tsx` e
`LineSwatch`), `UsageByDateChart`, `MetricsFiltersBar`, `DataSinceNotice` e
`MetricsOverviewSkeleton`. Buckets de tempo em `src/lib/time/buckets.ts` (também dos Dashboards).

## Testes

`__tests__/features/agent-metrics/` (`period`, `developer-logic`, `agents-logic`, `record` — falha do
banco não rejeita, rotina e marcadores —, `routes`, `agent-page` — KPIs das execuções também sem base —,
`series-style` — cor por significado — e `run-kpis` — somas, "—" e o que cada agente já cobre), `__tests__/components/metrics/`
(legenda selecionável salva no navegador, "Selecione ao menos uma métrica", "—" e Último uso;
`line-chart-model` — cores e traços únicos, eixo 0–100, amostra pequena; `multi-line-chart-lines` —
recharts simulado: cores do print, cor por significado (OPE-141), linha suave e contínua, marcador vazado, tooltip com n e esqueleto),
`__tests__/features/layout/navigation.test.ts` (10 agentes, ordem, nomes e ícones iguais às abas,
página de cada um) e `__tests__/features/ai/ai-tabs.test.tsx`.
