"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FilterX, ListTodo, RefreshCw } from "lucide-react"
import { TimerIndicator } from "@/features/time/components/TimerIndicator"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { columnKeyOf, mergeVisibleOrder, type TaskColumnDto } from "../board"
import { TASK_NEW_PATH, taskPath } from "../constants"
import { applyTaskFilters, countActiveFilters, DEFAULT_TASK_FILTERS, knownColumns, TASK_FILTER_KEYS, TASK_FILTERS_STORAGE_KEY, taskFiltersSchema, visibleColumns, type TaskFilters } from "../filters"
import { useColumnMutations, useTaskBoard } from "../hooks/useTaskBoard"
import { TASKS_QUERY_KEY, useTaskList, useTaskOptions, useTasksRealtime, useUpdateTask } from "../hooks/useTasks"
import { useTaskBulkActions } from "../hooks/useTaskBulkActions"
import { useTaskMoveFlow } from "../hooks/useTaskMoveFlow"
import { useTaskSelection } from "../hooks/useTaskSelection"
import type { TaskDto } from "../types"
import { ColumnFormDialog } from "./ColumnFormDialog"
import { TaskCreationActions } from "./TaskCreationActions"
import { TaskBulkBar } from "./TaskBulkBar"
import { CONTENT_BLEED_X } from "@/features/layout/content-padding"
import { useIsMobile } from "@/hooks/useMediaQuery"
import { TaskBoard } from "./TaskBoard"
import { TaskCompactList } from "./TaskCompactList"
import { TaskFiltersBar } from "./TaskFiltersBar"
import { TaskTable } from "./TaskTable"
import { TaskViewSwitch } from "./TaskViewSwitch"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Tarefas dO Opex: kanban (arrastar muda a coluna) ou tabela, com filtros salvos no navegador.
 * Atualiza sozinha pelo Pusher e pelo botão Atualizar; criar/editar em formulário próprio.
 */
