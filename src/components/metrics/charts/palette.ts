/** Paleta dos gráficos: só variáveis do tema (nunca cor fixa no código). */
export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"] as const

export function colorAt(index: number): string {
    return CHART_COLORS[index % CHART_COLORS.length]!
}
