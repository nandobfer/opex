"use client"

import { useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CartesianGrid, Line, LineChart as RechartsLineChart, Tooltip, XAxis, YAxis } from "recharts"
import { z } from "zod"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { usePersistentState } from "@/hooks/usePersistentState"
import type { BucketMode } from "@/lib/time/buckets"
import { ChartDataTable } from "./charts/ChartDataTable"
import { useChartAnimation } from "./charts/use-chart-animation"
import { formatBucketLabel, formatMetricValue, type MetricValueFormat } from "./format"
import { CHART_HEIGHT } from "./layout"
import { makeSampleDot } from "./line-dots"
import { lineSeriesItems, sampleOf, valueAxis, type LineSample, type LineSeriesInput } from "./line-chart-model"
import { LineChartTooltip } from "./LineChartTooltip"
import { SAMPLE_AXIS_HEIGHT, SampleAxisTick } from "./SampleAxisTick"
import { SelectableLegend } from "./SelectableLegend"

export type MultiLineSeries = LineSeriesInput

// `null` = nenhuma escolha salva: as linhas marcadas vêm do padrão das séries atuais. O padrão não vai
// como fallback do `usePersistentState` (que o guardaria em cache): as séries podem mudar com o período
// (ex.: categorias de achados) e o padrão tem de acompanhar.
const selectionSchema = z.array(z.string()).nullable()
const NO_SELECTION: string[] | null = null
const NO_SAMPLES: readonly LineSample[] = []

/** Chave do `localStorage` com as linhas marcadas de um gráfico (versionada; v2 = novo padrão de linhas). */
export const lineSelectionKey = (persistKey: string) => `opex:metrics:lines:${persistKey}:v2`

/**
 * Gráfico de várias linhas ao longo do tempo (eixo X = data), com legenda de caixas de seleção para
 * mostrar ou ocultar cada linha (seleção salva no navegador por gráfico). Cada série tem cor e traço
 * fixos (`lineSeriesItems`); as linhas são retas (`linear`, nunca passam dos valores reais) e, por
 * decisão do dono na OPE-122, contínuas: o bucket sem dados (`null`) não tem ponto, e a linha liga os
 * pontos vizinhos. Com amostras (`sampleLabel`), o eixo e o tooltip mostram o n de cada bucket e o
 * ponto com n abaixo de `minSample` sai vazado (pouco representativo).
 */
export function MultiLineChart({
    persistKey,
    series,
    points,
    format,
    ariaLabel,
    samples = NO_SAMPLES,
    sampleLabel = null,
    minSample = null,
    bucketMode,
    height = CHART_HEIGHT,
}: {
    persistKey: string
    series: readonly MultiLineSeries[]
    points: readonly Record<string, number | string | null>[]
    format: MetricValueFormat
    ariaLabel: string
    samples?: readonly LineSample[]
    sampleLabel?: string | null
    minSample?: number | null
    bucketMode?: BucketMode
    height?: number
}) {
    const animate = useChartAnimation()
    const defaults = useMemo(() => series.filter((item) => item.defaultSelected).map((item) => item.key), [series])
    const { value: stored, setValue } = usePersistentState<string[] | null>(lineSelectionKey(persistKey), selectionSchema, NO_SELECTION)
    const known = useMemo(() => new Set(series.map((item) => item.key)), [series])
    const selected = useMemo(() => new Set((stored ?? defaults).filter((key) => known.has(key))), [stored, defaults, known])
    const items = useMemo(() => lineSeriesItems(series), [series])
    const visible = items.filter((item) => selected.has(item.key))
    const withSamples = sampleLabel !== null && samples.length > 0
    const config = useMemo(() => Object.fromEntries(items.map((item) => [item.key, { label: item.label, color: item.color }])) satisfies ChartConfig, [items])
    const dots = useMemo(() => Object.fromEntries(items.map((item) => [item.key, makeSampleDot(item.key, item.color, withSamples ? samples : NO_SAMPLES, withSamples ? minSample : null)])), [items, samples, minSample, withSamples])
    const data = useMemo(() => [...points] as Record<string, unknown>[], [points])
    const axis = valueAxis(points, visible.map((item) => item.key), format)

    const toggle = (key: string, checked: boolean) =>
        setValue((current) => {
            const base = (current ?? defaults).filter((value) => known.has(value))
            return checked ? [...new Set([...base, key])] : base.filter((value) => value !== key)
        })

    return (
        <div className="space-y-3">
            <AnimatePresence mode="wait" initial={false}>
                {visible.length ? (
                    <motion.div key="chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="relative">
                        <ChartContainer config={config} role="img" aria-label={ariaLabel} className="aspect-auto w-full" style={{ height }}>
                            <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                <CartesianGrid vertical={false} />
                                {withSamples ? (
                                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} height={SAMPLE_AXIS_HEIGHT} tick={<SampleAxisTick samples={samples} />} />
                                ) : (
                                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={formatBucketLabel} />
                                )}
                                <YAxis width={44} tickLine={false} axisLine={false} domain={axis.domain} ticks={axis.ticks} allowDataOverflow={false} tickFormatter={(value: number) => formatMetricValue(value, format)} />
                                <Tooltip
                                    content={<LineChartTooltip points={points} samples={withSamples ? samples : NO_SAMPLES} items={visible} format={format} sampleLabel={withSamples ? sampleLabel : null} minSample={minSample} bucketMode={bucketMode} />}
                                />
                                {visible.map((item) => (
                                    <Line
                                        key={item.key}
                                        type="linear"
                                        dataKey={item.key}
                                        name={item.label}
                                        stroke={item.color}
                                        strokeDasharray={item.dash}
                                        strokeWidth={2}
                                        dot={dots[item.key]}
                                        activeDot={{ r: 4 }}
                                        connectNulls
                                        isAnimationActive={animate}
                                    />
                                ))}
                            </RechartsLineChart>
                        </ChartContainer>
                        <ChartDataTable
                            label={ariaLabel}
                            columns={[{ key: "bucket", label: "Data" }, ...(withSamples ? [{ key: "__n", label: "n" }] : []), ...visible.map((item) => ({ key: item.key, label: item.label }))]}
                            rows={points.map((point, index) => ({
                                ...Object.fromEntries(visible.map((item) => [item.key, formatMetricValue(point[item.key] as number | null, format)])),
                                bucket: formatBucketLabel(String(point.bucket)),
                                __n: String(sampleOf(samples[index])),
                            }))}
                        />
                    </motion.div>
                ) : (
                    <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
                        Selecione ao menos uma métrica
                    </motion.p>
                )}
            </AnimatePresence>
            {withSamples && (
                <p className="text-[11px] text-muted-foreground" data-sample-legend>
                    n = {sampleLabel} {bucketMode === "week" ? "em cada semana" : bucketMode === "month" ? "em cada mês" : "em cada dia"}
                    {minSample !== null && ` · ○ menos de ${minSample} (pouco representativo)`}
                </p>
            )}
            <SelectableLegend id={`legend-${persistKey.replace(/[^a-z0-9-]/gi, "-")}`} items={items} selected={selected} onToggle={toggle} />
        </div>
    )
}
