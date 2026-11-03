"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { FilterGroup } from "@/components/list/FilterGroup"
import { MetricsFiltersBar } from "@/components/metrics/MetricsFiltersBar"
import { Input } from "@/components/ui/input"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { agentDef, type AgentId } from "../catalog"
import type { AgentMetricsFilters } from "../filters"
import { DEFAULT_ESTIMATE_MARGIN, METRICS_PERIOD_LABELS, METRICS_PERIODS, parseMargin } from "../period"

interface AgentFiltersBarProps {
    agent: AgentId
    filters: AgentMetricsFilters
    setFilters: Dispatch<SetStateAction<AgentMetricsFilters>>
    onClear: () => void
    clients: readonly { id: string; name: string }[]
    projects: readonly { id: string; name: string; repo: string | null }[]
}

const PERIODS = METRICS_PERIODS.map((value) => ({ value, label: METRICS_PERIOD_LABELS[value] }))

/** Filtros da página do agente (período, cliente e repositório na URL; margem do Orçamentista). */
export function AgentFiltersBar({ agent, filters, setFilters, onClear, clients, projects }: AgentFiltersBarProps) {
    const def = agentDef(agent)
    const repoIndex = useRepoIndex()
    const repoById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
    return (
        <MetricsFiltersBar
            filters={filters}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            onClear={onClear}
            periods={PERIODS}
            customPeriod="custom"
            clients={def.filters.client ? clients.map((client) => ({ value: client.id, label: client.name })) : null}
            repos={def.filters.repo ? projects.map((project) => ({ value: project.id, label: project.repo ?? project.name })) : null}
            renderRepoLabel={(option) => {
                const project = repoById.get(option.value)
                return project?.repo ? <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} /> : option.label
            }}
        >
            {agent === "orcamentista" && (
                <FilterGroup label="Margem (±%)" className="min-w-[120px] flex-1">
                    <Input
                        type="number"
                        min={1}
                        max={100}
                        inputMode="numeric"
                        aria-label="Margem da estimativa em porcentagem"
                        className="h-9 bg-transparent"
                        placeholder={String(DEFAULT_ESTIMATE_MARGIN)}
                        value={filters.margem}
                        onChange={(event) => setFilters((current) => ({ ...current, margem: event.target.value }))}
                        onBlur={() => setFilters((current) => ({ ...current, margem: current.margem && parseMargin(current.margem) !== DEFAULT_ESTIMATE_MARGIN ? String(parseMargin(current.margem)) : "" }))}
                    />
                </FilterGroup>
            )}
        </MetricsFiltersBar>
    )
}
