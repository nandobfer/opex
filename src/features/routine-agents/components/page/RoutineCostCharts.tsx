"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChartCard } from "@/components/metrics/charts/ChartCard"
import { RankedBarsCard } from "@/components/metrics/charts/RankedBarsCard"
import { EmptyChart } from "@/components/metrics/charts/EmptyChart"
import { MultiLineChart } from "@/components/metrics/MultiLineChart"
import { formatMetricValue } from "@/components/metrics/format"
import { OptionTabs } from "@/components/ui/option-tabs"
import { COST_KIND_TONE } from "@/features/ai-billing/cost-tone"
import { formatMoneyPair } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/money"
import type { RoutineAgentMetricsDto } from "../../types"

type Dimension = "providers" | "models" | "plans"
const DIMENSIONS: { value: Dimension; label: string }[] = [
    { value: "providers", label: "Provedor" },
    { value: "models", label: "Modelo" },
    { value: "plans", label: "Chave/plano" },
]

const usd = (value: number) => formatMetricValue(value, "usd")

/** Custo por dia (tabela × efetivo), na largura toda. */
export function RoutineCostByDayChart({ agentId, days }: { agentId: string; days: RoutineAgentMetricsDto["days"] }) {
    return (
        <ChartCard title="Custo por dia" description="Custo de tabela (pago por uso) e custo efetivo (pelo plano da chave), em US$, das execuções disparadas no dia." className="lg:col-span-2">
            <MultiLineChart
                persistKey={`rotineiro:${agentId}:custo`}
                series={[
                    { key: "list", label: COST_KIND_TONE.list.label, defaultSelected: true, color: COST_KIND_TONE.list.color },
                    { key: "effective", label: COST_KIND_TONE.effective.label, defaultSelected: true, color: COST_KIND_TONE.effective.color },
                ]}
                points={days.map((day) => ({ bucket: day.day, list: day.cost.listUsd, effective: day.cost.effectiveUsd }))}
                format="usd"
                ariaLabel="Custo por dia"
                bucketMode="day"
            />
        </ChartCard>
    )
}

/** Divisão do custo efetivo do período por provedor, modelo ou chave/plano. */
export function RoutineCostBreakdownChart({ breakdown }: { breakdown: RoutineAgentMetricsDto["breakdown"] }) {
    const [dimension, setDimension] = useState<Dimension>("providers")
    const rows = breakdown[dimension].map((row) => ({ label: row.label, value: row.effectiveUsd ?? row.listUsd ?? 0, list: formatMoneyPair(row.listUsd, row.listBrl), effective: `${formatMoneyPair(row.effectiveUsd, row.effectiveBrl)}${row.partial ? " (parcial)" : ""}` }))
    return (
        <ChartCard title="Divisão do custo" description="Custo efetivo do período (sem efetivo conhecido, o de tabela).">
            <div className="space-y-3">
                <OptionTabs id="routine-cost-dimension" options={DIMENSIONS} value={dimension} onChange={setDimension} size="sm" />
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={dimension} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                        {rows.length ? (
                            <RankedBarsCard
                                data={rows}
                                labelKey="label"
                                valueKey="value"
                                config={{ value: { label: "Custo efetivo", color: "var(--chart-1)" } }}
                                ariaLabel={`Divisão do custo por ${DIMENSIONS.find((item) => item.value === dimension)?.label.toLowerCase()}`}
                                valueFormatter={usd}
                                height={Math.max(120, Math.min(260, rows.length * 36))}
                                table={{ columns: [{ key: "label", label: "Item" }, { key: "list", label: "Custo de tabela" }, { key: "effective", label: "Custo efetivo" }], rows }}
                            />
                        ) : (
                            <EmptyChart message="Sem custo no período." />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </ChartCard>
    )
}

/** Avisos do custo: modelos sem preço, estimativas e o que deixou o total parcial. */
export function RoutineCostNotices({ cost }: { cost: RoutineAgentMetricsDto["cost"]["totals"] }) {
    const lines = [
        ...(cost.missingPrices.length ? [`Sem preço (total parcial): ${cost.missingPrices.join(", ")}.`] : []),
        ...(cost.estimated ? ["Execuções antigas com custo estimado pelos tokens guardados (sem a separação do cache)."] : []),
        ...cost.notices,
    ]
    if (!lines.length) return null
    return (
        <motion.ul initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-1 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground" aria-label="Avisos do custo">
            {lines.map((line) => (
                <li key={line}>{line}</li>
            ))}
        </motion.ul>
    )
}
