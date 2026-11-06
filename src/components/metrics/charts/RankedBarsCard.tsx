"use client"

import { Bar, BarChart as RechartsBarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartDataTable } from "./ChartDataTable"
import { useChartAnimation } from "./use-chart-animation"
import type { ChartRow, ChartTableSpec, TooltipFooter } from "./types"

function cellColor(row: ChartRow, key: string): string | null {
    const value = (row as Record<string, unknown>)[key]
    return typeof value === "string" && value ? value : null
}

/** Barras horizontais ranqueadas (uma medida por linha), com tooltip, tabela oculta e animação. */
export function RankedBarsCard({
    data,
    labelKey,
    valueKey,
    config,
    ariaLabel,
    table,
    height = 240,
    color = "var(--chart-1)",
    valueFormatter,
    footer,
    colorKey,
}: {
    data: readonly ChartRow[]
    labelKey: string
    valueKey: string
    config: ChartConfig
    ariaLabel: string
    table: ChartTableSpec
    height?: number
    color?: string
    valueFormatter?: (value: number) => string
    footer?: TooltipFooter
    /** Coluna com a cor de cada barra (ranking por série); vazia, a barra usa `color`. */
    colorKey?: string
}) {
    const animate = useChartAnimation()
    return (
        <div className="relative">
            <ChartContainer config={config} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height }}>
                <RechartsBarChart data={[...data] as Record<string, unknown>[]} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey={labelKey} width={130} tickLine={false} axisLine={false} />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent valueFormatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : String(value))} footer={footer} />}
                    />
                    <Bar dataKey={valueKey} name={String(config[valueKey]?.label ?? valueKey)} fill={color} radius={[0, 4, 4, 0]} isAnimationActive={animate}>
                        {colorKey ? data.map((row, index) => <Cell key={index} fill={cellColor(row, colorKey) ?? color} />) : null}
                    </Bar>
                </RechartsBarChart>
            </ChartContainer>
            <ChartDataTable label={ariaLabel} columns={table.columns} rows={table.rows} />
        </div>
    )
}
