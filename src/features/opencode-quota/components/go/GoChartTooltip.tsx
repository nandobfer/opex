"use client"

import { LineSwatch } from "@/components/metrics/LineSwatch"
import { ChartTooltipFrame } from "@/components/ui/chart"
import { dayKeyLabel, formatGoPercent } from "../../go-logic"
import type { GoChartPointDto } from "../../go-types"
import { GO_FORECAST_COLOR, GO_USAGE_COLOR } from "./chart-style"

/** Tooltip de um dia: data, uso do dia, acumulado e, de hoje em diante, a previsão. */
export function GoChartTooltip({ active, label, points }: { active?: boolean; label?: unknown; points: readonly GoChartPointDto[] }) {
    if (!active || typeof label !== "string") return null
    const point = points.find((item) => item.date === label)
    if (!point) return null
    const rows: { key: string; label: string; value: string; color?: string }[] = []
    if (point.dayPercent !== null) rows.push({ key: "day", label: "Uso do dia", value: formatGoPercent(point.dayPercent, 2) })
    if (point.usage !== null) rows.push({ key: "usage", label: "Acumulado", value: formatGoPercent(point.usage), color: GO_USAGE_COLOR })
    if (point.forecast !== null) rows.push({ key: "forecast", label: "Previsão", value: formatGoPercent(point.forecast), color: GO_FORECAST_COLOR })

    return (
        <ChartTooltipFrame>
            <span className="font-medium text-foreground">{dayKeyLabel(point.date, true)}</span>
            {rows.length === 0 ? (
                <p className="text-muted-foreground">Sem dados</p>
            ) : (
                <div className="grid gap-1.5">
                    {rows.map((row) => (
                        <div key={row.key} className="flex items-center gap-2" data-go-tooltip-row={row.key}>
                            {row.color ? <LineSwatch color={row.color} dash={undefined} /> : <span className="w-4 shrink-0" aria-hidden />}
                            <span className="flex-1 text-muted-foreground">{row.label}</span>
                            <span className="font-mono font-medium text-foreground tabular-nums">{row.value}</span>
                        </div>
                    ))}
                </div>
            )}
        </ChartTooltipFrame>
    )
}
