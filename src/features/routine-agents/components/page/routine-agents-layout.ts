/**
 * Classes da lista `/agentes-rotineiros` (OPE-130, D18), compartilhadas com o skeleton para o
 * carregamento ter a mesma estrutura das linhas: identificação | KPIs | gráfico.
 */
export const ROUTINE_ROW_GRID = "grid gap-4 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)] lg:items-center"
export const ROUTINE_ROW_KPIS = "grid grid-cols-2 gap-2"
export const ROUTINE_ROW_KPI_HEIGHT = "h-[68px]"
/** Altura da área do gráfico da linha (px). */
export const ROUTINE_ROW_CHART_HEIGHT = 150
export const ROUTINE_ROW_CHART_CLASS = "h-[150px]"
export const ROUTINE_ROWS_GAP = "space-y-3"

/**
 * Visão geral da página do agente (OPE-160): métricas à esquerda e a conversa à direita, recolhível.
 * Compartilhadas com o skeleton (`RoutineOverviewSkeleton`).
 */
export const ROUTINE_OVERVIEW_GRID = "flex flex-col gap-4 lg:flex-row lg:items-start"
export const ROUTINE_OVERVIEW_MAIN = "min-w-0 flex-1 space-y-4"
/** Larguras da coluna da conversa (px) a partir de `lg`. */
export const ROUTINE_CHAT_EXPANDED_WIDTH = 440
export const ROUTINE_CHAT_COLLAPSED_WIDTH = 56
export const ROUTINE_CHAT_MEDIA_QUERY = "(min-width: 1024px)"
/** Caixa da conversa: altura da área visível, presa ao topo ao rolar as métricas. */
export const ROUTINE_CHAT_PANEL = "flex shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm lg:sticky lg:top-4 lg:h-[min(calc(100dvh-9rem),60rem)] lg:min-h-[28rem]"
/** Abaixo de `lg`: expandida com altura fixa; recolhida vira uma barra compacta. */
export const ROUTINE_CHAT_PANEL_EXPANDED = "h-[32rem] flex-col"
export const ROUTINE_CHAT_PANEL_COLLAPSED = "h-12 flex-row lg:flex-col"
