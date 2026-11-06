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

/** Traço de uma série com cor por significado (OPE-141, porte do MT-40 do my-tasks). */
export type SeriesDash = "solid" | "dashed" | "dotted"

const DASH_PATTERNS: Record<SeriesDash, string | undefined> = { solid: undefined, dashed: "6 3", dotted: "2 3" }

export function dashPattern(dash: SeriesDash | null | undefined): string | undefined {
    return DASH_PATTERNS[dash ?? "solid"]
}

/**
 * Tons por significado (tokens de `globals.css`): positivo (verde, azul), informativo (roxo da
 * primária, rosa, branco/cinza-claro) e negativo por criticidade (vermelho, laranja, amarelo).
 */
export const SEMANTIC_COLORS = {
    green: "var(--chart-positive-1)",
    blue: "var(--chart-positive-2)",
    purple: "var(--chart-info-1)",
    pink: "var(--chart-info-2)",
    white: "var(--chart-info-3)",
    red: "var(--chart-negative-1)",
    orange: "var(--chart-negative-2)",
    yellow: "var(--chart-negative-3)",
} as const
export type SemanticTone = keyof typeof SEMANTIC_COLORS

/** Barras e somas de uma medida só (uso, ferramentas, tags, etapas, tokens): roxo contínuo. */
export const SINGLE_MEASURE_COLOR = SEMANTIC_COLORS.purple
