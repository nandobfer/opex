"use client"

import { useId } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartDataTable } from "@/components/metrics/charts/ChartDataTable"
import { useChartAnimation } from "@/components/metrics/charts/use-chart-animation"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { formatUsageDate, formatUsageFullDate, formatUsagePercent, cycleAxisTicks, cycleYTicks } from "../cycle-logic"
import type { CycleChartDto } from "../types"
import { CHART_CARD_COLOR, CHART_CEILING_COLOR, CHART_CEILING_DASH, CHART_CEILING_OPACITY, CHART_FORECAST_COLOR, CHART_GRID_COLOR, CHART_GRID_OPACITY, CHART_MUTED_COLOR, CHART_USAGE_COLOR } from "./chart-style"
import { CycleAxisStrip } from "./CycleAxisStrip"
import { CycleChartTooltip } from "./CycleChartTooltip"
import { USAGE_AXIS_STRIP_HEIGHT, USAGE_CHART_HEIGHT } from "./layout"
import { LegendBar } from "./LegendBar"

const CONFIG: ChartConfig = {
    usage: { label: "Uso", color: CHART_USAGE_COLOR },
    forecast: { label: "Previsão", color: CHART_FORECAST_COLOR },
}

const TABLE_COLUMNS = [
    { key: "date", label: "Data" },
    { key: "day", label: "Uso do dia" },
    { key: "usage", label: "Acumulado" },
    { key: "dayForecast", label: "Previsão do dia" },
    { key: "forecast", label: "Previsão" },
]

const LEGEND = [
    { key: "usage", label: "Uso", color: CHART_USAGE_COLOR, dotted: false },
    { key: "forecast", label: "Previsão", color: CHART_FORECAST_COLOR, dotted: false },
    { key: "ceiling", label: "Teto mensal", color: CHART_CEILING_COLOR, dotted: true },
]

const pct = (value: number | null) => (value === null ? "—" : formatUsagePercent(value))
const hollow = (color: string) => ({ r: 4.5, fill: CHART_CARD_COLOR, stroke: color, strokeWidth: 2 })

/**
 * Gráfico de um ciclo da assinatura (OpenCode Go e Command Code) no desenho do Console do OpenCode Go: eixo de 0%
 * até o maior valor com folga (`cycleYMax`) e grade apagada em passo adaptativo (50, 100, 200, 500…, no máximo 6 marcas, com o 100% enquanto
 * não encavala com o 0% e o topo como última marca, `cycleYTicks`), teto de 100% pontilhado e destacado, uso acumulado
 * em verde (área com gradiente) até o círculo de hoje,
 * previsão em reta amarela com hachura até a renovação, círculos vazados no cruzamento e no fim (com o %
 * previsto), verticais tracejadas em hoje e no cruzamento e a faixa de datas com a data do cruzamento destacada.
 */
