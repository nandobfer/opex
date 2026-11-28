/**
 * Classes da lista `/agentes-rotineiros` (OPE-130, D18; OPE-213), compartilhadas com o skeleton para o
 * carregamento ter a mesma estrutura dos itens: identificação na largura inteira em cima; KPIs | gráfico embaixo.
 */
export const ROUTINE_ROW_CARD = "space-y-4 p-4"
/** Linha 1: identificação à esquerda e Pausar/Retomar à direita. */
export const ROUTINE_ROW_HEADER = "flex items-start gap-3"
/** Linha 2: KPIs e "Execuções por dia", lado a lado a partir de `xl`. */
export const ROUTINE_ROW_BODY = "grid gap-4 border-t pt-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-center"
/**
 * Doze KPIs em duas fileiras de seis (OPE-213): execuções, concluídas, com erro, tokens, tokens por execução e por
 * dia; custo efetivo e as médias efetivas, custo de tabela e as médias de tabela.
 */
export const ROUTINE_ROW_KPIS = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
export const ROUTINE_ROW_KPI_COUNT = 12
export const ROUTINE_ROW_KPI_HEIGHT = "h-[76px]"
/** Altura da área do gráfico (px): com o título, acompanha as duas fileiras de KPIs (2 × 76 px + espaço). */
export const ROUTINE_ROW_CHART_HEIGHT = 140
export const ROUTINE_ROW_CHART_CLASS = "h-[140px]"
export const ROUTINE_ROWS_GAP = "space-y-3"

/**
 * Visão geral da página do agente (OPE-160): métricas à esquerda e a conversa à direita, recolhível.
 * Compartilhadas com o skeleton (`RoutineOverviewSkeleton`).
 */
export const ROUTINE_OVERVIEW_GRID = "flex flex-col gap-4 lg:flex-row lg:items-start"
export const ROUTINE_OVERVIEW_MAIN = "min-w-0 flex-1 space-y-4"
/**
 * Visão geral (OPE-203): 11 KPIs (5 de execução + 6 de custo) e 4 gráficos — "Custo por dia" (linhas, largura toda),
 * execuções, tokens e a divisão do custo. O skeleton usa as mesmas quantidades.
 */
export const ROUTINE_OVERVIEW_KPI_COUNT = 11
export const ROUTINE_OVERVIEW_CHART_COUNT = 4
/** Larguras da coluna da conversa (px) a partir de `lg`. */
export const ROUTINE_CHAT_EXPANDED_WIDTH = 440
export const ROUTINE_CHAT_COLLAPSED_WIDTH = 56
export const ROUTINE_CHAT_MEDIA_QUERY = "(min-width: 1024px)"
/** Caixa da conversa: altura da área visível, presa ao topo ao rolar as métricas. */
export const ROUTINE_CHAT_PANEL = "flex shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm lg:sticky lg:top-4 lg:h-[min(calc(100dvh-9rem),60rem)] lg:min-h-[28rem]"
/** Abaixo de `lg`: expandida com altura fixa; recolhida vira uma barra compacta. */
export const ROUTINE_CHAT_PANEL_EXPANDED = "h-[32rem] flex-col"
export const ROUTINE_CHAT_PANEL_COLLAPSED = "h-12 flex-row lg:flex-col"
