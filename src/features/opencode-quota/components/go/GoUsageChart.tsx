"use client"

import { useId } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartDataTable } from "@/components/metrics/charts/ChartDataTable"
import { useChartAnimation } from "@/components/metrics/charts/use-chart-animation"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { formatGoDate, formatGoFullDate, formatGoPercent, goAxisTicks, goYTicks } from "../../go-logic"
import type { GoChartDto } from "../../go-types"
import { GO_CARD_COLOR, GO_CEILING_COLOR, GO_CEILING_DASH, GO_CEILING_OPACITY, GO_FORECAST_COLOR, GO_GRID_COLOR, GO_GRID_OPACITY, GO_MUTED_COLOR, GO_USAGE_COLOR } from "./chart-style"
import { GoAxisStrip } from "./GoAxisStrip"
import { GoChartTooltip } from "./GoChartTooltip"
import { GO_AXIS_STRIP_HEIGHT, GO_CHART_HEIGHT } from "./layout"
import { LegendBar } from "./LegendBar"

const CONFIG: ChartConfig = {
    usage: { label: "Uso", color: GO_USAGE_COLOR },
    forecast: { label: "Previsão", color: GO_FORECAST_COLOR },
}

const TABLE_COLUMNS = [
    { key: "date", label: "Data" },
    { key: "day", label: "Uso do dia" },
    { key: "usage", label: "Acumulado" },
    { key: "dayForecast", label: "Previsão do dia" },
    { key: "forecast", label: "Previsão" },
]

const LEGEND = [
    { key: "usage", label: "Uso", color: GO_USAGE_COLOR, dotted: false },
    { key: "forecast", label: "Previsão", color: GO_FORECAST_COLOR, dotted: false },
    { key: "ceiling", label: "Teto mensal", color: GO_CEILING_COLOR, dotted: true },
]

const pct = (value: number | null) => (value === null ? "—" : formatGoPercent(value))
const hollow = (color: string) => ({ r: 4.5, fill: GO_CARD_COLOR, stroke: color, strokeWidth: 2 })

/**
 * Gráfico de um ciclo da assinatura no desenho do Console do OpenCode Go: eixo de 0% até o maior valor com
 * folga (`goYMax`) e grade apagada de 50 em 50 mais o topo (`goYTicks`), teto de 100% pontilhado e destacado, uso acumulado em verde (área com gradiente) até o círculo de hoje,
 * previsão em reta amarela com hachura até a renovação, círculos vazados no cruzamento e no fim (com o %
 * previsto), verticais tracejadas em hoje e no cruzamento e a faixa de datas com a data do cruzamento destacada.
 */
