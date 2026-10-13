"use client"

import { useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { SelectionCheckbox } from "@/components/ui/selection-checkbox"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import { usePageVirtualizer } from "@/hooks/usePageVirtualizer"
import { cn } from "@/lib/utils"
import type { TaskFilters, TaskTableColumn } from "../filters"
import type { TaskDto } from "../types"
import { BULK_BAR_CLEARANCE } from "./TaskBulkBar"
import { TaskCompactCard } from "./TaskCompactCard"
import { nextTableSort, TABLE_COLUMN_LABELS, TABLE_COLUMN_ORDER } from "./table-columns"
import { sortTaskRows, type TaskTableProps } from "./TaskTable"

const VIRTUALIZE_ABOVE = 50
/** Estimativa inicial do card; o TanStack Virtual mede a altura real de cada um (`measureElement`). */
const CARD_ESTIMATE = 132

/**
 * Visão Tabela no celular (`< md`): cards compactos no lugar da tabela. Mesma ordenação, seleção
 * (inclusive "selecionar todas" e Shift) e ações em lote da tabela; virtualiza acima de 50 com
 * medição real dos cards (sem altura fixa de linha).
 */
export function TaskCompactList({ tasks, columns, sort, onSortChange, movingId, updatingId, selection, onMove, onUpdate, onOpen }: TaskTableProps) {
    const layout = useMemo(() => columns.map((column) => column.key), [columns])
    const rows = useMemo(() => sortTaskRows(tasks, sort, layout), [tasks, sort, layout])
    const orderedIds = useMemo(() => rows.map((task) => task.id), [rows])
    const headerState = selection.stateOf(orderedIds)
    const virtualize = rows.length > VIRTUALIZE_ABOVE
    const { anchorRef, virtualizer, items, padTop, padBottom } = usePageVirtualizer({ count: virtualize ? rows.length : 0, estimateSize: CARD_ESTIMATE, overscan: 6 })
    const hasSelection = selection.selected.size > 0

    const card = (task: TaskDto) => (
        <TaskCompactCard
            key={task.id}
            task={task}
            columns={columns}
            moving={movingId === task.id}
            updating={updatingId === task.id}
            ordered={orderedIds}
            selection={selection}
            onMove={onMove}
            onUpdate={onUpdate}
            onOpen={onOpen}
        />
    )

    return (
        <TooltipProvider>
            <div ref={anchorRef} className={cn("flex flex-col gap-3 transition-[padding]", hasSelection && BULK_BAR_CLEARANCE)} data-testid="task-compact-list">
                <div className="flex items-center gap-2">
                    <SelectionCheckbox
                        checked={headerState}
                        onToggle={() => selection.setMany(orderedIds, headerState !== true)}
                        label={headerState === true ? "Desmarcar todas" : "Selecionar todas"}
                        disabled={rows.length === 0}
                    />
                    <span className="text-xs text-muted-foreground">
                        {rows.length} {rows.length === 1 ? "tarefa" : "tarefas"}
                    </span>
                    <div className="ml-auto">
                        <SortMenu sort={sort} onSortChange={onSortChange} />
                    </div>
                </div>

                {virtualize ? (
                    <div className="flex flex-col">
                        {padTop > 0 && <div style={{ height: padTop }} aria-hidden />}
                        {items.map((item) => {
                            const task = rows[item.index]!
                            return (
                                <div key={task.id} ref={virtualizer.measureElement} data-index={item.index} className="pb-2">
                                    {card(task)}
                                </div>
                            )
                        })}
                        {padBottom > 0 && <div style={{ height: padBottom }} aria-hidden />}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <AnimatePresence initial={false}>{rows.map(card)}</AnimatePresence>
                    </div>
                )}
            </div>
        </TooltipProvider>
    )
}

function SortMenu({ sort, onSortChange }: { sort: TaskFilters["tableSort"]; onSortChange: (sort: TaskFilters["tableSort"]) => void }) {
    const Direction = sort.direction === "asc" ? ArrowUp : ArrowDown
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">Ordenar: {TABLE_COLUMN_LABELS[sort.column]}</span>
                    <Direction className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Ordenar por</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {TABLE_COLUMN_ORDER.map((column: TaskTableColumn) => {
                    const current = column === sort.column
                    return (
                        <DropdownMenuItem key={column} onSelect={() => onSortChange(nextTableSort(sort, column))} className="gap-2">
                            {TABLE_COLUMN_LABELS[column]}
                            {current && <Direction className="ml-auto h-3.5 w-3.5" aria-hidden />}
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
