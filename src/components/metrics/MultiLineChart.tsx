"use client"

import { useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts"
import { z } from "zod"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { usePersistentState } from "@/hooks/usePersistentState"
import { ChartDataTable } from "./charts/ChartDataTable"
import { colorAt } from "./charts/palette"
import { useChartAnimation } from "./charts/use-chart-animation"
import { formatBucketLabel, formatMetricValue, type MetricValueFormat } from "./format"
import { CHART_HEIGHT } from "./layout"
import { SelectableLegend } from "./SelectableLegend"

export interface MultiLineSeries {
    key: string
    label: string
    defaultSelected: boolean
}

const selectionSchema = z.array(z.string())

/** Chave do `localStorage` com as linhas marcadas de um gráfico (versionada). */
export const lineSelectionKey = (persistKey: string) => `opex:metrics:lines:${persistKey}:v1`

/**
 * Gráfico de várias linhas ao longo do tempo (eixo X = data), com legenda de caixas de seleção para
 * mostrar ou ocultar cada linha. A seleção fica salva no navegador (`usePersistentState`) por gráfico.
 * Ponto `null` (sem base) não é desenhado nem ligado aos vizinhos. Sem linhas marcadas, avisa.
 */
export function MultiLineChart({
    persistKey,
    series,
    points,
    format,
    ariaLabel,
    height = CHART_HEIGHT,
}: {
    persistKey: string
    series: readonly MultiLineSeries[]
    points: readonly Record<string, number | string | null>[]
    format: MetricValueFormat
    ariaLabel: string
    height?: number
}) {
    const animate = useChartAnimation()
    const defaults = useMemo(() => series.filter((item) => item.defaultSelected).map((item) => item.key), [series])
    const { value: stored, setValue } = usePersistentState<string[]>(lineSelectionKey(persistKey), selectionSchema, defaults)
    const known = useMemo(() => new Set(series.map((item) => item.key)), [series])
    const selected = useMemo(() => new Set(stored.filter((key) => known.has(key))), [stored, known])
    const items = series.map((item, index) => ({ key: item.key, label: item.label, color: colorAt(index) }))
    const visible = items.filter((item) => selected.has(item.key))
    const config = Object.fromEntries(items.map((item) => [item.key, { label: item.label, color: item.color }])) satisfies ChartConfig

    const toggle = (key: string, checked: boolean) => setValue((current) => (checked ? [...new Set([...current.filter((value) => known.has(value)), key])] : current.filter((value) => value !== key)))

    return (
        <div className="space-y-3">
            <AnimatePresence mode="wait" initial={false}>
                {visible.length ? (
                    <motion.div key="chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="relative">
                        <ChartContainer config={config} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height }}>
                            <RechartsLineChart data={[...points] as Record<string, unknown>[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatBucketLabel} />
                                <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatMetricValue(value, format)} />
                                <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => formatBucketLabel(String(label))} valueFormatter={(value) => formatMetricValue(Number(value), format)} />} />
                                {visible.map((item) => (
                                    <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={animate} />
                                ))}
                            </RechartsLineChart>
                        </ChartContainer>
                        <ChartDataTable
                            label={ariaLabel}
                            columns={[{ key: "bucket", label: "Data" }, ...visible.map((item) => ({ key: item.key, label: item.label }))]}
                            rows={points.map((point) => ({ ...Object.fromEntries(visible.map((item) => [item.key, formatMetricValue(point[item.key] as number | null, format)])), bucket: formatBucketLabel(String(point.bucket)) }))}
                        />
                    </motion.div>
                ) : (
                    <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
                        Selecione ao menos uma métrica
                    </motion.p>
                )}
            </AnimatePresence>
            <SelectableLegend id={`legend-${persistKey.replace(/[^a-z0-9-]/gi, "-")}`} items={items} selected={selected} onToggle={toggle} />
        </div>
    )
}
