"use client"

import { ChartTooltipFrame } from "@/components/ui/chart"
import { formatGoFullDate, formatGoPercent } from "../../go-logic"
import type { GoChartPointDto } from "../../go-types"
import { GO_FORECAST_COLOR, GO_USAGE_COLOR } from "./chart-style"
import { LegendBar } from "./LegendBar"

/** Tooltip de um ponto: data (São Paulo), uso do dia, acumulado e, em "hoje" e na renovação, a previsão. */
export function GoChartTooltip({ active, label, points }: { active?: boolean; label?: unknown; points: readonly GoChartPointDto[] }) {
    if (!active || typeof label !== "number") return null
    const point = points.find((item) => item.t === label)
    if (!point) return null
    const rows: { key: string; label: string; value: string; color?: string }[] = []
    if (point.dayPercent !== null) rows.push({ key: "day", label: "Uso do dia", value: formatGoPercent(point.dayPercent, 2) })
    if (point.usage !== null) rows.push({ key: "usage", label: "Acumulado", value: formatGoPercent(point.usage), color: GO_USAGE_COLOR })
    if (point.forecast !== null && point.usage === null) rows.push({ key: "forecast", label: "Previsão", value: formatGoPercent(point.forecast), color: GO_FORECAST_COLOR })

    return (
        <ChartTooltipFrame>
            <span className="font-medium text-foreground">{formatGoFullDate(Date.parse(`${point.date}T12:00:00.000Z`))}</span>
            {rows.length === 0 ? (
                <p className="text-muted-foreground">Sem dados</p>
            ) : (
                <div className="grid gap-1.5">
                    {rows.map((row) => (
                        <div key={row.key} className="flex items-center gap-2" data-go-tooltip-row={row.key}>
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
