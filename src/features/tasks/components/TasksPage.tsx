"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Clock, FilterX, KeyRound, ListTodo, RefreshCw } from "lucide-react"
import { TimerIndicator } from "@/features/time/components/TimerIndicator"
import { TIME_PATH } from "@/features/time/schemas"
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
import { integrationPath } from "@/lib/integrations/catalog"
import { cn } from "@/lib/utils"
import { columnKeyOf, mergeVisibleOrder, type CustomColumnDto } from "../board"
import { TASK_STATUS_LABELS, taskPath } from "../constants"
import { applyTaskFilters, countActiveFilters, DEFAULT_TASK_FILTERS, knownStatuses, TASK_FILTER_KEYS, TASK_FILTERS_STORAGE_KEY, taskFiltersSchema, visibleColumns, type TaskFilters } from "../filters"
import { useColumnMutations, useTaskBoard } from "../hooks/useTaskBoard"
import { isSessionError, TASKS_QUERY_KEY, useTaskList, useTaskOptions, useTasksRealtime, useUpdateTask } from "../hooks/useTasks"
import { useTaskBulkActions } from "../hooks/useTaskBulkActions"
import { useTaskMoveFlow } from "../hooks/useTaskMoveFlow"
import { useTaskSelection } from "../hooks/useTaskSelection"
import { buildPeople } from "../people"
import type { TaskDto } from "../types"
import { ColumnFormDialog } from "./ColumnFormDialog"
import { SendDraftDialog } from "./draft/SendDraftDialog"
import { MoveUrlDialog } from "./MoveUrlDialog"
import { TaskBulkBar } from "./TaskBulkBar"
import { CONTENT_BLEED_X } from "@/features/layout/content-padding"
import { TaskBoard } from "./TaskBoard"
import { TaskFiltersBar } from "./TaskFiltersBar"
import { TaskTable } from "./TaskTable"
import { TaskViewSwitch } from "./TaskViewSwitch"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Tarefas do Centro de Desenvolvimento (Go! Sipal): kanban (arrastar muda o status lá) ou tabela,
 * com filtros salvos no navegador. Atualiza sozinha pela rotina de sincronização (Crons + Pusher) e
 * pelo botão Atualizar.
 */
