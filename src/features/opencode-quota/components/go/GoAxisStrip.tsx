"use client"

import { usePlotArea, useXAxisScale } from "recharts"
import { axisDateLabel } from "../../go-logic"
import { GO_FORECAST_COLOR, GO_GRID_COLOR, GO_MUTED_COLOR } from "./chart-style"
import { GO_AXIS_STRIP_HEIGHT } from "./layout"

/**
 * Faixa de datas sob o gráfico, no desenho do Console: barra arredondada com borda na largura da área do
 * gráfico e as marcas em caixa alta ("5 NOV"); a data do cruzamento com o teto vem em amarelo e negrito.
 * Renderizada dentro do `ComposedChart` (lê a área e a escala do eixo X do recharts).
 */
export function GoAxisStrip({ ticks }: { ticks: readonly { t: number; highlight: boolean }[] }) {
    const plot = usePlotArea()
    const scale = useXAxisScale()
    if (!plot || !scale) return null
    const top = plot.y + plot.height + 10
    const left = plot.x
    const right = plot.x + plot.width
    return (
        <g data-go-axis>
            <rect x={left} y={top} width={plot.width} height={GO_AXIS_STRIP_HEIGHT} rx={6} fill={GO_GRID_COLOR} fillOpacity={0.25} stroke={GO_GRID_COLOR} />
            {ticks.map((tick, index) => {
                const x = Number(scale(tick.t))
                const first = index === 0
                const last = index === ticks.length - 1
                const anchor = first ? "start" : last ? "end" : "middle"
                return (
                    <text
                        key={tick.t}
                        x={first ? Math.max(left + 8, x) : last ? Math.min(right - 8, x) : x}
                        y={top + GO_AXIS_STRIP_HEIGHT / 2}
                        dominantBaseline="central"
                        textAnchor={anchor}
                        fontSize={10}
                        fontWeight={tick.highlight ? 700 : 500}
                        letterSpacing="0.04em"
                        fill={tick.highlight ? GO_FORECAST_COLOR : GO_MUTED_COLOR}
                        data-go-tick={tick.highlight ? "crossing" : "date"}
                    >
                        {axisDateLabel(tick.t)}
                    </text>
                )
            })}
        </g>
    )
}
