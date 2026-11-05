"use client"

import { useMemo } from "react"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { MetricsFiltersBar } from "@/components/metrics/MetricsFiltersBar"
import { AgentPageFrame } from "@/components/list/AgentPageFrame"
import { Skeleton } from "@/components/ui/skeleton"
import { urlFilterCodecs, useUrlFilters, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { apiErrorMessage } from "@/lib/api"
import { agentDef } from "@/features/agent-metrics/catalog"
import { AGENT_METRICS_FILTER_SCHEMA, DEFAULT_AGENT_METRICS_FILTERS } from "@/features/agent-metrics/filters"
import { METRICS_PERIOD_LABELS, METRICS_PERIODS } from "@/features/agent-metrics/period"
import { ROUTINE_PROVISIONING_LABELS } from "../../status"
import { ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE } from "../../schemas"
import { useRoutineAgent } from "../../hooks/useRoutineAgents"
import { useRoutineRealtime } from "../../hooks/useRoutineRealtime"
import { RoutineAgentEditor } from "../editor/RoutineAgentEditor"
import { RoutineRunDetailSheet } from "../runs/RoutineRunDetailSheet"
import { RoutineRunsTab } from "../runs/RoutineRunsTab"
import { RunNowDialog } from "../runs/RunNowDialog"
import { RoutineEntriesTab } from "./RoutineEntriesTab"
import { RoutineMemoriesTab } from "./RoutineMemoriesTab"
import { RoutineOverviewTab } from "./RoutineOverviewTab"
import { RoutineSecretsTab } from "./secrets/RoutineSecretsTab"

const TABS = [
    { value: "visao-geral", label: "Visão geral" },
    { value: "execucoes", label: "Execuções" },
    { value: "entradas", label: "Entradas" },
    { value: "memorias", label: "Memórias" },
    { value: "segredos", label: "Segredos" },
]
const PAGE_DEFAULTS = { aba: "visao-geral", execucao: "", configurar: "" }
const PAGE_SCHEMA: UrlFilterSchema<typeof PAGE_DEFAULTS> = { aba: urlFilterCodecs.string(TABS.map((tab) => tab.value)), execucao: urlFilterCodecs.string(), configurar: urlFilterCodecs.string(["1"]) }
const PERIODS = METRICS_PERIODS.map((value) => ({ value, label: METRICS_PERIOD_LABELS[value] }))

/** Por que "Executar agora" está desabilitado (`null` = pode executar). */
export function runDisabledReason(agent: { status: string; provisioning: { status: keyof typeof ROUTINE_PROVISIONING_LABELS }; engine?: string; opex?: { provider: string | null } }): string | null {
    if (agent.status !== "active") return "Retome o agente para executar"
    if (agent.provisioning.status !== "ok") return ROUTINE_PROVISIONING_LABELS[agent.provisioning.status]
    // D9: o DTO devolve o provedor vazio quando o gravado não vale no motor Opex.
    if (agent.engine === "opex" && agent.opex && !agent.opex.provider) return ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE
    return null
}

/**
 * `/agentes-rotineiros/[id]` (OPE-130), no padrão das páginas de agente (`AgentPageFrame`): Configurar
 * (abre o editor na própria página, D20),
 * "Executar agora" e as abas na URL — Visão geral (com o filtro de período compartilhado), Execuções
 * (detalhe em `?execucao=`), Entradas, Memórias e Segredos. Atualiza em tempo real.
 */
export function RoutineAgentPage({ id }: { id: string }) {
    const def = agentDef("rotineiros")
    const query = useRoutineAgent(id)
    useRoutineRealtime()
    const [{ aba, execucao, configurar }, setPage] = useUrlFilters(PAGE_DEFAULTS, PAGE_SCHEMA)
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_AGENT_METRICS_FILTERS, AGENT_METRICS_FILTER_SCHEMA)
    const params = useMemo(() => ({ periodo: filters.periodo, ...(filters.de ? { de: filters.de } : {}), ...(filters.ate ? { ate: filters.ate } : {}) }), [filters.periodo, filters.de, filters.ate])
    if (query.isLoading) return <Skeleton className="h-96 w-full" aria-label="Carregando o agente rotineiro" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar o agente rotineiro" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const agent = query.data
    const provisioningNotice = agent.provisioning.status === "error" ? `Provisionamento com erro: ${agent.provisioning.error ?? ""} Use "Tentar de novo" em Configurar.` : null
    return (
        <>
            <AgentPageFrame
                id={`rotineiro-${agent.slug}`}
                icon={def.icon}
                title={agent.title}
                description={agent.objective}
                // D20: "Configurar" abre o editor aqui mesmo (`?configurar=1`), sem ir para a integração.
                onSettings={() => setPage((current) => ({ ...current, configurar: "1" }))}
                actions={<RunNowDialog agentId={agent.id} disabledReason={runDisabledReason(agent)} />}
                notice={<AvailabilityNotice reason={provisioningNotice} />}
                tabs={TABS}
                tab={aba}
                onTabChange={(value) => setPage((current) => ({ ...current, aba: value }))}
                filters={
                    aba === "visao-geral" && (
                        <MetricsFiltersBar filters={filters} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onClear={resetFilters} periods={PERIODS} customPeriod="custom" clients={null} repos={null} />
                    )
                }
            >
                {aba === "visao-geral" && <RoutineOverviewTab agentId={agent.id} params={params} />}
                {aba === "execucoes" && <RoutineRunsTab agentId={agent.id} onOpen={(runId) => setPage((current) => ({ ...current, execucao: runId }))} />}
                {aba === "entradas" && <RoutineEntriesTab agentId={agent.id} />}
                {aba === "memorias" && <RoutineMemoriesTab slug={agent.slug} />}
                {aba === "segredos" && <RoutineSecretsTab agentId={agent.id} />}
            </AgentPageFrame>
            <RoutineAgentEditor agentId={agent.id} open={configurar === "1"} onClose={() => setPage((current) => ({ ...current, configurar: "" }))} />
            <RoutineRunDetailSheet agentId={agent.id} runId={execucao || null} onClose={() => setPage((current) => ({ ...current, execucao: "" }))} />
        </>
    )
}
