"use client"

import { BarChart3 } from "lucide-react"
import { DataSinceNotice } from "@/components/metrics/DataSinceNotice"
import { MetricsOverviewSkeleton } from "@/components/metrics/MetricsOverviewSkeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { AgentId } from "../catalog"
import type { AgentMetricsDto } from "../types"
import { OverviewCharts } from "./OverviewCharts"
import { OverviewKpis } from "./OverviewKpis"

interface AgentOverviewTabProps {
    agent: AgentId
    query: { data: AgentMetricsDto | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }
}

/**
 * Aba **Visão geral**: Último uso e Uso por data (sempre) e as métricas do agente. Sem base no período,
 * as métricas dão lugar a um estado vazio que explica o motivo; métricas não retroativas mostram
 * "Dados desde dd/mm/aaaa".
 */
export function AgentOverviewTab({ agent, query }: AgentOverviewTabProps) {
    if (query.isLoading && !query.data) return <MetricsOverviewSkeleton />
    if (query.isError || !query.data)
        return <ErrorState title="Não foi possível carregar a visão geral" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const data = query.data
    const hasBase = data.baseCount > 0
    return (
        <div className="space-y-4">
            <DataSinceNotice notices={data.notices} />
            <OverviewKpis lastUsedAt={data.lastUsedAt} kpis={hasBase ? data.kpis : []} />
            {!hasBase && <EmptyState icon={BarChart3} title="Sem dados no período" description={data.emptyReason} />}
            <OverviewCharts agent={agent} data={data} showSpecific={hasBase} />
            {hasBase && data.baseLabel && <p className="text-right text-[11px] text-muted-foreground">Base: {data.baseLabel}</p>}
        </div>
    )
}
