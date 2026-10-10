"use client"

import { useMemo, useRef } from "react"
import Link from "next/link"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ListTodo, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { useTaskList } from "@/features/tasks/hooks/useTasks"
import { workbenchPath } from "../../constants"
import { DEFAULT_DEV_CENTER_FILTERS, DEV_CENTER_FILTERS_KEY, devCenterFiltersSchema, filterCentralTasks } from "../../dev-center-filters"
import { PANE_WIDTHS } from "../../dev-center-layout"
import { useCentralQueue, useCentralWorkbenches } from "../../hooks/useAgentic"
import type { CentralDto } from "../../types"
import { QueueBadge } from "../QueueBadge"
import { WorkbenchStageBadge } from "../WorkbenchStageBadge"
import { CollapsiblePane, PaneToggle } from "./CollapsiblePane"
import { TaskFilters } from "./TaskFilters"

const ROW_HEIGHT = 64

interface TasksPaneProps {
    central: CentralDto
    activeTaskId: string | null
    collapsed: boolean
    wide: boolean
    onToggle: () => void
}

const LABEL = "lista de tarefas"

/** Tarefas do projeto da central com filtros (nome, coluna) e a etapa da mesa. Recolhível. */
export function TasksPane({ central, activeTaskId, collapsed, wide, onToggle }: TasksPaneProps) {
    const list = useTaskList(false)
    const board = useTaskBoard()
    const workbenches = useCentralWorkbenches(central.id)
    const queue = useCentralQueue(central.id)
    const { value: filters, setValue: setFilters, reset } = usePersistentState(DEV_CENTER_FILTERS_KEY, devCenterFiltersSchema, DEFAULT_DEV_CENTER_FILTERS)
    const tasks = useMemo(() => filterCentralTasks(list.data?.tasks ?? [], central.projectId, filters), [list.data, central.projectId, filters])
    const columns = useMemo(() => new Map(board.columns.map((column) => [column.key, column])), [board.columns])
    const stages = useMemo(() => new Map((workbenches.data ?? []).map((item) => [item.taskId, item])), [workbenches.data])
    const queued = useMemo(() => new Map((queue.data ?? []).map((item) => [item.taskId, item])), [queue.data])
    const scrollRef = useRef<HTMLDivElement>(null)
    // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual devolve funções não memorizáveis (padrão do projeto)
    const virtualizer = useVirtualizer({ count: tasks.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 8 })
    const activeCode = list.data?.tasks.find((task) => task.id === activeTaskId)?.code ?? null
    const reduceMotion = useReducedMotion()

    return (
        <CollapsiblePane
            label={LABEL}
            width={PANE_WIDTHS.tasks}
            collapsed={collapsed}
            wide={wide}
            className="min-h-[420px] lg:min-h-0"
            rail={
                <>
                    <PaneToggle label={LABEL} collapsed onToggle={onToggle} />
                    <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground" title={`${tasks.length} tarefas com os filtros atuais`}>
                        {tasks.length}
                    </span>
                    {activeCode && (
                        <span className="mt-1 font-mono text-xs font-semibold text-primary [writing-mode:vertical-rl]" title="Tarefa aberta">
                            {activeCode}
                        </span>
                    )}
                </>
            }
        >
            <div className="space-y-2 border-b p-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">
                        Tarefas <span className="font-mono text-xs font-normal text-muted-foreground">{tasks.length}</span>
                    </h2>
                    {wide && <PaneToggle label={LABEL} collapsed={false} onToggle={onToggle} />}
                </div>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    <Input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Buscar por código ou título" className="pl-8" aria-label="Buscar tarefas" />
                </div>
                <TaskFilters filters={filters} columns={board.columns} onChange={setFilters} onReset={reset} />
            </div>
            {/* Trocar de central anima só a lista; trocar de tarefa não (a lista e a rolagem ficam). */}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={central.id}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    {list.isLoading ? (
                        <div className="space-y-2 p-3" aria-label="Carregando tarefas">
                            {Array.from({ length: 6 }, (_, index) => (
                                <Skeleton key={index} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : list.isError ? (
                        <ErrorState title="Não foi possível carregar as tarefas" description={apiErrorMessage(list.error, "Tente novamente.")} onRetry={() => void list.refetch()} />
                    ) : tasks.length === 0 ? (
                        <EmptyState icon={ListTodo} title="Nenhuma tarefa encontrada" description={`Nenhuma tarefa de ${central.projectName} com estes filtros.`} actionLabel="Limpar filtros" onAction={reset} />
                    ) : (
                        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label={`Tarefas de ${central.projectName}`}>
                            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                                {virtualizer.getVirtualItems().map((row) => {
                                    const task = tasks[row.index]!
                                    const workbench = stages.get(task.id)
                                    const queueItem = queued.get(task.id)
                                    const column = columns.get(task.columnId)
                                    const active = task.id === activeTaskId
                                    return (
                                        <div key={task.id} role="listitem" className="absolute inset-x-0 px-1.5 py-0.5" style={{ height: ROW_HEIGHT, transform: `translateY(${row.start}px)` }}>
                                            <Link
                                                href={workbenchPath(central.id, task.id)}
                                                aria-current={active ? "page" : undefined}
                                                className={cn("flex h-full flex-col justify-center gap-1 rounded-md px-2.5 transition-colors", active ? "bg-primary/15" : "hover:bg-muted/50")}
                                            >
                                                <span className="flex items-center gap-2">
                                                    {column && <span className={cn("h-2 w-2 shrink-0 rounded-full", column.dot)} title={column.label} aria-label={column.label} />}
                                                    <span className="font-mono text-[11px] font-semibold text-primary">{task.code}</span>
                                                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{column?.label ?? "Sem coluna"}</span>
                                                    {workbench ? <WorkbenchStageBadge stage={workbench.stage} runState={workbench.runState} /> : queueItem && <QueueBadge position={queueItem.position} />}
                                                </span>
                                                <span className="truncate text-sm">{task.title}</span>
                                            </Link>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </CollapsiblePane>
    )
}