export function TasksPage() {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const queryClient = useQueryClient()
    const { value: storedFilters, setValue: setFilters, ready } = usePersistentState<TaskFilters>(TASK_FILTERS_STORAGE_KEY, taskFiltersSchema, DEFAULT_TASK_FILTERS)

    const list = useTaskList(storedFilters.showArchived, ready)
    const sessionMissing = list.isError && isSessionError(list.error)
    const options = useTaskOptions(ready && !sessionMissing)
    const board = useTaskBoard(ready)
    const allColumns = board.columns
    useTasksRealtime()
    const flow = useTaskMoveFlow(allColumns)
    const columnMutations = useColumnMutations()

    // Filtro Status sem colunas que não existem mais (ex.: customizada excluída).
    const filters = useMemo(() => {
        if (!board.data) return storedFilters
        const statuses = knownStatuses(allColumns, storedFilters.statuses)
        return statuses.length === storedFilters.statuses.length ? storedFilters : { ...storedFilters, statuses }
    }, [storedFilters, allColumns, board.data])

    const tasks = useMemo(() => list.data?.tasks ?? [], [list.data])
    const currentUserId = list.data?.currentUserId ?? null
    const columns = useMemo(() => visibleColumns(allColumns, filters), [allColumns, filters])
    const visible = useMemo(() => applyTaskFilters(tasks, filters, { ignoreStatus: filters.view === "kanban" }), [tasks, filters])
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

    // Tarefas que voltaram de colunas pessoais porque o status mudou no Go! Sipal: aviso + destaque.
    const returned = list.data?.returned
    const [expiredHighlight, setExpiredHighlight] = useState<unknown>(null)
    const highlightIds = useMemo<ReadonlySet<string>>(() => (returned && expiredHighlight !== returned ? new Set(returned.map((item) => item.id)) : new Set()), [returned, expiredHighlight])
    useEffect(() => {
        if (!returned?.length) return
        for (const item of returned.slice(0, 3)) toast.info(`${item.code} voltou para ${TASK_STATUS_LABELS[item.status]}`, { description: `O status mudou no Go! Sipal${item.columnName ? ` (saiu de "${item.columnName}")` : ""}.` })
        if (returned.length > 3) toast.info(`E mais ${returned.length - 3} tarefa(s) voltaram para as colunas do Go! Sipal`)
        const timer = setTimeout(() => setExpiredHighlight(returned), 4000)
        return () => clearTimeout(timer)
    }, [returned])

    // Colunas customizadas: criar/editar (diálogo) e excluir (confirmação).
    const [columnForm, setColumnForm] = useState<{ column: CustomColumnDto | null; afterKey: string | null } | null>(null)
    const [deleting, setDeleting] = useState<CustomColumnDto | null>(null)
    const columnActions = useMemo(
        () => ({
            onCreateAfter: (afterKey: string) => setColumnForm({ column: null, afterKey }),
            onEdit: (column: CustomColumnDto) => setColumnForm({ column, afterKey: null }),
            onDelete: (column: CustomColumnDto) => setDeleting(column),
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

    const people = useMemo(() => buildPeople(options.data, tasks, currentUserId), [options.data, tasks, currentUserId])

    // Seleção (tabela e kanban): só as tarefas visíveis.
    const visibleIds = useMemo(() => shown.map((task) => task.id), [shown])
    const selection = useTaskSelection(visibleIds)
    const selectedTasks = useMemo(() => shown.filter((task) => selection.selected.has(task.id)), [shown, selection.selected])
    const bulk = useTaskBulkActions(selection.remove, allColumns)
    const update = useUpdateTask()
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

    const filtering = countActiveFilters(filters) > 0
    // O kanban sem filtros aparece mesmo vazio (dá para criar colunas).
    const view = !ready || list.isLoading ? "loading" : sessionMissing ? "session" : list.isError ? "error" : shown.length === 0 && (filtering || filters.view === "table") ? "empty" : filters.view
    const kanbanLayout = view === "kanban"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className={cn(
                // Kanban: a página ocupa a altura da área de conteúdo e o quadro fica com o que sobra
                // (colunas até o fim, sem altura chutada). Tabela: cresce e rola com a página.
                // Sem espaço para a barra de ações aqui: no kanban encolheria o quadro. A tabela e as
                // colunas reservam o próprio espaço (`BULK_BAR_CLEARANCE`).
                kanbanLayout ? "flex min-h-full flex-col gap-4" : "space-y-4",
            )}
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
                            Centro de Desenvolvimento do Go! Sipal
                            {list.data?.fetchedAt && <> · atualizado às {format(new Date(list.data.fetchedAt), "HH:mm:ss", { locale: ptBR })}</>}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <TimerIndicator />
                    <Button asChild variant="outline" size="sm" className="h-9 gap-2">
                        <Link href={TIME_PATH}>
                            <Clock className="h-4 w-4" aria-hidden /> Minhas horas
                        </Link>
                    </Button>
                    <TaskViewSwitch value={filters.view} onChange={(next) => setFilters((prev) => ({ ...prev, view: next }))} />
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={refresh} disabled={refreshing || sessionMissing} aria-label="Atualizar tarefas">
                        <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                            <RefreshCw className="h-4 w-4" aria-hidden />
                        </motion.span>
                        Atualizar
                    </Button>
                </div>
            </header>

            <AnimatePresence initial={false}>
                {ready && !sessionMissing && (
                    <motion.div key="filters" {...swap}>
                        <TaskFiltersBar filters={filters} setFilters={setFilters} total={shown.length} tasks={tasks} options={options.data} currentUserId={currentUserId} columns={allColumns} />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap} className={cn(view === "kanban" && "flex min-h-0 flex-1 basis-0 flex-col")}>
                    {view === "loading" && <TasksSkeleton kanban={filters.view === "kanban"} />}
                    {view === "session" && (
                        <EmptyState icon={KeyRound} title="Conecte-se ao Go! Sipal" description={apiErrorMessage(list.error, "Entre com o código enviado por e-mail para ver suas tarefas.")}>
                            <Button asChild size="sm">
                                <Link href={integrationPath("go_sipal")}>Conectar ao Go! Sipal</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar as tarefas" description={apiErrorMessage(list.error, "Tente novamente.")} onRetry={refresh} />}
                    {view === "empty" && (
                        <EmptyState
                            icon={filtering ? FilterX : ListTodo}
                            title={filtering ? "Nenhuma tarefa com estes filtros" : "Nenhuma tarefa no Go! Sipal"}
                            description={filtering ? "Ajuste ou limpe os filtros para ver mais tarefas." : undefined}
                            actionLabel={filtering ? "Limpar filtros" : undefined}
                            onAction={filtering ? clearFilters : undefined}
                        />
                    )}
                    {view === "kanban" && (
                        <TaskBoard
                            tasks={visible}
                            columns={columns}
                            rawCounts={rawCounts}
                            sort={filters.sort}
                            currentUserId={currentUserId}
                            movingId={flow.movingId}
                            selection={selection}
                            highlightIds={highlightIds}
                            actions={columnActions}
                            onMove={flow.move}
                            onMoveMany={bulk.move}
                            onReorderColumns={reorderColumns}
                            onOpen={open}
                        />
                    )}
                    {view === "table" && (
                        <TaskTable
                            tasks={visible}
                            columns={allColumns}
                            sort={filters.tableSort}
                            onSortChange={(tableSort) => setFilters((prev) => ({ ...prev, tableSort }))}
                            currentUserId={currentUserId}
                            movingId={flow.movingId}
                            updatingId={updatingId}
                            people={people}
                            selection={selection}
                            onMove={(task, column) => flow.move(task, column)}
                            onUpdate={(task, change) => update.mutate({ task, ...change })}
                            onOpen={open}
                        />
                    )}
                </motion.div>
            </AnimatePresence>

            <MoveUrlDialog request={flow.request} submitting={flow.submitting} error={flow.dialogError} onConfirm={flow.confirmUrl} onCancel={flow.cancel} />
            <MoveUrlDialog request={bulk.urlRequest} submitting={bulk.running} error={null} onConfirm={bulk.confirmUrl} onCancel={bulk.cancelUrl} />
            <SendDraftDialog request={flow.sendRequest} people={people} currentUserId={currentUserId} onClose={flow.closeSend} />

            <AlertDialog open={bulk.sendRequest !== null} onOpenChange={(next) => !next && bulk.cancelSend()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Enviar {bulk.sendRequest?.drafts === 1 ? "1 rascunho" : `${bulk.sendRequest?.drafts ?? 0} rascunhos`} para o Go! Sipal?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Cada rascunho vira uma tarefa em {bulk.sendRequest ? TASK_STATUS_LABELS[bulk.sendRequest.target] : ""}, com o tipo, a prioridade e o responsável mostrados no card. Não dá para desfazer o envio.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={bulk.confirmSend}>Enviar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {view !== "session" && (
                <TaskBulkBar
                    tasks={selectedTasks}
                    columns={allColumns}
                    people={people}
                    currentUserId={currentUserId}
                    progress={bulk.progress}
                    onMove={(column) => bulk.move(selectedTasks, column)}
                    onAssign={(person) => bulk.assign(selectedTasks, person)}
                    onPriority={(priority) => bulk.prioritize(selectedTasks, priority)}
                    onArchive={(value) => bulk.archive(selectedTasks, value)}
                    onDiscard={() => bulk.discard(selectedTasks)}
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
                        <AlertDialogDescription>A coluna está vazia e some do quadro, dos filtros e da tabela. Nada muda no Go! Sipal.</AlertDialogDescription>
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
