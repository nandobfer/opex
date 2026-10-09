"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { Archive, Boxes, Flag, FolderKanban, Layers, ListChecks, Shapes, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { cn } from "@/lib/utils"
import {
    TASK_PRIORITIES,
    TASK_PRIORITY_LABELS,
    TASK_SORT_KEYS,
    TASK_SORT_LABELS,
    TASK_TYPES,
    TASK_TYPE_LABELS,
    UNASSIGNED,
    type TaskPriority,
    type TaskSortKey,
    type TaskType,
} from "../constants"
import { DEFAULT_TASK_FILTERS, TASK_FILTER_KEYS, type TaskFilters } from "../filters"
import type { TaskDto, TaskOptionsDto } from "../types"
import type { BoardColumnView } from "../board"
import { activeTaskFilterChips } from "../filter-chips"
import { ColumnBadge } from "./TaskBadges"

interface TaskFiltersBarProps {
    filters: TaskFilters
    setFilters: Dispatch<SetStateAction<TaskFilters>>
    total: number
    tasks: readonly TaskDto[]
    options: TaskOptionsDto | undefined
    currentUserId: string | null
    columns: readonly BoardColumnView[]
}

const COL = "min-w-[160px] flex-1"

/**
 * Filtros da tela de Tarefas (`ListFilters` do projeto). Os valores ficam no navegador
 * (`usePersistentState`). Pacotes de trabalho saem das tarefas carregadas, limitados aos produtos
 * escolhidos.
 */
export function TaskFiltersBar({ filters, setFilters, total, tasks, options, currentUserId, columns }: TaskFiltersBarProps) {
    const byKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns])
    // Go! Sipal primeiro, depois as pessoais (cada grupo na ordem do quadro).
    const statusOptions = useMemo(
        () => [...columns.filter((column) => column.kind === "go"), ...columns.filter((column) => column.kind === "custom")].map((column) => ({ value: column.key, label: column.label })),
        [columns],
    )
    const set = <K extends keyof TaskFilters>(key: K) => (value: TaskFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }))

    const productOptions = useMemo(() => {
        const map = new Map((options?.products ?? []).map((product) => [product.id, product.name]))
        for (const task of tasks) if (task.product) map.set(task.product.id, task.product.name)
        return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
    }, [options, tasks])

    const assigneeOptions = useMemo(() => {
        const map = new Map((options?.developers ?? []).map((person) => [person.id, person.name]))
        for (const task of tasks) if (task.assignee) map.set(task.assignee.id, task.assignee.name)
        const people = [...map]
            .map(([value, label]) => ({ value, label: value === currentUserId ? `${label} (eu)` : label }))
            .sort((a, b) => (a.value === currentUserId ? -1 : b.value === currentUserId ? 1 : a.label.localeCompare(b.label, "pt-BR")))
        return [...people, { value: UNASSIGNED, label: "Sem responsável" }]
    }, [options, tasks, currentUserId])

    const workPackageOptions = useMemo(() => {
        const map = new Map<string, string>()
        for (const task of tasks) {
            if (!task.workPackage) continue
            if (filters.products.length && !filters.products.includes(task.product?.id ?? "")) continue
            map.set(task.workPackage.id, task.product && filters.products.length !== 1 ? `${task.workPackage.name} · ${task.product.name}` : task.workPackage.name)
        }
        return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
    }, [tasks, filters.products])

    const chips = useMemo(() => {
        const ctx = {
            products: new Map(productOptions.map((option) => [option.value, option.label])),
            people: new Map(assigneeOptions.map((option) => [option.value, option.label.replace(/ \(eu\)$/, "")])),
            workPackages: new Map(workPackageOptions.map((option) => [option.value, option.label])),
            columns: new Map(columns.map((column) => [column.key, column.label])),
            currentUserId,
        }
        // Pacotes de produtos fora do filtro somem das opções; o nome vem das tarefas.
        for (const task of tasks) if (task.workPackage && !ctx.workPackages.has(task.workPackage.id)) ctx.workPackages.set(task.workPackage.id, task.workPackage.name)
        return activeTaskFilterChips(filters, ctx).map(({ remove, ...chip }) => ({ ...chip, onRemove: () => setFilters((prev) => ({ ...prev, ...remove })) }))
    }, [filters, productOptions, assigneeOptions, workPackageOptions, columns, currentUserId, tasks, setFilters])

    const clear = () =>
        setFilters((prev) => ({ ...prev, ...Object.fromEntries(TASK_FILTER_KEYS.map((key) => [key, DEFAULT_TASK_FILTERS[key]])) }) as TaskFilters)

    return (
        <ListFilters
            collapsible
            chips={chips}
            total={total}
            search={{ value: filters.search, onChange: set("search"), placeholder: "Código ou título (ex.: GO-DEV-123)" }}
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
                    <FilterGroup label="Pacote de trabalho" className={COL}>
                        <CadastroMultiSelect
                            icon={Boxes}
                            placeholder={workPackageOptions.length ? "Todos" : "Nenhum pacote"}
                            options={workPackageOptions}
                            selected={filters.workPackages}
                            onSelect={set("workPackages")}
                            searchable
                            searchPlaceholder="Buscar pacote..."
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
                        <Button
                            type="button"
                            variant="outline"
                            aria-pressed={filters.showArchived}
                            onClick={() => set("showArchived")(!filters.showArchived)}
                            className={cn("h-10 gap-2", filters.showArchived && "border-primary bg-primary/15 text-primary hover:bg-primary/20")}
                        >
                            <Archive className="h-4 w-4" aria-hidden />
                            {filters.showArchived ? "Mostrando" : "Ocultas"}
                        </Button>
                    </FilterGroup>
                </>
            }
        >
            <FilterGroup label="Produto" className={COL}>
                <CadastroMultiSelect
                    icon={FolderKanban}
                    placeholder="Todos"
                    options={productOptions}
                    selected={filters.products}
                    onSelect={(values) => setFilters((prev) => ({ ...prev, products: values, workPackages: [] }))}
                    searchable
                    searchPlaceholder="Buscar produto..."
                />
            </FilterGroup>
            <FilterGroup label="Responsável" className={COL}>
                <CadastroMultiSelect
                    icon={UserRound}
                    placeholder="Todos"
                    options={assigneeOptions}
                    selected={filters.assignees}
                    onSelect={set("assignees")}
                    searchable
                    searchPlaceholder="Buscar pessoa..."
                />
            </FilterGroup>
            <FilterGroup label="Status" className={COL}>
                <CadastroMultiSelect
                    icon={Layers}
                    placeholder="Todos"
                    options={statusOptions}
                    renderLabel={(option) => {
                        const column = byKey.get(option.value)
                        if (!column) return option.label
                        return (
                            <span className="flex items-center justify-between gap-2">
                                <ColumnBadge column={column} />
                                {column.kind === "custom" && <span className="text-[9px] uppercase tracking-wider text-muted-foreground">pessoal</span>}
                            </span>
                        )
                    }}
                    selected={filters.statuses.filter((key) => byKey.has(key))}
                    onSelect={set("statuses")}
                />
            </FilterGroup>
        </ListFilters>
    )
}
