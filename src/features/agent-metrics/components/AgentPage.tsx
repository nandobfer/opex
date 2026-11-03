"use client"

import { useMemo, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { OptionTabs } from "@/components/ui/option-tabs"
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
const tabMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }

/**
 * Página de um agente (OPE-122): cabeçalho do catálogo ("Agente X" + Configurar), aviso de
 * disponibilidade e as abas na URL (`?aba=`) — **Visão geral** primeiro e padrão, depois o Histórico
 * (agentes novos) e as abas próprias. Os filtros (período, cliente, repositório) ficam na URL e valem
 * para a Visão geral e o Histórico. Atualiza em tempo real.
 */
export function AgentPage({ agent, tabs = [], availabilityReason, actions }: AgentPageProps) {
    const reduceMotion = useReducedMotion()
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
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <AgentPageHeader icon={def.icon} title={def.title} description={def.description} settingsHref={agentSettingsHref(agent)}>
                {actions}
            </AgentPageHeader>
            <AvailabilityNotice reason={reason} />
            <OptionTabs<string> id={`agent-page-tab-${agent}`} aria-label={`Abas do ${def.title}`} options={allTabs} value={aba} onChange={(value) => setTab({ aba: value })} className="w-full" />
            {withFilters && <AgentFiltersBar agent={agent} filters={filters} setFilters={setFilters} onClear={resetFilters} clients={metrics.data?.clients ?? []} projects={metrics.data?.projects ?? []} />}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={aba} {...tabMotion}>
                    {aba === OVERVIEW_TAB ? (
                        <AgentOverviewTab agent={agent} query={metrics} />
                    ) : aba === HISTORY_TAB ? (
                        <AgentHistoryTab agent={agent} params={params} filtering={filtering} onClearFilters={resetFilters} />
                    ) : (
                        tabs.find((tab) => tab.value === aba)?.render()
                    )}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}
