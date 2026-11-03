"use client"

import { ChartTooltipFooter, ChartTooltipFrame } from "@/components/ui/chart"
import type { BucketMode } from "@/lib/time/buckets"
import { formatBucketLabel, formatMetricValue, type MetricValueFormat } from "./format"
import { isSmallSample, sampleOf, type LineSample, type LineSeriesItem } from "./line-chart-model"
import { LineSwatch } from "./LineSwatch"

/** Título do bucket no tooltip: "dd/MM", "Semana de dd/MM" ou "MMM/yy". */
export function formatBucketTitle(bucket: string, mode?: BucketMode): string {
    const label = formatBucketLabel(bucket)
    return mode === "week" ? `Semana de ${label}` : label
}

/** Texto do bucket sem valor nas séries visíveis: sem amostra nenhuma, ou com amostra mas sem base. */
export function emptyMessage(sampleLabel: string | null, base: number): string {
    if (sampleLabel === null) return "Sem dados"
    if (base === 0) return `Sem ${sampleLabel} (n = 0)`
    return `Sem base para as métricas selecionadas nesta data (n da data = ${base} ${sampleLabel})`
}

/**
 * Tooltip do gráfico de linhas: data, n do bucket ("n = 5 mesas concluídas") e uma linha por série
 * visível com valor (nome, valor e, quando a base da série é outra, o n dela). Bucket sem nenhuma
 * amostra mostra "Sem <amostra> (n = 0)" (a linha só atravessa o dia); bucket com amostra em que as
 * séries visíveis não têm base (ex.: "% de CI corrigido" num dia sem CI falho) diz isso, com o n da
 * data. Usa a moldura padrão dos tooltips (`ChartTooltipFrame`).
 */
export function LineChartTooltip({
    active,
    label,
    points,
    samples,
    items,
    format,
    sampleLabel,
    minSample,
    bucketMode,
}: {
    active?: boolean
    label?: unknown
    points: readonly Record<string, number | string | null>[]
    samples: readonly LineSample[]
    items: readonly LineSeriesItem[]
    format: MetricValueFormat
    sampleLabel: string | null
    minSample: number | null
    bucketMode?: BucketMode
}) {
    if (!active || label === undefined || label === null) return null
    const bucket = String(label)
    const point = points.find((item) => item.bucket === bucket)
    const sample = samples.find((item) => item.bucket === bucket)
    const rows = items.filter((item) => typeof point?.[item.key] === "number")
    const base = sampleOf(sample)
    const small = sampleLabel !== null && rows.some((item) => isSmallSample(sampleOf(sample, item.key), minSample))

    return (
        <ChartTooltipFrame>
            <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-foreground">{formatBucketTitle(bucket, bucketMode)}</span>
                {sampleLabel !== null && rows.length > 0 && (
                    <span className="text-muted-foreground">
                        n = {base} {sampleLabel}
                    </span>
                )}
            </div>
            {rows.length === 0 ? (
                <p className="text-muted-foreground">{emptyMessage(sampleLabel, base)}</p>
            ) : (
                <div className="grid gap-1.5">
                    {rows.map((item) => {
                        const own = sampleOf(sample, item.key)
                        return (
                            <div key={item.key} className="flex items-center gap-2" data-series={item.key}>
                                <LineSwatch color={item.color} dash={item.dash} />
                                <span className="flex-1 text-muted-foreground">{item.label}</span>
                                <span className="font-mono font-medium text-foreground tabular-nums">{formatMetricValue(point![item.key] as number, format)}</span>
                                {sampleLabel !== null && own !== base && <span className="text-muted-foreground tabular-nums">(n = {own})</span>}
                            </div>
                        )
                    })}
                </div>
            )}
            {small && <ChartTooltipFooter>Amostra pequena: pouco representativo</ChartTooltipFooter>}
        </ChartTooltipFrame>
    )
}
