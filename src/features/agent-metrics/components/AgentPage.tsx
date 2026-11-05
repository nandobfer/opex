"use client"

import { useMemo, type ReactNode } from "react"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { AgentPageFrame } from "@/components/list/AgentPageFrame"
import { urlFilterCodecs, useUrlFilters, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { agentDef, agentSettingsHref, type AgentId } from "../catalog"
import { AGENT_METRICS_FILTER_SCHEMA, DEFAULT_AGENT_METRICS_FILTERS } from "../filters"
import { useAgentMetrics, useAgentMetricsRealtime } from "../hooks/useAgentMetrics"
import { toMetricsParams } from "../period"
import { AgentFiltersBar } from "./AgentFiltersBar"
import { AgentHistoryTab } from "./AgentHistoryTab"
import { AgentOverviewTab } from "./AgentOverviewTab"

export const OVERVIEW_TAB = "visao-geral"
export const HISTORY_TAB = "historico"

export interface AgentPageTab {
    value: string
    label: string
    render: () => ReactNode
}

interface AgentPageProps {
    agent: AgentId
    /** Abas depois da Visão geral (e do Histórico, nos agentes novos): as atuais das páginas antigas, Memórias. */
    tabs?: readonly AgentPageTab[]
    /** Motivo do aviso de disponibilidade vindo da página (as antigas já têm o hook); padrão: o da Visão geral. */
    availabilityReason?: string | null
    /** Ações à direita do Configurar (ex.: "Revisar PR"). */
    actions?: ReactNode
}

const TAB_DEFAULTS = { aba: OVERVIEW_TAB }

/**
 * Página de um agente (OPE-122): cabeçalho do catálogo ("Agente X" + Configurar), aviso de
 * disponibilidade e as abas na URL (`?aba=`) — **Visão geral** primeiro e padrão, depois o Histórico
 * (agentes novos) e as abas próprias. Os filtros (período, cliente, repositório) ficam na URL e valem
 * para a Visão geral e o Histórico. Atualiza em tempo real.
 */
export function AgentPage({ agent, tabs = [], availabilityReason, actions }: AgentPageProps) {
    const def = agentDef(agent)
    useAgentMetricsRealtime(agent)
    const allTabs = useMemo<{ value: string; label: string }[]>(
        () => [{ value: OVERVIEW_TAB, label: "Visão geral" }, ...(def.hasHistory ? [{ value: HISTORY_TAB, label: "Histórico" }] : []), ...tabs.map(({ value, label }) => ({ value, label }))],
        [def.hasHistory, tabs],
    )
    const tabValues = useMemo(() => allTabs.map((tab) => tab.value), [allTabs])
    const tabSchema = useMemo<UrlFilterSchema<{ aba: string }>>(() => ({ aba: urlFilterCodecs.string(tabValues) }), [tabValues])
    const [{ aba }, setTab] = useUrlFilters(TAB_DEFAULTS, tabSchema)
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_AGENT_METRICS_FILTERS, AGENT_METRICS_FILTER_SCHEMA)
    const params = useMemo(() => toMetricsParams(filters), [filters])
    const withFilters = aba === OVERVIEW_TAB || aba === HISTORY_TAB
    // A Visão geral também traz o aviso de disponibilidade das páginas novas.
    const metrics = useAgentMetrics(agent, params, aba === OVERVIEW_TAB || availabilityReason === undefined)
    const reason = availabilityReason !== undefined ? availabilityReason : metrics.data && !metrics.data.availability.available ? metrics.data.availability.reason : null
    const filtering = filters.clientes.length > 0 || filters.repositorios.length > 0 || filters.periodo !== DEFAULT_AGENT_METRICS_FILTERS.periodo

    return (
        <AgentPageFrame
            id={agent}
            icon={def.icon}
            title={def.title}
            description={def.description}
            settingsHref={agentSettingsHref(agent)}
            actions={actions}
            notice={<AvailabilityNotice reason={reason} />}
            tabs={allTabs}
            tab={aba}
            onTabChange={(value) => setTab({ aba: value })}
            filters={withFilters && <AgentFiltersBar agent={agent} filters={filters} setFilters={setFilters} onClear={resetFilters} clients={metrics.data?.clients ?? []} projects={metrics.data?.projects ?? []} />}
        >
            {aba === OVERVIEW_TAB ? (
                <AgentOverviewTab agent={agent} query={metrics} />
            ) : aba === HISTORY_TAB ? (
                <AgentHistoryTab agent={agent} params={params} filtering={filtering} onClearFilters={resetFilters} />
            ) : (
                tabs.find((tab) => tab.value === aba)?.render()
            )}
        </AgentPageFrame>
    )
}
