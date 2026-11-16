"use client"

import { CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartDataTable } from "@/components/metrics/charts/ChartDataTable"
import { useChartAnimation } from "@/components/metrics/charts/use-chart-animation"
import { LineSwatch } from "@/components/metrics/LineSwatch"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { dayKeyLabel, formatGoPercent } from "../../go-logic"
import type { GoChartDto } from "../../go-types"
import { GO_CEILING_COLOR, GO_CEILING_DASH, GO_FORECAST_COLOR, GO_USAGE_COLOR } from "./chart-style"
import { GoChartTooltip } from "./GoChartTooltip"
import { GO_CHART_HEIGHT } from "./layout"

const CONFIG: ChartConfig = {
    usage: { label: "Uso", color: GO_USAGE_COLOR },
    forecast: { label: "Previsão", color: GO_FORECAST_COLOR },
}

const TABLE_COLUMNS = [
    { key: "date", label: "Dia" },
    { key: "day", label: "Uso do dia" },
    { key: "usage", label: "Acumulado" },
    { key: "forecast", label: "Previsão" },
]

const LEGEND = [
    { key: "usage", label: "Uso", color: GO_USAGE_COLOR, dash: undefined },
    { key: "forecast", label: "Previsão", color: GO_FORECAST_COLOR, dash: undefined },
    { key: "ceiling", label: "Teto mensal", color: GO_CEILING_COLOR, dash: GO_CEILING_DASH },
]

const pct = (value: number | null) => (value === null ? "—" : formatGoPercent(value))

/**
 * Gráfico do consumo da assinatura (desenho do Console): eixo de 0% a 150% (sobe de 50 em 50 se passar),
 * uso acumulado em verde, teto mensal tracejado por ciclo, previsão linear em amarelo até a renovação,
 * marcador vazado no cruzamento com o teto e o % previsto no fim da previsão.
 */
export function GoUsageChart({ chart, dailyAverage }: { chart: GoChartDto; dailyAverage: number | null }) {
    const animate = useChartAnimation()
    const ticks = Array.from({ length: chart.yMax / 50 + 1 }, (_, index) => index * 50)
    const ariaLabel = "Uso acumulado da assinatura OpenCode Go por dia"

    return (
        <div className="space-y-2">
            <div className="relative">
                <ChartContainer config={CONFIG} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height: GO_CHART_HEIGHT }}>
                    <ComposedChart data={chart.points} margin={{ top: 20, right: 56, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(value: string) => dayKeyLabel(value)} />
                        <YAxis domain={[0, chart.yMax]} ticks={ticks} width={48} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
                        <ChartTooltip content={<GoChartTooltip points={chart.points} />} />
                        {chart.ceilings.map((ceiling) => (
                            <ReferenceLine
                                key={`${ceiling.from}-${ceiling.value}`}
                                segment={[
                                    { x: ceiling.from, y: ceiling.value },
                                    { x: ceiling.to, y: ceiling.value },
                                ]}
                                stroke={GO_CEILING_COLOR}
                                strokeDasharray={GO_CEILING_DASH}
                                label={{ value: "Teto mensal", position: "insideTopLeft", fill: GO_CEILING_COLOR, fontSize: 10 }}
                            />
                        ))}
                        <Line type="monotone" dataKey="usage" name="Uso" stroke={GO_USAGE_COLOR} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={animate} />
                        <Line type="linear" dataKey="forecast" name="Previsão" stroke={GO_FORECAST_COLOR} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={animate} />
                        {chart.crossing && (
                            <ReferenceDot
                                x={chart.crossing.date}
                                y={chart.crossing.value}
                                r={5}
                                fill="var(--background)"
                                stroke={GO_FORECAST_COLOR}
                                strokeWidth={2}
                                label={{ value: dayKeyLabel(chart.crossing.date), position: "top", fill: GO_FORECAST_COLOR, fontSize: 11 }}
                            />
                        )}
                        {chart.forecastEnd && (
                            <ReferenceDot
                                x={chart.forecastEnd.date}
                                y={chart.forecastEnd.value}
                                r={3}
                                fill={GO_FORECAST_COLOR}
                                stroke="none"
                                label={{ value: formatGoPercent(chart.forecastEnd.percent), position: "right", fill: GO_FORECAST_COLOR, fontSize: 11 }}
                            />
                        )}
                    </ComposedChart>
                </ChartContainer>
                <ChartDataTable
                    label={ariaLabel}
                    columns={TABLE_COLUMNS}
                    rows={chart.points.map((point) => ({ date: dayKeyLabel(point.date, true), day: pct(point.dayPercent), usage: pct(point.usage), forecast: pct(point.forecast) }))}
                />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <ul className="flex flex-wrap items-center gap-3" aria-label="Legenda">
                    {LEGEND.map((item) => (
                        <li key={item.key} className="flex items-center gap-1.5" data-go-legend={item.key}>
                            <LineSwatch color={item.color} dash={item.dash} />
                            {item.label}
                        </li>
                    ))}
                </ul>
                {dailyAverage !== null && <span data-go-average>Média de {formatGoPercent(dailyAverage)} por dia</span>}
            </div>
        </div>
    )
}