export function CycleUsageChart({ chart, dailyAverage, subject }: { chart: CycleChartDto; dailyAverage: number | null; /** Nome da assinatura no rótulo acessível ("OpenCode Go", "Command Code"). */ subject: string }) {
    const animate = useChartAnimation()
    const id = useId().replace(/[^a-zA-Z0-9]/g, "")
    const startMs = Date.parse(chart.cycle.startsAt)
    const endMs = Date.parse(chart.cycle.endsAt)
    const ticks = cycleYTicks(chart.yMax)
    const axisTicks = cycleAxisTicks(startMs, endMs, chart.crossing?.t ?? null)
    const ariaLabel = chart.cycle.current ? `Uso acumulado do ciclo atual da assinatura ${subject}` : `Uso acumulado do ciclo da assinatura ${subject}`

    return (
        <div className="space-y-3">
            {!chart.cycle.current && (
                <p className="text-xs text-muted-foreground" data-usage-cycle="past">
                    Ciclo de {formatUsageDate(chart.cycle.startsAt)} a {formatUsageDate(chart.cycle.endsAt)}
                </p>
            )}
            <div className="relative">
                <ChartContainer config={CONFIG} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height: USAGE_CHART_HEIGHT }}>
                    <ComposedChart data={chart.points} margin={{ top: 24, right: 24, bottom: USAGE_AXIS_STRIP_HEIGHT + 12, left: 0 }}>
                        <defs>
                            <linearGradient id={`usage-area-${id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={CHART_USAGE_COLOR} stopOpacity={0.18} />
                                <stop offset="100%" stopColor={CHART_USAGE_COLOR} stopOpacity={0} />
                            </linearGradient>
                            <pattern id={`usage-hatch-${id}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                <line x1={0} y1={0} x2={0} y2={6} stroke={CHART_FORECAST_COLOR} strokeOpacity={0.14} strokeWidth={2} />
                            </pattern>
                        </defs>
                        <CartesianGrid vertical={false} stroke={CHART_GRID_COLOR} strokeOpacity={CHART_GRID_OPACITY} />
                        <XAxis dataKey="t" type="number" scale="time" domain={[startMs, endMs]} hide />
                        <YAxis domain={[0, chart.yMax]} ticks={ticks} width={44} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART_MUTED_COLOR }} tickFormatter={(value: number) => `${value}%`} />
                        <ChartTooltip cursor={{ stroke: CHART_GRID_COLOR }} content={<CycleChartTooltip points={chart.points} />} />
                        <ReferenceLine y={100} stroke={CHART_CEILING_COLOR} strokeOpacity={CHART_CEILING_OPACITY} strokeWidth={1.5} strokeDasharray={CHART_CEILING_DASH} />
                        {chart.today && <ReferenceLine x={chart.today.t} stroke={CHART_GRID_COLOR} strokeDasharray="3 3" />}
                        {chart.crossing && <ReferenceLine x={chart.crossing.t} stroke={CHART_GRID_COLOR} strokeDasharray="3 3" />}
                        <Area type="linear" dataKey="forecast" stroke="none" fill={`url(#usage-hatch-${id})`} connectNulls isAnimationActive={animate} activeDot={false} />
                        <Area type="monotone" dataKey="usage" stroke={CHART_USAGE_COLOR} strokeWidth={2} fill={`url(#usage-area-${id})`} dot={false} activeDot={false} connectNulls={false} isAnimationActive={animate} />
                        <Line type="linear" dataKey="forecast" stroke={CHART_FORECAST_COLOR} strokeWidth={2} dot={false} activeDot={false} connectNulls isAnimationActive={animate} />
                        {chart.today && <ReferenceDot x={chart.today.t} y={chart.today.percent} {...hollow(CHART_USAGE_COLOR)} />}
                        {chart.crossing && <ReferenceDot x={chart.crossing.t} y={chart.crossing.value} {...hollow(CHART_FORECAST_COLOR)} />}
                        {chart.forecastEnd && (
                            <ReferenceDot
                                x={chart.forecastEnd.t}
                                y={chart.forecastEnd.percent}
                                {...hollow(CHART_FORECAST_COLOR)}
                                label={{ value: formatUsagePercent(chart.forecastEnd.percent, 0), position: "top", offset: 10, fill: CHART_FORECAST_COLOR, fontSize: 11, fontWeight: 700 }}
                            />
                        )}
                        <CycleAxisStrip ticks={axisTicks} />
                    </ComposedChart>
                </ChartContainer>
                <ChartDataTable
                    label={ariaLabel}
                    columns={TABLE_COLUMNS}
                    rows={chart.points.map((point) => ({ date: formatUsageFullDate(Date.parse(`${point.date}T12:00:00.000Z`)), day: pct(point.dayPercent), usage: pct(point.usage), dayForecast: pct(point.dayForecast), forecast: pct(point.forecast) }))}
                />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                {dailyAverage !== null ? (
                    <span data-usage-average>
                        Média de <strong className="font-semibold text-foreground">{formatUsagePercent(dailyAverage)}</strong> por dia
                    </span>
                ) : (
                    <span />
                )}
                <ul className="flex flex-wrap items-center gap-4" aria-label="Legenda">
                    {LEGEND.map((item) => (
                        <li key={item.key} className="flex items-center gap-1.5" data-usage-legend={item.key}>
                            <LegendBar color={item.color} dotted={item.dotted} />
                            {item.label}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
