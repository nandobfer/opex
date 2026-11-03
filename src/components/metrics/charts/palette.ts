/** Paleta dos gráficos: só variáveis do tema (nunca cor fixa no código). */
export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"] as const

export function colorAt(index: number): string {
    return CHART_COLORS[index % CHART_COLORS.length]!
}

/**
 * Cores das linhas das métricas (`MultiLineChart`), na ordem de maior contraste no fundo escuro: os
 * dois roxos (`--chart-1` e `--chart-2`) ficam nas pontas, longe um do outro.
 */
export const LINE_SERIES_COLORS = [
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-6)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-7)",
    "var(--chart-8)",
    "var(--chart-9)",
    "var(--chart-10)",
    "var(--chart-1)",
] as const

/** Traços das linhas: cheio até a 10ª série; depois, a cor se repete com outro tracejado. */
export const LINE_SERIES_DASHES = [undefined, "6 3", "2 3"] as const

export interface LineSeriesStyle {
    color: string
    dash: string | undefined
}

/** Cor e traço da série pela posição na lista completa do gráfico (não muda ao marcar/desmarcar). */
export function lineStyleAt(index: number): LineSeriesStyle {
    const colors = LINE_SERIES_COLORS.length
    return { color: LINE_SERIES_COLORS[index % colors]!, dash: LINE_SERIES_DASHES[Math.floor(index / colors) % LINE_SERIES_DASHES.length] }
}
