"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    pointerWithin,
    rectIntersection,
    TouchSensor,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { Plus } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { columnKeyOf, type BoardColumnView } from "../board"
import type { TaskSortKey } from "../constants"
import { boardOrderOf, finalDropPosition, moveBetweenColumns, type ColumnItems } from "../drop-target"
import type { TaskSelection } from "../hooks/useTaskSelection"
import { sortTasks } from "../ordering"
import type { TaskDto } from "../types"
import { ColumnIconView } from "./column-icons"
import { TaskCardView } from "./TaskCard"
import { columnSortableId, TaskColumn, type ColumnActions } from "./TaskColumn"
import { cn } from "@/lib/utils"
import { CONTENT_BLEED_X } from "@/features/layout/content-padding"

interface TaskBoardProps {
    tasks: readonly TaskDto[]
    /** Colunas visíveis, na ordem do quadro. */
    columns: readonly BoardColumnView[]
    /** Total por coluna no quadro SEM filtros (WIP e exclusão). */
    rawCounts: Readonly<Record<string, number>>
    sort: TaskSortKey
    movingId: string | null
    selection: TaskSelection
    actions: ColumnActions
    onMove: (task: TaskDto, column: string, order?: number) => void
    /** Arrastou um card selecionado com outros: move todos os selecionados. */
    onMoveMany: (tasks: TaskDto[], column: string) => void
    /** Nova ordem das colunas visíveis. */
    onReorderColumns: (visibleOrder: string[]) => void
    onOpen: (task: TaskDto) => void
}

/** Quanto tempo a posição do arraste segura a tela esperando a resposta otimista. */
const SETTLE_MS = 1500

/**
 * Kanban com dnd-kit em vários contêineres: o card entra na coluna de destino DURANTE o arraste (os
 * cards abaixo descem e abrem espaço) e as colunas arrastam pela alça. Animado com Framer Motion; ao
 * soltar, a mudança é otimista e o card se acomoda na posição da ordenação escolhida.
 */
