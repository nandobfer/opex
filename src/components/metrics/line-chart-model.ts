import { dashPattern, lineStyleAt, type SeriesDash } from "./charts/palette"
import type { MetricValueFormat } from "./format"

/**
 * Modelo puro do gráfico de várias linhas das métricas (`MultiLineChart`, OPE-122):
 * - cor e traço fixos por série: a série com significado traz a própria cor e o próprio traço (OPE-141,
 *   decisão do dono: cores por significado, porte do MT-40 do my-tasks; ver
 *   `features/agent-metrics/series-style.ts`); sem significado, vale a posição na lista completa
 *   (marcar/desmarcar não troca cores);
 * - eixo de porcentagem de 0 a 100 (só cresce quando um valor passa de 100 de verdade);
 * - amostra (n) por bucket e ponto pouco representativo (n abaixo do mínimo).
 * Decisão do dono (revisão do plano da OPE-122): nos buckets sem dados a linha é contínua e liga os
 * pontos vizinhos (`connectNulls`); o bucket vazio continua sem ponto (`null`, nunca 0%).
 */

export interface LineSeriesInput {
    key: string
    label: string
    defaultSelected: boolean
    /** Cor por significado (token `var(--chart-…)`); sem ela, a cor vem da posição. */
    color?: string
    dash?: SeriesDash
}

export interface LineSeriesItem {
    key: string
    label: string
    color: string
    dash: string | undefined
}

export interface LineSample {
    bucket: string
    base: number
    bySeries: Record<string, number>
}

export function lineSeriesItems(series: readonly LineSeriesInput[]): LineSeriesItem[] {
    return series.map((item, index) => ({ key: item.key, label: item.label, ...(item.color ? { color: item.color, dash: dashPattern(item.dash) } : lineStyleAt(index)) }))
}

const PERCENT_TICKS = [0, 25, 50, 75, 100] as const

/** Eixo Y: porcentagem fixa em 0–100 (marcas de 25 em 25); acima de 100, sobe até a próxima marca. */
export function valueAxis(points: readonly Record<string, unknown>[], keys: readonly string[], format: MetricValueFormat): { domain: [number, number | "auto"]; ticks: number[] | undefined } {
    if (format !== "percent") return { domain: [0, "auto"], ticks: undefined }
    let max = 0
    for (const point of points) for (const key of keys) if (typeof point[key] === "number" && (point[key] as number) > max) max = point[key] as number
    if (max <= 100) return { domain: [0, 100], ticks: [...PERCENT_TICKS] }
    const top = Math.ceil(max / 25) * 25
    return { domain: [0, top], ticks: Array.from({ length: top / 25 + 1 }, (_, index) => index * 25) }
}

/** n da série no bucket (ou a base do bucket quando a série não informa). */
export function sampleOf(sample: LineSample | undefined, key?: string): number {
    if (!sample) return 0
    return key && key in sample.bySeries ? sample.bySeries[key]! : sample.base
}

/** Ponto pouco representativo: tem valor, mas a amostra é menor que o mínimo. */
export function isSmallSample(n: number, minSample: number | null): boolean {
    return minSample !== null && n > 0 && n < minSample
}
