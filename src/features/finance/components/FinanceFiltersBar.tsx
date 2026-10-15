"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { Building2, Github } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { Switch } from "@/components/ui/switch"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { financeClientOptions, financeRepoOptions, type FinanceFilters } from "../filters"
import type { ProjectRef } from "@/features/tasks/types"

const COL = "min-w-[160px] flex-1"

interface FinanceFiltersBarProps {
    filters: FinanceFilters
    setFilters: Dispatch<SetStateAction<FinanceFilters>>
    /** Zera período e seleções (botão Limpar do cartão de filtros). */
    onClear: () => void
    /** Total de tarefas do período (contador "N REGISTROS"). */
    total?: number
    /** Clientes do portal (inclui inativos). */
    clients: readonly { id: string; name: string }[]
    /** Projetos (repositórios vinculados). */
    projects: readonly ProjectRef[]
}

/**
 * Filtros da tela Financeiro (`ListFilters` do projeto): período (mês corrente por padrão), Clientes e
 * Repositórios — ambos multisseleção. Os valores ficam na URL e a filtragem é feita na API.
 */
export function FinanceFiltersBar({ filters, setFilters, onClear, total, clients, projects }: FinanceFiltersBarProps) {
    const repoIndex = useRepoIndex()
    const clientOptions = useMemo(() => financeClientOptions(clients), [clients])
    const repoOptions = useMemo(() => financeRepoOptions(projects), [projects])
    const projectById = useMemo(() => new Map(repoOptions.map((option) => [option.value, option.project])), [repoOptions])

    return (
        <ListFilters total={total} onClear={onClear}>
            <FilterGroup label="Período" className={COL}>
                <PresetDateRangeFilter
                    startDate={filters.from}
                    endDate={filters.to}
                    onChange={(next) => setFilters((prev) => ({ ...prev, from: next.startDate, to: next.endDate }))}
                />
            </FilterGroup>
            <FilterGroup label="Clientes" className={COL}>
                <CadastroMultiSelect
                    icon={Building2}
                    placeholder="Todos"
                    options={clientOptions}
                    selected={filters.clientIds}
                    onSelect={(values) => setFilters((prev) => ({ ...prev, clientIds: values }))}
                    searchable
                    searchPlaceholder="Buscar cliente..."
                />
            </FilterGroup>
            <FilterGroup label="Repositórios" className={COL}>
                <CadastroMultiSelect
                    icon={Github}
                    placeholder="Todos"
                    options={repoOptions.map((option) => ({ value: option.value, label: option.label }))}
                    renderLabel={(option) => {
                        const project = projectById.get(option.value)
                        return project ? <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} /> : option.label
                    }}
                    selected={filters.projectIds}
                    onSelect={(values) => setFilters((prev) => ({ ...prev, projectIds: values }))}
                    searchable
                    searchPlaceholder="Buscar repositório..."
                />
            </FilterGroup>
            <FilterGroup label="Arquivados" className={COL}>
                <label className="flex h-9 items-center gap-2 text-sm">
                    <Switch checked={filters.archived === "1"} onCheckedChange={(checked) => setFilters((prev) => ({ ...prev, archived: checked ? "1" : "" }))} aria-label="Mostrar serviços arquivados" />
                    <span className="text-muted-foreground">Mostrar arquivados</span>
                </label>
            </FilterGroup>
        </ListFilters>
    )
}