export function TaskBoard({ tasks, columns, rawCounts, sort, movingId, selection, actions, onMove, onMoveMany, onReorderColumns, onOpen }: TaskBoardProps) {
    const [activeTask, setActiveTask] = useState<TaskDto | null>(null)
    const [activeColumn, setActiveColumn] = useState<BoardColumnView | null>(null)
    const [dragItems, setDragItems] = useState<ColumnItems | null>(null)
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
    const baseItems = useMemo<ColumnItems>(() => {
        const grouped: Record<string, TaskDto[]> = {}
        for (const column of columns) grouped[column.key] = []
        for (const task of tasks) grouped[columnKeyOf(task)]?.push(task)
        const result: Record<string, string[]> = {}
        for (const column of columns) result[column.key] = sortTasks(grouped[column.key]!, sort, (task) => boardOrderOf(task)).map((task) => task.id)
        return result
    }, [tasks, columns, sort])

    const settling = useRef(false)
    useEffect(() => {
        if (!settling.current) return
        settling.current = false
        setDragItems(null)
    }, [baseItems])
    useEffect(() => {
        if (!dragItems || activeTask) return
        const timer = setTimeout(() => setDragItems(null), SETTLE_MS)
        return () => clearTimeout(timer)
    }, [dragItems, activeTask])

    const items = dragItems ?? baseItems
    const itemsRef = useRef(items)
    useEffect(() => {
        itemsRef.current = items
    }, [items])

    const containerOf = useCallback((id: string): string | null => {
        if (id.startsWith("drop:")) return id.slice(5)
        if (id.startsWith("col:")) return id.slice(4)
        for (const [key, ids] of Object.entries(itemsRef.current)) if (ids.includes(id)) return key
        return null
    }, [])

    const group = useMemo(() => {
        if (!activeTask || !selection.selected.has(activeTask.id) || selection.selected.size < 2) return [] as TaskDto[]
        return tasks.filter((task) => selection.selected.has(task.id))
    }, [activeTask, selection.selected, tasks])
    const draggingIds = useMemo(() => new Set(group.filter((task) => task.id !== activeTask?.id).map((task) => task.id)), [group, activeTask])

    const collisionDetection: CollisionDetection = useCallback((args) => {
        if (String(args.active.id).startsWith("col:")) {
            return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => String(container.id).startsWith("col:")) })
        }
        const containers = args.droppableContainers.filter((container) => !String(container.id).startsWith("col:"))
        const pointer = pointerWithin({ ...args, droppableContainers: containers })
        const hits = pointer.length ? pointer : rectIntersection({ ...args, droppableContainers: containers })
        const zone = hits.find((hit) => String(hit.id).startsWith("drop:"))
        if (!zone) return hits
        const ids = itemsRef.current[String(zone.id).slice(5)] ?? []
        const cards = containers.filter((container) => ids.includes(String(container.id)))
        return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [zone]
    }, [])

    const reset = () => {
        setActiveTask(null)
        setActiveColumn(null)
    }

    const onDragStart = ({ active }: DragStartEvent) => {
        const id = String(active.id)
        if (id.startsWith("col:")) {
            setActiveColumn(columns.find((column) => columnSortableId(column.key) === id) ?? null)
            return
        }
        setActiveTask(byId.get(id) ?? null)
        setDragItems(baseItems)
    }

    const onDragOver = ({ active, over }: DragOverEvent) => {
        if (!over || !activeTask || group.length > 1 || String(active.id).startsWith("col:")) return
        const from = containerOf(String(active.id))
        const to = containerOf(String(over.id))
        if (!from || !to || from === to) return
        const translated = active.rect.current.translated
        const below = Boolean(translated && translated.top > over.rect.top + over.rect.height / 2)
        setDragItems((prev) => moveBetweenColumns(prev ?? baseItems, String(active.id), from, to, String(over.id), below))
    }

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        const id = String(active.id)
        if (id.startsWith("col:")) {
            reset()
            if (!over || over.id === active.id) return
            const keys = columns.map((column) => columnSortableId(column.key))
            const from = keys.indexOf(id)
            const to = keys.indexOf(String(over.id))
            if (from !== -1 && to !== -1) onReorderColumns(arrayMove(columns.map((column) => column.key), from, to))
            return
        }

        const dragged = activeTask
        const many = group
        const current = dragItems ?? baseItems
        reset()
        if (!over || !dragged) {
            setDragItems(null)
            return
        }
        const target = containerOf(String(over.id))
        if (!target) {
            setDragItems(null)
            return
        }
        if (many.length > 1) {
            setDragItems(null)
            onMoveMany(many, target)
            return
        }
        const result = finalDropPosition(current, baseItems, dragged, target, String(over.id), sort, byId)
        if (!result) {
            setDragItems(null)
            return
        }
        settling.current = true
        setDragItems(result.items)
        onMove(dragged, target, result.order)
    }

    const onDragCancel = () => {
        reset()
        setDragItems(null)
    }

    const visibleKeys = columns.map((column) => column.key)
    return (
        <TooltipProvider>
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
                <SortableContext items={visibleKeys.map(columnSortableId)} strategy={horizontalListSortingStrategy}>
                    <div className={cn("flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3", CONTENT_BLEED_X)} data-testid="task-board">
                        <AnimatePresence initial={false}>
                            {columns.map((column, index) => (
                                <TaskColumn
                                    key={column.key}
                                    column={column}
                                    tasks={(items[column.key] ?? []).map((id) => byId.get(id)).filter((task): task is TaskDto => task !== undefined)}
                                    rawCount={rawCounts[column.key] ?? 0}
                                    dragActive={activeTask !== null || activeColumn !== null}
                                    canShiftLeft={index > 0}
                                    canShiftRight={index < columns.length - 1}
                                    movingId={movingId}
                                    selection={selection}
                                    draggingIds={draggingIds}
                                    actions={actions}
                                    onOpen={onOpen}
                                />
                            ))}
                        </AnimatePresence>
                        <motion.button
                            type="button"
                            layout="position"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => actions.onCreateAfter(columns.at(-1)?.key ?? "")}
                            className="flex w-[200px] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
                        >
                            <Plus className="h-5 w-5" aria-hidden />
                            Nova coluna
                        </motion.button>
                    </div>
                </SortableContext>
                <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
                    {activeTask ? (
                        <div className="pointer-events-none relative w-[274px] rotate-2 scale-105">
                            {group.length > 1 && (
                                <>
                                    <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-md border border-primary/40 bg-card" aria-hidden />
                                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-md border border-primary/60 bg-card" aria-hidden />
                                </>
                            )}
                            <div className="relative">
                                <TaskCardView task={activeTask} dragging />
                            </div>
                            {group.length > 1 && (
                                <span className="absolute -right-2 -top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-md">{group.length} tarefas</span>
                            )}
                        </div>
                    ) : activeColumn ? (
                        <div className={`pointer-events-none w-[290px] rotate-1 rounded-lg border border-t-4 bg-card p-3 shadow-2xl shadow-primary/20 ${activeColumn.border}`}>
                            <div className="flex items-center gap-2">
                                <ColumnIconView icon={activeColumn.column.icon} className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs font-semibold uppercase tracking-wide">{activeColumn.label}</span>
                                <span className="ml-auto rounded-sm border bg-background px-1.5 font-mono text-xs">{items[activeColumn.key]?.length ?? 0}</span>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </TooltipProvider>
    )
}
