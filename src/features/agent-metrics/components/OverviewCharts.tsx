"use client"

import { ChartCard } from "@/components/metrics/charts/ChartCard"
import { EmptyChart } from "@/components/metrics/charts/EmptyChart"
import { RankedBarsCard } from "@/components/metrics/charts/RankedBarsCard"
import { formatMetricValue } from "@/components/metrics/format"
import { CHART_GRID, CHART_HEIGHT } from "@/components/metrics/layout"
import { MultiLineChart } from "@/components/metrics/MultiLineChart"
import { UsageByDateChart } from "@/components/metrics/UsageByDateChart"
import type { AgentId } from "../catalog"
import type { AgentMetricsDto } from "../types"

/**
 * Gráficos da Visão geral: as linhas do agente (uma linha por métrica, legenda com caixas de seleção
 * salvas no navegador), Uso por data e as distribuições em barras.
 */
export function OverviewCharts({ agent, data, showSpecific }: { agent: AgentId; data: AgentMetricsDto; showSpecific: boolean }) {
    return (
        <div className={CHART_GRID}>
            {showSpecific &&
                data.lines.map((chart) => (
                    <ChartCard key={chart.id} title={chart.title} description={chart.description} className="lg:col-span-2">
                        <MultiLineChart persistKey={`${agent}:${chart.id}`} series={chart.series} points={chart.points} format={chart.format} ariaLabel={chart.title} />
                    </ChartCard>
                ))}
            <ChartCard title="Uso por data" description={`Quantidade de ${data.usageUnit} por ${data.bucketMode === "day" ? "dia" : data.bucketMode === "week" ? "semana" : "mês"}.`}>
                <UsageByDateChart points={data.usage} unit={data.usageUnit} />
            </ChartCard>
            {showSpecific &&
                data.bars.map((chart) => (
                    <ChartCard key={chart.id} title={chart.title} description={chart.description}>
                        {chart.items.length ? (
                            <RankedBarsCard
                                data={chart.items.map((item) => ({ label: item.detail ? `${item.label} (${item.detail})` : item.label, value: item.value }))}
                                labelKey="label"
                                valueKey="value"
                                config={{ value: { label: chart.title, color: "var(--chart-2)" } }}
                                ariaLabel={chart.title}
                                height={Math.max(CHART_HEIGHT, chart.items.length * 28)}
                                color="var(--chart-2)"
                                valueFormatter={(value) => formatMetricValue(value, chart.format)}
                                table={{
                                    columns: [
                                        { key: "label", label: "Item" },
                                        { key: "value", label: "Valor" },
                                    ],
                                    rows: chart.items.map((item) => ({ label: item.label, value: formatMetricValue(item.value, chart.format) })),
                                }}
                            />
                        ) : (
                            <EmptyChart message="Sem dados no período." />
                        )}
                    </ChartCard>
                ))}
        </div>
    )
}
