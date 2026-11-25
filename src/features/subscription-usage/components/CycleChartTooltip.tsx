"use client"

import { ChartTooltipFrame } from "@/components/ui/chart"
import { formatUsageFullDate, formatUsagePercent } from "../cycle-logic"
import type { CycleChartPointDto } from "../types"
import { CHART_FORECAST_COLOR, CHART_USAGE_COLOR } from "./chart-style"
import { LegendBar } from "./LegendBar"

/** Tooltip de um ponto: data (São Paulo) e, no trecho verde, uso do dia e acumulado; no amarelo, previsão do dia e acumulado previsto. */
export function CycleChartTooltip({ active, label, points }: { active?: boolean; label?: unknown; points: readonly CycleChartPointDto[] }) {
    if (!active || typeof label !== "number") return null
    const point = points.find((item) => item.t === label)
    if (!point) return null
    const rows: { key: string; label: string; value: string; color?: string }[] = []
    if (point.dayPercent !== null) rows.push({ key: "day", label: "Uso do dia", value: formatUsagePercent(point.dayPercent, 2) })
    if (point.usage !== null) rows.push({ key: "usage", label: "Acumulado", value: formatUsagePercent(point.usage), color: CHART_USAGE_COLOR })
    if (point.dayForecast !== null) rows.push({ key: "dayForecast", label: "Previsão do dia", value: formatUsagePercent(point.dayForecast, 2) })
    if (point.forecast !== null && point.usage === null) rows.push({ key: "forecast", label: "Acumulado previsto", value: formatUsagePercent(point.forecast), color: CHART_FORECAST_COLOR })

    return (
        <ChartTooltipFrame>
            <span className="font-medium text-foreground">{formatUsageFullDate(Date.parse(`${point.date}T12:00:00.000Z`))}</span>
            {rows.length === 0 ? (
                <p className="text-muted-foreground">Sem dados</p>
            ) : (
                <div className="grid gap-1.5">
                    {rows.map((row) => (
                        <div key={row.key} className="flex items-center gap-2" data-usage-tooltip-row={row.key}>
                            {row.color ? <LegendBar color={row.color} /> : <span className="w-[3px] shrink-0" aria-hidden />}
                            <span className="flex-1 text-muted-foreground">{row.label}</span>
                            <span className="font-mono font-medium text-foreground tabular-nums">{row.value}</span>
                        </div>
                    ))}
                </div>
            )}
        </ChartTooltipFrame>
    )
}