export function GoUsageChart({ chart, dailyAverage }: { chart: GoChartDto; dailyAverage: number | null }) {
    const animate = useChartAnimation()
    const id = useId().replace(/[^a-zA-Z0-9]/g, "")
    const startMs = Date.parse(chart.cycle.startsAt)
    const endMs = Date.parse(chart.cycle.endsAt)
    const ticks = goYTicks(chart.yMax)
    const axisTicks = goAxisTicks(startMs, endMs, chart.crossing?.t ?? null)
    const ariaLabel = chart.cycle.current ? "Uso acumulado do ciclo atual da assinatura OpenCode Go" : "Uso acumulado do ciclo da assinatura OpenCode Go"

    return (
        <div className="space-y-3">
            {!chart.cycle.current && (
                <p className="text-xs text-muted-foreground" data-go-cycle="past">
                    Ciclo de {formatGoDate(chart.cycle.startsAt)} a {formatGoDate(chart.cycle.endsAt)}
                </p>
            )}
            <div className="relative">
                <ChartContainer config={CONFIG} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height: GO_CHART_HEIGHT }}>
                    <ComposedChart data={chart.points} margin={{ top: 24, right: 24, bottom: GO_AXIS_STRIP_HEIGHT + 12, left: 0 }}>
                        <defs>
                            <linearGradient id={`go-usage-${id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={GO_USAGE_COLOR} stopOpacity={0.18} />
                                <stop offset="100%" stopColor={GO_USAGE_COLOR} stopOpacity={0} />
                            </linearGradient>
                            <pattern id={`go-hatch-${id}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                <line x1={0} y1={0} x2={0} y2={6} stroke={GO_FORECAST_COLOR} strokeOpacity={0.14} strokeWidth={2} />
                            </pattern>
                        </defs>
                        <CartesianGrid vertical={false} stroke={GO_GRID_COLOR} strokeOpacity={GO_GRID_OPACITY} />
                        <XAxis dataKey="t" type="number" scale="time" domain={[startMs, endMs]} hide />
                        <YAxis domain={[0, chart.yMax]} ticks={ticks} width={44} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: GO_MUTED_COLOR }} tickFormatter={(value: number) => `${value}%`} />
                        <ChartTooltip cursor={{ stroke: GO_GRID_COLOR }} content={<GoChartTooltip points={chart.points} />} />
                        <ReferenceLine y={100} stroke={GO_CEILING_COLOR} strokeOpacity={GO_CEILING_OPACITY} strokeWidth={1.5} strokeDasharray={GO_CEILING_DASH} />
                        {chart.today && <ReferenceLine x={chart.today.t} stroke={GO_GRID_COLOR} strokeDasharray="3 3" />}
                        {chart.crossing && <ReferenceLine x={chart.crossing.t} stroke={GO_GRID_COLOR} strokeDasharray="3 3" />}
                        <Area type="linear" dataKey="forecast" stroke="none" fill={`url(#go-hatch-${id})`} connectNulls isAnimationActive={animate} activeDot={false} />
                        <Area type="monotone" dataKey="usage" stroke={GO_USAGE_COLOR} strokeWidth={2} fill={`url(#go-usage-${id})`} dot={false} activeDot={false} connectNulls={false} isAnimationActive={animate} />
                        <Line type="linear" dataKey="forecast" stroke={GO_FORECAST_COLOR} strokeWidth={2} dot={false} activeDot={false} connectNulls isAnimationActive={animate} />
                        {chart.today && <ReferenceDot x={chart.today.t} y={chart.today.percent} {...hollow(GO_USAGE_COLOR)} />}
                        {chart.crossing && <ReferenceDot x={chart.crossing.t} y={chart.crossing.value} {...hollow(GO_FORECAST_COLOR)} />}
                        {chart.forecastEnd && (
                            <ReferenceDot
                                x={chart.forecastEnd.t}
                                y={chart.forecastEnd.percent}
                                {...hollow(GO_FORECAST_COLOR)}
                                label={{ value: formatGoPercent(chart.forecastEnd.percent, 0), position: "top", offset: 10, fill: GO_FORECAST_COLOR, fontSize: 11, fontWeight: 700 }}
                            />
                        )}
                        <GoAxisStrip ticks={axisTicks} />
                    </ComposedChart>
                </ChartContainer>
                <ChartDataTable
                    label={ariaLabel}
                    columns={TABLE_COLUMNS}
                    rows={chart.points.map((point) => ({ date: formatGoFullDate(Date.parse(`${point.date}T12:00:00.000Z`)), day: pct(point.dayPercent), usage: pct(point.usage), dayForecast: pct(point.dayForecast), forecast: pct(point.forecast) }))}
                />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                {dailyAverage !== null ? (
                    <span data-go-average>
                        Média de <strong className="font-semibold text-foreground">{formatGoPercent(dailyAverage)}</strong> por dia
                    </span>
                ) : (
                    <span />
                )}
                <ul className="flex flex-wrap items-center gap-4" aria-label="Legenda">
                    {LEGEND.map((item) => (
                        <li key={item.key} className="flex items-center gap-1.5" data-go-legend={item.key}>
                            <LegendBar color={item.color} dotted={item.dotted} />
                            {item.label}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
