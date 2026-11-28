"use client"

import { BarChart3 } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { ChartCard } from "@/components/metrics/charts/ChartCard"
import { KpiCard, KpiGrid } from "@/components/metrics/KpiCard"
import { MetricsOverviewSkeleton } from "@/components/metrics/MetricsOverviewSkeleton"
import { MultiLineChart } from "@/components/metrics/MultiLineChart"
import { UsageByDateChart } from "@/components/metrics/UsageByDateChart"
import { formatMetricValue } from "@/components/metrics/format"
import { CHART_GRID } from "@/components/metrics/layout"
import { apiErrorMessage } from "@/lib/api"
import { formatDuration } from "../../format"
import { useRoutineMetrics } from "../../hooks/useRoutineRuns"
import { RoutineCostBreakdownChart, RoutineCostByDayChart, RoutineCostNotices } from "./RoutineCostCharts"
import { RoutineCostKpis } from "./RoutineCostKpis"
import { ROUTINE_OVERVIEW_CHART_COUNT, ROUTINE_OVERVIEW_KPI_COUNT } from "./routine-agents-layout"

/**
 * **Visão geral** do agente rotineiro: KPIs (execuções, concluídas, com erro, tempo médio, tokens) e os de custo
 * (OPE-203: tabela, efetivo, economia e médias), o custo por dia, os gráficos de execuções e tokens e a divisão do
 * custo por provedor, modelo e chave/plano no período escolhido.
 */
export function RoutineOverviewTab({ agentId, params }: { agentId: string; params: Record<string, string> }) {
    const query = useRoutineMetrics(agentId, params)
    if (query.isLoading && !query.data) return <MetricsOverviewSkeleton kpis={ROUTINE_OVERVIEW_KPI_COUNT} charts={ROUTINE_OVERVIEW_CHART_COUNT} />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a visão geral" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const { kpis, days, cost, breakdown } = query.data
    const count = (value: number) => formatMetricValue(value, "count")
    return (
        <div className="space-y-4">
            <KpiGrid>
                <KpiCard label="Execuções" hint="Disparadas no período" value={kpis.runs} formatter={count} />
                <KpiCard label="Concluídas" hint="Terminaram com o relato final" value={kpis.completed} formatter={count} />
                <KpiCard label="Com erro" hint="Falha, limite ou turno perdido" value={kpis.errors} formatter={count} />
                <KpiCard label="Tempo médio" hint="Executando + Esperando, por execução" value={kpis.avgDurationMs} formatter={(value) => formatDuration(value)} />
                <KpiCard label="Tokens" hint="Somados no período" value={kpis.tokens} formatter={(value) => formatMetricValue(value, "tokens")} />
                <RoutineCostKpis cost={cost} />
            </KpiGrid>
            <RoutineCostNotices cost={cost.totals} />
            {kpis.runs === 0 && <EmptyState icon={BarChart3} title="Sem execuções no período" description="Execute o agente ou ajuste o período." />}
            <div className={CHART_GRID}>
                <RoutineCostByDayChart agentId={agentId} days={days} />
                <ChartCard title="Execuções por dia" description="Quantidade por dia, com as que terminaram em erro.">
                    <UsageByDateChart points={days.map((day) => ({ bucket: day.day, runs: day.runs, failures: day.errors }))} unit="execuções" />
                </ChartCard>
                <ChartCard title="Tokens por dia" description="Tokens consumidos pelas execuções do dia.">
                    <MultiLineChart persistKey={`rotineiro:${agentId}:tokens`} series={[{ key: "tokens", label: "Tokens", defaultSelected: true }]} points={days.map((day) => ({ bucket: day.day, tokens: day.tokens }))} format="tokens" ariaLabel="Tokens por dia" bucketMode="day" />
                </ChartCard>
                <RoutineCostBreakdownChart breakdown={breakdown} />
            </div>
        </div>
    )
}
