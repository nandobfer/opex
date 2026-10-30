"use client"

import { useMemo, useRef } from "react"
import Link from "next/link"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ListTodo, Search, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { OpencodeQuotaPanel } from "@/features/opencode-quota/components/OpencodeQuotaPanel"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { useTaskList } from "@/features/tasks/hooks/useTasks"
import { useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { centralSettingsPath, AGENTIC_CENTRALS_HREF } from "../../constants"
import { ALL_CENTRALS_ID } from "../../dev-center-central"
import { DEFAULT_DEV_CENTER_FILTERS, DEV_CENTER_FILTERS_KEY, devCenterFiltersSchema, filterCentralTasks } from "../../dev-center-filters"
import { activeDevCenterFilterChips } from "../../dev-center-filter-chips"
import { useCentralsTaskState } from "../../hooks/useAgentic"
import { centralsByProject } from "../../dev-center-product"
import type { CentralDto } from "../../types"
import { ActiveWorkbenchSwitch } from "./ActiveWorkbenchSwitch"
import { CentralPicker } from "./CentralPicker"
import { CollapsibleTaskFilters } from "./CollapsibleTaskFilters"
import { TaskFilters } from "./TaskFilters"
import { TaskRow, TaskRowSkeleton } from "./TaskRow"

// Estimativa inicial da altura das linhas; cada linha é medida de verdade (o resumo varia de 1 a 2 linhas).
const ROW_HEIGHT = 86

interface TasksPaneProps {
    central: CentralDto | null
    centrals: readonly CentralDto[]
    activeTaskId: string | null
    onSelectCentral: (id: string) => void
    /** Classes extras do painel (ex.: visibilidade/altura no celular, controladas pela tela). */
    className?: string
}

/**
 * Tarefas do projeto da central: o título e, abaixo dele, a área de filtros recolhível (começa
 * recolhida: resumo em chips; expandida: "Só mesas ativas", o seletor da central, os filtros de
 * colunas e de estado da mesa e a busca por nome, todos ocupando a linha inteira); por fim a lista
 * com a etapa da mesa, abaixo da quota do OpenCode (`OpencodeQuotaPanel`). Coluna sempre expandida (largura fixa a partir de `lg`).
 */
export function TasksPane({ central, centrals, activeTaskId, onSelectCentral, className }: TasksPaneProps) {
    const list = useTaskList(false)
    const board = useTaskBoard()
    const scope = useMemo(() => central ? [central] : centrals, [central, centrals])
    const ids = useMemo(() => scope.map((item) => item.id), [scope])
    const { workbenches, queue } = useCentralsTaskState(ids)
    const repoIndex = useRepoIndex()
    const centralOf = useMemo(() => centralsByProject(centrals), [centrals])
    const { value: filters, setValue: setFilters, reset } = usePersistentState(DEV_CENTER_FILTERS_KEY, devCenterFiltersSchema, DEFAULT_DEV_CENTER_FILTERS)
    const columns = useMemo(() => new Map(board.columns.map((column) => [column.key, column])), [board.columns])
    const stages = useMemo(() => new Map(workbenches.map((item) => [item.taskId, item])), [workbenches])
    const queued = useMemo(() => new Map(queue.map((item) => [item.taskId, item])), [queue])
    const tasks = useMemo(() => filterCentralTasks(list.data?.tasks ?? [], scope.map((item) => item.projectId), filters, (task) => ({ workbench: stages.get(task.id), queued: queued.has(task.id) })), [list.data, scope, filters, stages, queued])
    const scopeName = central?.projectName ?? "todos os projetos"
    const chips = useMemo(
        () =>
            activeDevCenterFilterChips(filters, { columns: new Map(board.columns.map((column) => [column.key, column.label])), centralName: central?.projectName ?? null }).map(({ remove, ...chip }) => ({
                ...chip,
                onRemove: () => (remove ? setFilters((current) => ({ ...current, ...remove })) : onSelectCentral(ALL_CENTRALS_ID)),
            })),
        [filters, board.columns, central, setFilters, onSelectCentral],
    )
    const scrollRef = useRef<HTMLDivElement>(null)
    // A altura medida fica presa à tarefa (mesma chave do React), não à posição: filtros e tempo real reordenam a lista.
    // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual devolve funções não memorizáveis (padrão do projeto)
    const virtualizer = useVirtualizer({ count: tasks.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, getItemKey: (index) => tasks[index]?.id ?? index, overscan: 8 })
    const reduceMotion = useReducedMotion()

    return (
        <Card role="region" aria-label="Lista de tarefas" data-testid="tasks-pane" className={cn("flex min-h-[420px] w-full flex-col overflow-hidden lg:min-h-0 lg:w-[340px] lg:shrink-0", className)}>
            <div className="space-y-2 border-b p-3">
                <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                    Tarefas <span className="font-mono text-xs font-normal text-muted-foreground">{tasks.length}</span>
                </h2>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <Link href={central ? centralSettingsPath(central.id) : AGENTIC_CENTRALS_HREF} aria-label={central ? "Configurar central selecionada" : "Configurar centrais de desenvolvimento"}>
                                    <Settings className="h-4 w-4" aria-hidden />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{central ? "Configurar central selecionada" : "Configurar centrais de desenvolvimento"}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                </div>
                <div role="separator" aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
                <CollapsibleTaskFilters chips={chips}>
                    <ActiveWorkbenchSwitch checked={filters.activeOnly} onChange={(activeOnly) => setFilters((current) => ({ ...current, activeOnly }))} />
                    <CentralPicker centrals={centrals} active={central} index={repoIndex} onSelect={onSelectCentral} />
                    <TaskFilters filters={filters} columns={board.columns} onChange={setFilters} />
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                        <Input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Buscar por código ou título" className="pl-8" aria-label="Buscar tarefas" />
                    </div>
                </CollapsibleTaskFilters>
                <OpencodeQuotaPanel />
            </div>
            {/* Trocar de central anima só a lista; trocar de tarefa não (a lista e a rolagem ficam). */}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={central?.id ?? "all"}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    {list.isLoading ? (
                        <div className="px-1.5 py-0.5" aria-label="Carregando tarefas" aria-busy="true" data-testid="tasks-pane-skeleton">
                            {Array.from({ length: 6 }, (_, index) => (
                                <TaskRowSkeleton key={index} />
                            ))}
                        </div>
                    ) : list.isError ? (
                        <ErrorState title="Não foi possível carregar as tarefas" description={apiErrorMessage(list.error, "Tente novamente.")} onRetry={() => void list.refetch()} />
                    ) : tasks.length === 0 ? (
                        <EmptyState icon={ListTodo} title="Nenhuma tarefa encontrada" description={`Nenhuma tarefa de ${scopeName} com estes filtros.`} actionLabel="Limpar filtros" onAction={reset} />
                    ) : (
                        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label={`Tarefas de ${scopeName}`}>
                            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                                {virtualizer.getVirtualItems().map((row) => {
                                    const task = tasks[row.index]!
                                    return (
                                        <div key={task.id} ref={virtualizer.measureElement} data-index={row.index} role="listitem" className="absolute inset-x-0 px-1.5 py-0.5" style={{ transform: `translateY(${row.start}px)` }}>
                                            <TaskRow
                                                task={task}
                                                column={columns.get(task.columnId)}
                                                central={task.project ? centralOf.get(task.project.id) : undefined}
                                                workbench={stages.get(task.id)}
                                                queueItem={queued.get(task.id)}
                                                active={task.id === activeTaskId}
                                            />
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
