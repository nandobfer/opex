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
    /** Abas antes da Visão geral (ex.: Conversas do Secretário, OPE-207). */
    leadingTabs?: readonly AgentPageTab[]
    /** Aba padrão, omitida da URL; sem ela, a Visão geral. */
    defaultTab?: string
    /** Motivo do aviso de disponibilidade vindo da página (as antigas já têm o hook); padrão: o da Visão geral. */
    availabilityReason?: string | null
    /** Ações à direita do Configurar (ex.: "Revisar PR"). */
    actions?: ReactNode
}

const NO_TABS: readonly AgentPageTab[] = []

/**
 * Página de um agente (OPE-122): cabeçalho do catálogo ("Agente X" + Configurar), aviso de
 * disponibilidade e as abas na URL (`?aba=`) — as abas iniciais (`leadingTabs`), a **Visão geral**, o
 * Histórico (agentes novos) e as abas próprias. A padrão (fora da URL) é a Visão geral, salvo `defaultTab`. Os filtros (período, cliente, repositório) ficam na URL e valem
 * para a Visão geral e o Histórico. Atualiza em tempo real.
 */
export function AgentPage({ agent, tabs = NO_TABS, leadingTabs = NO_TABS, defaultTab = OVERVIEW_TAB, availabilityReason, actions }: AgentPageProps) {
    const def = agentDef(agent)
    useAgentMetricsRealtime(agent)
    const allTabs = useMemo<{ value: string; label: string }[]>(
        () => [
            ...leadingTabs.map(({ value, label }) => ({ value, label })),
            { value: OVERVIEW_TAB, label: "Visão geral" },
            ...(def.hasHistory ? [{ value: HISTORY_TAB, label: "Histórico" }] : []),
            ...tabs.map(({ value, label }) => ({ value, label })),
        ],
        [def.hasHistory, leadingTabs, tabs],
    )
    const tabValues = useMemo(() => allTabs.map((tab) => tab.value), [allTabs])
    const tabSchema = useMemo<UrlFilterSchema<{ aba: string }>>(() => ({ aba: urlFilterCodecs.string(tabValues) }), [tabValues])
    const tabDefaults = useMemo(() => ({ aba: defaultTab }), [defaultTab])
    const [{ aba }, setTab] = useUrlFilters(tabDefaults, tabSchema)
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
                [...leadingTabs, ...tabs].find((tab) => tab.value === aba)?.render()
            )}
        </AgentPageFrame>
    )
}
