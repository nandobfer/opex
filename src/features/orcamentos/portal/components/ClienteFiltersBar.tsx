"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { Flag, Github, Layers, Shapes } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_TYPES, TASK_TYPE_LABELS, type TaskPriority, type TaskType } from "@/features/tasks/constants"
import { DEFAULT_TASK_FILTERS, TASK_FILTER_KEYS, taskRepoOptions, type FilterableTask, type TaskFilters } from "@/features/tasks/filters"
import type { BoardColumnView } from "@/features/tasks/board"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelFrom, repoLabelIndex } from "@/features/orcamentos/logic"
import type { ClienteRepoDto } from "@/features/orcamentos/types"

const COL = "min-w-[160px] flex-1"

interface ClienteFiltersBarProps {
    filters: TaskFilters
    setFilters: Dispatch<SetStateAction<TaskFilters>>
    total: number
    tasks: readonly FilterableTask[]
    projects: readonly ClienteRepoDto[]
    columns: readonly BoardColumnView[]
}

/** Filtros do portal: repositório limitado aos permitidos ao cliente. */
export function ClienteFiltersBar({ filters, setFilters, total, tasks, projects, columns }: ClienteFiltersBarProps) {
    const set = <K extends keyof TaskFilters>(key: K) => (value: TaskFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }))
    const repoOptions = useMemo(() => taskRepoOptions(projects, tasks), [projects, tasks])
    const repoIndex = useMemo(() => repoLabelIndex(projects), [projects])
    const clear = () => setFilters((prev) => ({ ...prev, ...Object.fromEntries(TASK_FILTER_KEYS.map((key) => [key, DEFAULT_TASK_FILTERS[key]])) }) as TaskFilters)

    return (
        <ListFilters
            collapsible
            total={total}
            search={{ value: filters.search, onChange: set("search"), placeholder: "Código ou título" }}
            onClear={clear}
            secondary={
                <>
                    <FilterGroup label="Prioridade" className={COL}>
                        <CadastroMultiSelect
                            icon={Flag}
                            placeholder="Todas"
                            options={TASK_PRIORITIES.map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))}
                            selected={filters.priorities}
                            onSelect={(values) => set("priorities")(values as TaskPriority[])}
                        />
                    </FilterGroup>
                    <FilterGroup label="Tipo" className={COL}>
                        <CadastroMultiSelect
                            icon={Shapes}
                            placeholder="Todos"
                            options={TASK_TYPES.map((value) => ({ value, label: TASK_TYPE_LABELS[value] }))}
                            selected={filters.types}
                            onSelect={(values) => set("types")(values as TaskType[])}
                        />
                    </FilterGroup>
                </>
            }
        >
            <FilterGroup label="Repositório" className={COL}>
                <CadastroMultiSelect
                    icon={Github}
                    placeholder="Todos"
                    options={repoOptions.map((option) => ({ value: option.value, label: option.label }))}
                    renderLabel={(option) => {
                        const project = repoOptions.find((item) => item.value === option.value)?.project
                        return project ? <GithubRepoLabel repo={repoLabelFrom(project.repo, repoIndex)} /> : option.label
                    }}
                    selected={filters.projects}
                    onSelect={set("projects")}
                    searchable
                    searchPlaceholder="Buscar repositório..."
                />
            </FilterGroup>
            <FilterGroup label="Coluna" className={COL}>
                <CadastroMultiSelect
                    icon={Layers}
                    placeholder="Todas"
                    options={columns.map((column) => ({ value: column.key, label: column.label }))}
                    selected={filters.columns}
                    onSelect={set("columns")}
                />
            </FilterGroup>
        </ListFilters>
    )
}
