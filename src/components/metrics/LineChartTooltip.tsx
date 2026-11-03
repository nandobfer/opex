"use client"

import type { BucketMode } from "@/lib/time/buckets"
import { formatBucketLabel, formatMetricValue, type MetricValueFormat } from "./format"
import { isSmallSample, sampleOf, type LineSample, type LineSeriesItem } from "./line-chart-model"
import { LineSwatch } from "./LineSwatch"

/** Título do bucket no tooltip: "dd/MM", "Semana de dd/MM" ou "MMM/yy". */
export function formatBucketTitle(bucket: string, mode?: BucketMode): string {
    const label = formatBucketLabel(bucket)
    return mode === "week" ? `Semana de ${label}` : label
}

/**
 * Tooltip do gráfico de linhas: data, n do bucket ("n = 5 mesas concluídas") e uma linha por série
 * visível com valor (nome, valor e, quando a base da série é outra, o n dela). Bucket sem dados mostra
 * "Sem <amostra> (n = 0)": a linha só atravessa o dia.
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
        <div role="tooltip" className="grid min-w-[10rem] max-w-[300px] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
            <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-foreground">{formatBucketTitle(bucket, bucketMode)}</span>
                {sampleLabel !== null && rows.length > 0 && (
                    <span className="text-muted-foreground">
                        n = {base} {sampleLabel}
                    </span>
                )}
            </div>
            {rows.length === 0 ? (
                <p className="text-muted-foreground">{sampleLabel !== null ? `Sem ${sampleLabel} (n = 0)` : "Sem dados"}</p>
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
            {small && <p className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">Amostra pequena: pouco representativo</p>}
        </div>
    )
}