export function TasksPage() {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const queryClient = useQueryClient()
    const { value: storedFilters, setValue: setFilters, ready } = usePersistentState<TaskFilters>(TASK_FILTERS_STORAGE_KEY, taskFiltersSchema, DEFAULT_TASK_FILTERS)

    const list = useTaskList(storedFilters.showArchived, ready)
    const options = useTaskOptions(ready)
    const board = useTaskBoard(ready)
    const allColumns = board.columns
    useTasksRealtime()
    const flow = useTaskMoveFlow(allColumns)
    const columnMutations = useColumnMutations()
    const update = useUpdateTask()

    // Filtro Coluna sem colunas que não existem mais (ex.: coluna excluída).
    const filters = useMemo(() => {
        if (!board.data) return storedFilters
        const columns = knownColumns(allColumns, storedFilters.columns)
        return columns.length === storedFilters.columns.length ? storedFilters : { ...storedFilters, columns }
    }, [storedFilters, allColumns, board.data])

    const tasks = useMemo(() => list.data?.tasks ?? [], [list.data])
    const columns = useMemo(() => visibleColumns(allColumns, filters), [allColumns, filters])
    const visible = useMemo(() => applyTaskFilters(tasks, filters, { ignoreColumn: filters.view === "kanban" }), [tasks, filters])
    const shown = useMemo(() => {
        if (filters.view !== "kanban") return visible
        const keys = new Set(columns.map((column) => column.key))
        return visible.filter((task) => keys.has(columnKeyOf(task)))
    }, [visible, columns, filters.view])
    const rawCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const task of tasks) counts[columnKeyOf(task)] = (counts[columnKeyOf(task)] ?? 0) + 1
        return counts
    }, [tasks])

    // Colunas: criar/editar (diálogo) e excluir (confirmação).
    const [columnForm, setColumnForm] = useState<{ column: TaskColumnDto | null; afterKey: string | null } | null>(null)
    const [deleting, setDeleting] = useState<TaskColumnDto | null>(null)
    const columnActions = useMemo(
        () => ({
            onCreateAfter: (afterKey: string) => setColumnForm({ column: null, afterKey }),
            onEdit: (column: TaskColumnDto) => setColumnForm({ column, afterKey: null }),
            onDelete: (column: TaskColumnDto) => setDeleting(column),
            onShift: (key: string, direction: -1 | 1) => {
                const order = columns.map((column) => column.key)
                const index = order.indexOf(key)
                const to = index + direction
                if (index === -1 || to < 0 || to >= order.length) return
                ;[order[index], order[to]] = [order[to]!, order[index]!]
                columnMutations.reorder.mutate(mergeVisibleOrder(board.data?.layout ?? allColumns.map((column) => column.key), order))
            },
        }),
        [columns, allColumns, board.data, columnMutations.reorder],
    )
    const reorderColumns = useCallback(
        (visibleOrder: string[]) => columnMutations.reorder.mutate(mergeVisibleOrder(board.data?.layout ?? allColumns.map((column) => column.key), visibleOrder)),
        [columnMutations.reorder, board.data, allColumns],
    )

    // Tarefa: criar na página própria (/tarefas/nova); editar/excluir na página da tarefa.

    // Seleção (tabela e kanban): só as tarefas visíveis.
    const visibleIds = useMemo(() => shown.map((task) => task.id), [shown])
    const selection = useTaskSelection(visibleIds)
    const selectedTasks = useMemo(() => shown.filter((task) => selection.selected.has(task.id)), [shown, selection.selected])
    const bulk = useTaskBulkActions(selection.remove, allColumns)
    const updatingId = update.isPending ? (update.variables?.task.id ?? null) : null

    // Esc limpa a seleção (exceto com diálogo/menu aberto, que tratam o próprio Esc).
    const hasSelection = selection.selected.size > 0
    const clearSelection = selection.clear
    useEffect(() => {
        if (!hasSelection) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return
            if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]')) return
            clearSelection()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [hasSelection, clearSelection])

    const refreshing = list.isFetching || options.isFetching
    const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] }), [queryClient])
    const open = useCallback((task: TaskDto) => router.push(taskPath(task.id)), [router])
    const clearFilters = () => setFilters((prev) => ({ ...prev, ...Object.fromEntries(TASK_FILTER_KEYS.map((key) => [key, DEFAULT_TASK_FILTERS[key]])) }) as TaskFilters)

    const projects = options.data?.projects ?? []
    const filtering = countActiveFilters(filters) > 0
    const view = !ready || list.isLoading ? "loading" : list.isError ? "error" : shown.length === 0 && (filtering || filters.view === "table") ? "empty" : filters.view
    const kanbanLayout = view === "kanban"
    const isMobile = useIsMobile()

    // No kanban o quadro precisa de altura definida para as colunas rolarem por dentro (o cabeçalho
    // alto do celular empurrava o conteúdo e a coluna colapsava). No celular cada coluna tem altura
    // fixa de `80vh` (ver `TaskColumn`), que define a altura do quadro sem medição em JS; no desktop
    // o `min-h-full` do flex já resolve.

    return (
        <motion.section
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(kanbanLayout ? "flex flex-col gap-4 md:min-h-full" : "space-y-4")}
        >
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <ListTodo className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="flex items-baseline gap-2 text-lg font-semibold md:text-2xl">
                            Tarefas
                            {list.data && <AnimatedNumber value={shown.length} className="font-mono text-sm font-normal text-muted-foreground tabular-nums" />}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Suas tarefas
                            {list.data?.fetchedAt && <> · atualizado às {format(new Date(list.data.fetchedAt), "HH:mm:ss", { locale: ptBR })}</>}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                    <TimerIndicator fullWidth />
                    <TaskViewSwitch value={filters.view} onChange={(next) => setFilters((prev) => ({ ...prev, view: next }))} className="w-full md:w-auto" />
                    <TaskCreationActions enabled={ready} />
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={refresh} disabled={refreshing} aria-label="Atualizar tarefas">
                        <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                            <RefreshCw className="h-4 w-4" aria-hidden />
                        </motion.span>
                        Atualizar
                    </Button>
                </div>
            </header>

            <AnimatePresence initial={false}>
                {ready && (
                    <motion.div key="filters" {...swap}>
                        <TaskFiltersBar filters={filters} setFilters={setFilters} total={shown.length} tasks={tasks} options={options.data} columns={allColumns} />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap} className={cn(view === "kanban" && "flex min-h-0 flex-col md:flex-1 md:basis-0")}>
                    {view === "loading" && <TasksSkeleton kanban={filters.view === "kanban"} />}
                    {view === "error" && <ErrorState title="Não foi possível carregar as tarefas" description={apiErrorMessage(list.error, "Tente novamente.")} onRetry={refresh} />}
                    {view === "empty" && (
                        <EmptyState
                            icon={filtering ? FilterX : ListTodo}
                            title={filtering ? "Nenhuma tarefa com estes filtros" : "Nenhuma tarefa ainda"}
                            description={filtering ? "Ajuste ou limpe os filtros para ver mais tarefas." : projects.length === 0 ? "Vincule um repositório em Integrações › GitHub para começar." : "Crie a primeira tarefa."}
                            actionLabel={filtering ? "Limpar filtros" : projects.length > 0 ? "Nova tarefa" : undefined}
                            onAction={filtering ? clearFilters : projects.length > 0 ? () => router.push(TASK_NEW_PATH) : undefined}
                        />
                    )}
                    {view === "kanban" && (
                        <div className="flex min-h-0 flex-col max-md:block md:flex-1 md:basis-0">
                            <TaskBoard
                                tasks={visible}
                                columns={columns}
                                rawCounts={rawCounts}
                                sort={filters.sort}
                                movingId={flow.movingId}
                                selection={selection}
                                actions={columnActions}
                                onMove={flow.move}
                                onMoveMany={bulk.move}
                                onReorderColumns={reorderColumns}
                                onOpen={open}
                            />
                        </div>
                    )}
                    {view === "table" &&
                        (isMobile ? (
                            <TaskCompactList
                                tasks={visible}
                                columns={allColumns}
                                sort={filters.tableSort}
                                onSortChange={(tableSort) => setFilters((prev) => ({ ...prev, tableSort }))}
                                movingId={flow.movingId}
                                updatingId={updatingId}
                                selection={selection}
                                onMove={(task, column) => flow.move(task, column)}
                                onUpdate={(task, change) => update.mutate({ task, body: change, patch: change, success: `${task.code} com prioridade ${change.priority}` })}
                                onOpen={open}
                            />
                        ) : (
                            <TaskTable
                                tasks={visible}
                                columns={allColumns}
                                sort={filters.tableSort}
                                onSortChange={(tableSort) => setFilters((prev) => ({ ...prev, tableSort }))}
                                movingId={flow.movingId}
                                updatingId={updatingId}
                                selection={selection}
                                onMove={(task, column) => flow.move(task, column)}
                                onUpdate={(task, change) => update.mutate({ task, body: change, patch: change, success: `${task.code} com prioridade ${change.priority}` })}
                                onOpen={open}
                            />
                        ))}
                </motion.div>
            </AnimatePresence>

            {view !== "loading" && (
                <TaskBulkBar
                    tasks={selectedTasks}
                    columns={allColumns}
                    progress={bulk.progress}
                    onMove={(column) => bulk.move(selectedTasks, column)}
                    onPriority={(priority) => bulk.prioritize(selectedTasks, priority)}
                    onArchive={(value) => bulk.archive(selectedTasks, value)}
                    onClear={selection.clear}
                />
            )}

            <ColumnFormDialog
                open={columnForm !== null}
                column={columnForm?.column ?? null}
                submitting={columnMutations.create.isPending || columnMutations.update.isPending}
                onClose={() => setColumnForm(null)}
                onSubmit={async (values) => {
                    if (!columnForm) return
                    try {
                        if (columnForm.column) await columnMutations.update.mutateAsync({ key: columnForm.column.key, input: values })
                        else await columnMutations.create.mutateAsync({ ...values, afterKey: columnForm.afterKey })
                        setColumnForm(null)
                    } catch {
                        // Toast já mostrado; o diálogo fica aberto para corrigir.
                    }
                }}
            />

            <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a coluna &quot;{deleting?.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>A coluna está vazia e some do quadro, dos filtros e da tabela.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (deleting) columnMutations.remove.mutate(deleting)
                                setDeleting(null)
                            }}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.section>
    )
}

function TasksSkeleton({ kanban }: { kanban: boolean }) {
    if (!kanban) return <Skeleton className="h-[420px] w-full" aria-label="Carregando tarefas" />
    return (
        <div className={cn("flex gap-3 overflow-hidden", CONTENT_BLEED_X)} aria-label="Carregando tarefas">
            {Array.from({ length: 5 }, (_, column) => (
                <div key={column} className="w-[290px] shrink-0 space-y-2 rounded-lg border bg-muted/40 p-2">
                    <Skeleton className="h-6 w-1/2" />
                    {Array.from({ length: 3 - (column % 2) }, (_, card) => (
                        <Skeleton key={card} className="h-24 w-full" />
                    ))}
                </div>
            ))}
        </div>
    )
}
