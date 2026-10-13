"use client"

import { useMemo, useRef } from "react"
import Link from "next/link"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ListTodo, Search } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { useTaskList } from "@/features/tasks/hooks/useTasks"
import { useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { workbenchPath } from "../../constants"
import { DEFAULT_DEV_CENTER_FILTERS, DEV_CENTER_FILTERS_KEY, devCenterFiltersSchema, filterCentralTasks } from "../../dev-center-filters"
import { useCentralQueue, useCentralWorkbenches } from "../../hooks/useAgentic"
import { workbenchUserWaitReason } from "../../logic"
import type { CentralDto } from "../../types"
import { QueueBadge } from "../QueueBadge"
import { WorkbenchStageBadge } from "../WorkbenchStageBadge"
import { WorkbenchWaitingBadge } from "../WorkbenchWaitingBadge"
import { CentralPicker } from "./CentralPicker"
import { TaskFilters } from "./TaskFilters"

// Estimativa inicial da altura das linhas; cada linha é medida de verdade (o resumo varia de 1 a 2 linhas).
const ROW_HEIGHT = 72

interface TasksPaneProps {
    central: CentralDto
    centrals: readonly CentralDto[]
    activeTaskId: string | null
    onSelectCentral: (id: string) => void
    /** Classes extras do painel (ex.: visibilidade/altura no celular, controladas pela tela). */
    className?: string
}

/**
 * Tarefas do projeto da central: o título e, abaixo dele, o seletor da central (repositório),
 * a busca por nome e o filtro de colunas, todos ocupando a linha inteira; por fim a lista com a
 * etapa da mesa. Coluna sempre expandida (largura fixa a partir de `lg`).
 */
export function TasksPane({ central, centrals, activeTaskId, onSelectCentral, className }: TasksPaneProps) {
    const list = useTaskList(false)
    const board = useTaskBoard()
    const workbenches = useCentralWorkbenches(central.id)
    const queue = useCentralQueue(central.id)
    const repoIndex = useRepoIndex()
    const { value: filters, setValue: setFilters, reset } = usePersistentState(DEV_CENTER_FILTERS_KEY, devCenterFiltersSchema, DEFAULT_DEV_CENTER_FILTERS)
    const tasks = useMemo(() => filterCentralTasks(list.data?.tasks ?? [], central.projectId, filters), [list.data, central.projectId, filters])
    const columns = useMemo(() => new Map(board.columns.map((column) => [column.key, column])), [board.columns])
    const stages = useMemo(() => new Map((workbenches.data ?? []).map((item) => [item.taskId, item])), [workbenches.data])
    const queued = useMemo(() => new Map((queue.data ?? []).map((item) => [item.taskId, item])), [queue.data])
    const scrollRef = useRef<HTMLDivElement>(null)
    // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual devolve funções não memorizáveis (padrão do projeto)
    const virtualizer = useVirtualizer({ count: tasks.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 8 })
    const reduceMotion = useReducedMotion()

    return (
        <Card role="region" aria-label="Lista de tarefas" data-testid="tasks-pane" className={cn("flex min-h-[420px] w-full flex-col overflow-hidden lg:min-h-0 lg:w-[340px] lg:shrink-0", className)}>
            <div className="space-y-2 border-b p-3">
                <h2 className="text-sm font-semibold">
                    Tarefas <span className="font-mono text-xs font-normal text-muted-foreground">{tasks.length}</span>
                </h2>
                <div role="separator" aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
                <CentralPicker centrals={centrals} active={central} index={repoIndex} onSelect={onSelectCentral} />
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    <Input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Buscar por código ou título" className="pl-8" aria-label="Buscar tarefas" />
                </div>
                <TaskFilters filters={filters} columns={board.columns} onChange={setFilters} />
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
                                    // Warning quando a mesa está parada aguardando o usuário (build_queued e done não contam).
                                    const waitingFor = workbench
                                        ? workbenchUserWaitReason({ stage: workbench.stage, runState: workbench.runState, pendingPermissions: workbench.pendingPermissions, pendingForms: workbench.pendingForms })
                                        : null
                                    return (
                                        <div key={task.id} ref={virtualizer.measureElement} data-index={row.index} role="listitem" className="absolute inset-x-0 px-1.5 py-0.5" style={{ transform: `translateY(${row.start}px)` }}>
                                            <Link
                                                href={workbenchPath(task.id)}
                                                aria-current={active ? "page" : undefined}
                                                className={cn("flex flex-col gap-1 rounded-md px-2.5 py-1.5 transition-colors", active ? "bg-primary/15" : "hover:bg-muted/50")}
                                            >
                                                <span className="flex items-center gap-2">
                                                    {column && <span className={cn("h-2 w-2 shrink-0 rounded-full", column.dot)} title={column.label} aria-label={column.label} />}
                                                    <span className="font-mono text-[11px] font-semibold text-primary">{task.code}</span>
                                                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{column?.label ?? "Sem coluna"}</span>
                                                    {waitingFor && <WorkbenchWaitingBadge reason={waitingFor} />}
                                                    {workbench ? (
                                                        workbench.stage === "build_queued" && workbench.buildQueuePosition ? (
                                                            <QueueBadge position={workbench.buildQueuePosition} label="Na fila do build" title="Aguardando a vez do build" />
                                                        ) : (
                                                            <WorkbenchStageBadge stage={workbench.stage} runState={workbench.runState} running={workbench.runState === "running" && waitingFor === null} />
                                                        )
                                                    ) : (
                                                        queueItem && <QueueBadge position={queueItem.position} />
                                                    )}
                                                </span>
                                                <span className="truncate text-sm">{task.title}</span>
                                                {task.summary && (
                                                    <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground" title={task.summary}>
                                                        {task.summary}
                                                    </span>
                                                )}
                                            </Link>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </Card>
    )
}
