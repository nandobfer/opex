"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { Archive, Flag, Github, Layers, ListChecks, Shapes, Tag, type LucideIcon } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_SORT_KEYS, TASK_SORT_LABELS, TASK_TYPES, TASK_TYPE_LABELS, type TaskPriority, type TaskSortKey, type TaskType } from "../constants"
import { DEFAULT_TASK_FILTERS, TASK_FILTER_KEYS, taskRepoOptions, type TaskFilters } from "../filters"
import type { TaskDto, TaskOptionsDto } from "../types"
import type { BoardColumnView } from "../board"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { activeTaskFilterChips } from "../filter-chips"
import { useOwnerRepoRecents } from "@/features/repository-recency/hooks"
import { newlySelected, orderByRecency } from "@/features/repository-recency/ordering"
import { useTaskTaxonomy } from "./TaskTaxonomyProvider"
import { ColumnBadge } from "./TaskBadges"

interface TaskFiltersBarProps {
    filters: TaskFilters
    setFilters: Dispatch<SetStateAction<TaskFilters>>
    total: number
    tasks: readonly TaskDto[]
    options: TaskOptionsDto | undefined
    columns: readonly BoardColumnView[]
}

const COL = "min-w-[160px] flex-1"

interface FilterSwitchProps {
    icon: LucideIcon
    text: string
    ariaLabel: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}

/** Switch de filtro com ícone e texto, na altura dos demais campos (`h-10`) e com o fundo do card. */
function FilterSwitch({ icon: Icon, text, ariaLabel, checked, onCheckedChange }: FilterSwitchProps) {
    return (
        <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-transparent px-3">
            <Icon className={checked ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} aria-hidden />
            <span className="text-sm">{text}</span>
            <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={ariaLabel} />
        </div>
    )
}

/** Filtros da tela de Tarefas (`ListFilters` do projeto). Os valores ficam no navegador. */
export function TaskFiltersBar({ filters, setFilters, total, tasks, options, columns }: TaskFiltersBarProps) {
    const byKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns])
    const set = <K extends keyof TaskFilters>(key: K) => (value: TaskFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }))

    const repoOptions = useMemo(() => taskRepoOptions(options?.projects ?? [], tasks), [options, tasks])
    const projectById = useMemo(() => new Map(repoOptions.map((option) => [option.value, option.project])), [repoOptions])
    const repoIndex = useRepoIndex()
    const { recents, record } = useOwnerRepoRecents()
    // Repositórios usados recentemente primeiro; os demais seguem a ordem alfabética de `repoOptions`.
    const orderedRepoOptions = useMemo(() => orderByRecency(repoOptions, recents, (option) => option.value), [repoOptions, recents])
    const taxonomy = useTaskTaxonomy()
    const tagById = useMemo(() => new Map(taxonomy.map((tag) => [tag.id, tag.label])), [taxonomy])

    const chips = useMemo(() => {
        const ctx = {
            projects: new Map(repoOptions.map((option) => [option.value, option.label])),
            columns: new Map(columns.map((column) => [column.key, column.label])),
            tags: tagById,
        }
        return activeTaskFilterChips(filters, ctx).map(({ remove, ...chip }) => ({ ...chip, onRemove: () => setFilters((prev) => ({ ...prev, ...remove })) }))
    }, [filters, repoOptions, columns, tagById, setFilters])

    const clear = () => setFilters((prev) => ({ ...prev, ...Object.fromEntries(TASK_FILTER_KEYS.map((key) => [key, DEFAULT_TASK_FILTERS[key]])) }) as TaskFilters)

    return (
        <ListFilters
            collapsible
            chips={chips}
            total={total}
            search={{ value: filters.search, onChange: set("search"), placeholder: "Código ou título (ex.: OPX-123)" }}
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
                    <FilterGroup label="Tags" className={COL}>
                        <CadastroMultiSelect
                            icon={Tag}
                            placeholder="Todas"
                            options={taxonomy.map((tag) => ({ value: tag.id, label: tag.label }))}
                            selected={filters.tags}
                            onSelect={set("tags")}
                            searchable
                            searchPlaceholder="Buscar tag..."
                        />
                    </FilterGroup>
                    <FilterGroup label="Ordenar cards" className={COL}>
                        <Select value={filters.sort} onValueChange={(value) => set("sort")(value as TaskSortKey)}>
                            <SelectTrigger className="h-10" aria-label="Ordenar cards">
                                <ListChecks className="mr-2 h-4 w-4 opacity-50 text-primary" aria-hidden />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TASK_SORT_KEYS.map((key) => (
                                    <SelectItem key={key} value={key}>
                                        {TASK_SORT_LABELS[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FilterGroup>
                    <FilterGroup label="Arquivadas" className="shrink-0">
                        <FilterSwitch icon={Archive} text="Mostrar" ariaLabel="Mostrar tarefas arquivadas" checked={filters.showArchived} onCheckedChange={set("showArchived")} />
                    </FilterGroup>
                </>
            }
        >
            <FilterGroup label="Repositório" className={COL}>
                <CadastroMultiSelect
                    icon={Github}
                    placeholder="Todos"
                    options={orderedRepoOptions.map((option) => ({ value: option.value, label: option.label }))}
                    renderLabel={(option) => {
                        const project = projectById.get(option.value)
                        return project ? <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} /> : option.label
                    }}
                    selected={filters.projects}
                    onSelect={(values) => {
                        // Registra só as inclusões: remover/limpar filtro não é uso recente.
                        for (const value of newlySelected(filters.projects, values)) record(value)
                        set("projects")(values)
                    }}
                    searchable
                    searchPlaceholder="Buscar repositório..."
                />
            </FilterGroup>
            <FilterGroup label="Coluna" className={COL}>
                <CadastroMultiSelect
                    icon={Layers}
                    placeholder="Todas"
                    options={columns.map((column) => ({ value: column.key, label: column.label }))}
                    renderLabel={(option) => {
                        const column = byKey.get(option.value)
                        return column ? <ColumnBadge column={column} /> : option.label
                    }}
                    selected={filters.columns.filter((key) => byKey.has(key))}
                    onSelect={set("columns")}
                />
            </FilterGroup>
        </ListFilters>
    )
}
