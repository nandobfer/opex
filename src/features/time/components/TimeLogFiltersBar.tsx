"use client"

import type { Dispatch, SetStateAction } from "react"
import { Github, Shapes } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import type { ProjectRef } from "@/features/tasks/types"
import { TIME_LOG_TYPE_OPTIONS, type TimeLogFilters } from "../filters"

interface TimeLogFiltersBarProps {
    filters: TimeLogFilters
    setFilters: Dispatch<SetStateAction<TimeLogFilters>>
    /** Zera período, repositórios e tipos (volta ao padrão da tela). */
    onClear: () => void
    /** Apontamentos no recorte atual (contador do cartão de filtros). */
    total: number
    /** Repositórios vinculados (Integrações › GitHub). */
    projects: readonly ProjectRef[]
    /** A consulta dos repositórios falhou. */
    projectsError?: boolean
    onRetryProjects?: () => void
}

/**
 * Filtros das Horas agênticas (`ListFilters` do projeto): período (`PresetDateRangeFilter`),
 * **Repositório** e **Tipo** — os dois últimos por multiseleção. Tudo vai à API, que faz o recorte.
 */
export function TimeLogFiltersBar({ filters, setFilters, onClear, total, projects, projectsError, onRetryProjects }: TimeLogFiltersBarProps) {
    const repoIndex = useRepoIndex()
    const projectById = new Map(projects.map((project) => [project.id, project]))
    const set = <K extends keyof TimeLogFilters>(key: K) => (value: TimeLogFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }))

    return (
        <ListFilters total={total} onClear={onClear}>
            <FilterGroup label="Período" className="min-w-[220px] flex-[1.5]">
                <PresetDateRangeFilter
                    startDate={filters.from}
                    endDate={filters.to}
                    onChange={(next) => setFilters((prev) => ({ ...prev, from: next.startDate, to: next.endDate }))}
                />
            </FilterGroup>
            <FilterGroup label="Repositório" className="min-w-[180px] flex-1">
                <CadastroMultiSelect
                    icon={Github}
                    aria-label="Repositório"
                    placeholder="Todos"
                    options={projects.map((project) => ({ value: project.id, label: project.repo }))}
                    renderLabel={(option) => {
                        const project = projectById.get(option.value)
                        return project ? <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} /> : option.label
                    }}
                    selected={filters.projects}
                    onSelect={set("projects")}
                    searchable
                    searchPlaceholder="Buscar repositório..."
                />
                {projectsError && (
                    <p className="text-xs text-destructive">
                        Não foi possível carregar os repositórios.{" "}
                        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onRetryProjects}>
                            Tentar novamente
                        </Button>
                    </p>
                )}
            </FilterGroup>
            <FilterGroup label="Tipo" className="min-w-[160px] flex-1">
                <CadastroMultiSelect
                    icon={Shapes}
                    aria-label="Tipo"
                    placeholder="Todos"
                    options={[...TIME_LOG_TYPE_OPTIONS]}
                    selected={filters.types}
                    onSelect={(values) => set("types")(values as TimeLogFilters["types"])}
                />
            </FilterGroup>
        </ListFilters>
    )
}
