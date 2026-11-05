"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Repeat, SearchX } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { VIRTUALIZE_AFTER, VirtualStack } from "@/components/list/VirtualStack"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { apiErrorMessage } from "@/lib/api"
import { agentDef } from "@/features/agent-metrics/catalog"
import { routineSettingsHref } from "../../constants"
import { DEFAULT_ROUTINE_LIST_FILTERS, filterRoutineAgents, ROUTINE_LIST_FILTER_SCHEMA, routineMetricsParams } from "../../list-filters"
import { useRoutineAgents } from "../../hooks/useRoutineAgents"
import { useRoutineAgentsMetrics } from "../../hooks/useRoutineRuns"
import { useRoutineRealtime } from "../../hooks/useRoutineRealtime"
import type { RoutineAgentDto } from "../../types"
import { RoutineAgentRow } from "./RoutineAgentRow"
import { RoutineAgentsFilters } from "./RoutineAgentsFilters"
import { ROUTINE_ROW_CHART_CLASS, ROUTINE_ROW_GRID, ROUTINE_ROW_KPI_HEIGHT, ROUTINE_ROW_KPIS, ROUTINE_ROWS_GAP } from "./routine-agents-layout"

/** Altura estimada de uma linha na lista virtualizada (mais de 50 agentes). */
const ROUTINE_ROW_ESTIMATE = 220
const scrollRef = { get current() { return typeof document === "undefined" ? null : document.getElementById(APP_SCROLL_CONTAINER_ID) } }

/** Skeleton com a mesma grade das linhas (identificação | KPIs | gráfico). */
export function RoutineAgentsSkeleton() {
    return (
        <div className={ROUTINE_ROWS_GAP} data-testid="routine-agents-skeleton">
            {[0, 1, 2].map((index) => (
                <Card key={index}>
                    <div className={ROUTINE_ROW_GRID}>
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-3 w-1/2" />
                            <Skeleton className="h-3 w-3/4" />
                        </div>
                        <div className={ROUTINE_ROW_KPIS}>
                            {[0, 1, 2, 3].map((kpi) => (
                                <Skeleton key={kpi} className={`${ROUTINE_ROW_KPI_HEIGHT} w-full rounded-lg`} />
                            ))}
                        </div>
                        <Skeleton className={`${ROUTINE_ROW_CHART_CLASS} w-full rounded-lg`} />
                    </div>
                </Card>
            ))}
        </div>
    )
}

/**
 * `/agentes-rotineiros` (OPE-130, D18): uma linha por agente não arquivado, com identificação, KPIs e
 * "Execuções por dia" no período dos filtros (busca, status, motor e período, na URL). As métricas de
 * todos vêm numa chamada só (`GET /api/routine-agents/metrics`). Atualiza em tempo real.
 */
export function RoutineAgentsPage() {
    const def = agentDef("rotineiros")
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const query = useRoutineAgents("current")
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_ROUTINE_LIST_FILTERS, ROUTINE_LIST_FILTER_SCHEMA)
    const params = useMemo(() => routineMetricsParams(filters), [filters])
    const metrics = useRoutineAgentsMetrics(params)
    useRoutineRealtime()
    const agents = useMemo(() => query.data ?? [], [query.data])
    const visible = useMemo(() => filterRoutineAgents(agents, filters), [agents, filters])
    const metricsOf = (agent: RoutineAgentDto) =>
        metrics.isLoading && !metrics.data ? ({ status: "loading" } as const) : metrics.isError && !metrics.data ? ({ status: "error" } as const) : ({ status: "ready", metrics: metrics.data?.[agent.id] } as const)
    const row = (agent: RoutineAgentDto) => <RoutineAgentRow agent={agent} metrics={metricsOf(agent)} />
    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <AgentPageHeader icon={def.icon} title={def.title} description={def.description} settingsHref={routineSettingsHref()} />
            {query.isError ? (
                <ErrorState title="Não foi possível carregar os agentes rotineiros" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !query.isLoading && agents.length === 0 ? (
                <EmptyState icon={Repeat} title="Nenhum agente rotineiro" description="Crie um agente autônomo com objetivo, ferramentas e gatilhos." actionLabel="Novo agente rotineiro" onAction={() => router.push(routineSettingsHref("novo"))} />
            ) : (
                <>
                    <RoutineAgentsFilters filters={filters} total={visible.length} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onClear={resetFilters} />
                    {metrics.isError && metrics.data === undefined && !query.isLoading && (
                        <ErrorState title="Não foi possível carregar as métricas" description={apiErrorMessage(metrics.error, "Tente novamente.")} onRetry={() => void metrics.refetch()} />
                    )}
                    {query.isLoading ? (
                        <RoutineAgentsSkeleton />
                    ) : visible.length === 0 ? (
                        <EmptyState icon={SearchX} title="Nenhum agente com esses filtros" description="Ajuste a busca, o status ou o motor." actionLabel="Limpar filtros" onAction={resetFilters} />
                    ) : visible.length > VIRTUALIZE_AFTER ? (
                        <VirtualStack className={ROUTINE_ROWS_GAP} count={visible.length} scrollRef={scrollRef} estimateSize={ROUTINE_ROW_ESTIMATE} getKey={(index) => visible[index]!.id} renderItem={(index) => row(visible[index]!)} />
                    ) : (
                        <motion.div layout={!reduceMotion} className={ROUTINE_ROWS_GAP}>
                            <AnimatePresence initial={false}>
                                {visible.map((agent, index) => (
                                    <motion.div key={agent.id} layout={!reduceMotion} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}>
                                        {row(agent)}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </>
            )}
        </motion.section>
    )
}
