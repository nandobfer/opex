"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { Github } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelFrom, repoLabelIndex } from "../../logic"
import type { ClienteRepoDto } from "../../types"
import type { ClienteFinanceFilters } from "../filters"

const COL = "min-w-[160px] flex-1"

interface ClienteFinanceFiltersBarProps {
    filters: ClienteFinanceFilters
    setFilters: Dispatch<SetStateAction<ClienteFinanceFilters>>
    /** Zera período e seleções (botão Limpar do cartão de filtros). */
    onClear: () => void
    /** Total de tarefas do período (contador "N REGISTROS"). */
    total?: number
    /** Repositórios liberados ao cliente. */
    projects: readonly ClienteRepoDto[]
}

/**
 * Filtros da tela Financeiro do portal (`ListFilters` do projeto): **Período** (`PresetDateRangeFilter`)
 * e **Repositórios** (multisseleção com busca). Os valores ficam na URL, no mesmo padrão do
 * Financeiro do dono; não há filtro de clientes porque o cliente é o da sessão.
 */
export function ClienteFinanceFiltersBar({ filters, setFilters, onClear, total, projects }: ClienteFinanceFiltersBarProps) {
    const repoIndex = useMemo(() => repoLabelIndex(projects), [projects])
    const repoById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
    const repoOptions = useMemo(
        () => projects.map((project) => ({ value: project.id, label: project.repo })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
        [projects],
    )

    return (
        <ListFilters total={total} onClear={onClear}>
            <FilterGroup label="Período" className={COL}>
                <PresetDateRangeFilter
                    startDate={filters.from}
                    endDate={filters.to}
                    onChange={(next) => setFilters((prev) => ({ ...prev, from: next.startDate, to: next.endDate }))}
                />
            </FilterGroup>
            <FilterGroup label="Repositórios" className={COL}>
                <CadastroMultiSelect
                    icon={Github}
                    placeholder="Todos"
                    options={repoOptions}
                    renderLabel={(option) => {
                        const project = repoById.get(option.value)
                        return project ? <GithubRepoLabel repo={repoLabelFrom(project.repo, repoIndex)} /> : option.label
                    }}
                    selected={filters.projectIds}
                    onSelect={(values) => setFilters((prev) => ({ ...prev, projectIds: values }))}
                    searchable
                    searchPlaceholder="Buscar repositório..."
                />
            </FilterGroup>
        </ListFilters>
    )
}
