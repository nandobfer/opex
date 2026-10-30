"use client"

import { useMemo, type CSSProperties } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { SelectionCheckbox } from "@/components/ui/selection-checkbox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePageVirtualizer } from "@/hooks/usePageVirtualizer"
import { RunningClock } from "@/features/time/components/RunningClock"
import { useTimer } from "@/features/time/components/TimerProvider"
import { useWorkbenchProgress } from "@/features/agentic/components/WorkbenchProgressProvider"
import { WorkbenchWaitingLink } from "@/features/agentic/components/WorkbenchWaitingLink"
import { workbenchProgressTone } from "@/features/agentic/logic"
import { cn } from "@/lib/utils"
import { columnKeyOf, type BoardColumnView } from "../board"
import { TASK_PRIORITY_RANK, TASK_TYPE_LABELS, type TaskPriority } from "../constants"
import type { TaskFilters, TaskTableColumn } from "../filters"
import type { TaskSelection } from "../hooks/useTaskSelection"
import type { TaskDto } from "../types"
import { IssueLinkButton } from "@/features/github/components/shared"
import { TaskProjectRepoLabel } from "./TaskProjectRepoLabel"
import { ArchivedBadge, IssueNoticeBadge, TaskTypeBadge } from "./TaskBadges"
import { TaskTagsBadge } from "./TaskTagsBadge"
import { EstimateBadge } from "./EstimateBadge"
import { BULK_BAR_CLEARANCE } from "./TaskBulkBar"
import { TaskColumnMenu } from "./TaskColumnMenu"
import { TaskPriorityMenu } from "./TaskPriorityMenu"
import { nextTableSort, TABLE_COLUMN_LABELS, TABLE_COLUMN_ORDER, TABLE_COLUMN_WIDTHS } from "./table-columns"

const VIRTUALIZE_ABOVE = 50
/** Duas linhas (título + resumo) para a virtualização reservar a altura correta. */
export const TASK_TABLE_ROW_HEIGHT = 64

/** Sem rolagem horizontal: a tabela ocupa a largura e as colunas menos importantes somem em telas estreitas. */
export const TASK_TABLE_RESPONSIVE: Partial<Record<TaskTableColumn, string>> = {
    issue: "hidden sm:table-cell",
    priority: "hidden md:table-cell",
    type: "hidden lg:table-cell",
    project: "hidden lg:table-cell",
    updatedAt: "hidden xl:table-cell",
}

const COLUMNS: { key: TaskTableColumn; label: string; className: string }[] = TABLE_COLUMN_ORDER.map((key) => ({
    key,
    label: TABLE_COLUMN_LABELS[key],
    className: TABLE_COLUMN_WIDTHS[key] ?? "",
}))

const hide = (column: TaskTableColumn) => TASK_TABLE_RESPONSIVE[column] ?? ""

const text = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase("pt-BR")

function compare(a: TaskDto, b: TaskDto, column: TaskTableColumn, columnIndex: (task: TaskDto) => number): number {
    switch (column) {
        case "code":
            return a.code.localeCompare(b.code, "pt-BR", { numeric: true })
        case "issue":
            return (a.issue?.number ?? Number.MAX_SAFE_INTEGER) - (b.issue?.number ?? Number.MAX_SAFE_INTEGER)
        case "title":
            return text(a.title).localeCompare(text(b.title), "pt-BR")
        case "column":
            return columnIndex(a) - columnIndex(b)
        case "priority":
            return TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority]
        case "type":
            return text(a.taskType ? TASK_TYPE_LABELS[a.taskType] : "").localeCompare(text(b.taskType ? TASK_TYPE_LABELS[b.taskType] : ""), "pt-BR")
        case "project":
            return text(a.project?.repo).localeCompare(text(b.project?.repo), "pt-BR")
        case "updatedAt":
            return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "")
    }
}

/** `layout` = ordem das colunas do quadro (Coluna ordena por ela). */
export function sortTaskRows(tasks: readonly TaskDto[], sort: TaskFilters["tableSort"], layout: readonly string[] = []): TaskDto[] {
    const factor = sort.direction === "asc" ? 1 : -1
    const columnIndex = (task: TaskDto) => layout.indexOf(columnKeyOf(task))
    return [...tasks].sort((a, b) => compare(a, b, sort.column, columnIndex) * factor || a.code.localeCompare(b.code, "pt-BR", { numeric: true }))
}

export interface TaskTableProps {
    tasks: readonly TaskDto[]
    columns: readonly BoardColumnView[]
    sort: TaskFilters["tableSort"]
    onSortChange: (sort: TaskFilters["tableSort"]) => void
    movingId: string | null
    /** Tarefa com prioridade sendo salva. */
    updatingId: string | null
    selection: TaskSelection
    onMove: (task: TaskDto, column: string) => void
    onUpdate: (task: TaskDto, change: { priority: TaskPriority }) => void
    onOpen: (task: TaskDto) => void
}

/** Tabela das tarefas: seleção, ordenável, coluna/prioridade editáveis na linha, virtualizada acima de 50. */
export function TaskTable({ tasks, columns, sort, onSortChange, movingId, updatingId, selection, onMove, onUpdate, onOpen }: TaskTableProps) {
    const layout = useMemo(() => columns.map((column) => column.key), [columns])
    const rows = useMemo(() => sortTaskRows(tasks, sort, layout), [tasks, sort, layout])
    const orderedIds = useMemo(() => rows.map((task) => task.id), [rows])
    const headerState = selection.stateOf(orderedIds)
    const timer = useTimer()
    const progress = useWorkbenchProgress()
    const virtualize = rows.length > VIRTUALIZE_ABOVE
    const { anchorRef, items, padTop, padBottom, stuck } = usePageVirtualizer({ count: virtualize ? rows.length : 0, estimateSize: TASK_TABLE_ROW_HEIGHT })
    const hasSelection = selection.selected.size > 0

    const toggleSort = (column: TaskTableColumn) => onSortChange(nextTableSort(sort, column))

    const row = (task: TaskDto, style?: CSSProperties) => {
        const selected = selection.selected.has(task.id)
        const updating = updatingId === task.id
        const running = timer?.timerOf(task.id)
        const progressItem = progress?.progressOf(task.id)
        const waiting = progressItem && !progressItem.running ? progressItem : null
        const tone = waiting ? workbenchProgressTone(waiting) : null
        return (
            <motion.tr
                key={task.id}
                layout={virtualize ? false : "position"}
                initial={virtualize ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={style}
                onClick={() => onOpen(task)}
                onKeyDown={(event) => event.key === "Enter" && onOpen(task)}
                tabIndex={0}
                aria-label={`Abrir ${task.code}`}
                aria-selected={selected}
                className={cn(
                    "cursor-pointer border-b transition-colors focus:outline-none",
                    selected
                        ? "bg-primary/10 hover:bg-primary/15"
                        : tone === "failed"
                          ? "bg-destructive/10 hover:bg-destructive/15"
                          : tone === "waiting"
                            ? "bg-warning/10 hover:bg-warning/15"
                            : running
                              ? "bg-success/10 hover:bg-success/15"
                              : "hover:bg-muted/50 focus:bg-muted/50",
                    running && "shadow-[inset_3px_0_0_var(--color-success)]",
                    tone === "failed" && "shadow-[inset_3px_0_0_var(--color-destructive)]",
                    tone === "waiting" && "shadow-[inset_3px_0_0_var(--color-warning)]",
                    task.archived && "opacity-70",
                )}
            >
                <td className="px-3 py-2">
                    <SelectionCheckbox checked={selected} onToggle={(event) => selection.toggle(task.id, { shift: event.shiftKey, ordered: orderedIds })} label={`Selecionar ${task.code}`} />
                </td>
                <td className="px-3 py-2 font-mono text-xs font-semibold text-primary">
                    <span className="flex items-center gap-1.5">{task.code}</span>
                    {running && <RunningClock startTime={running.startTime} className="block text-[10px] font-semibold text-success" />}
                    {waiting && <WorkbenchWaitingLink taskId={task.id} taskCode={task.code} item={waiting} className="mt-0.5" />}
                </td>
                <td className={cn("px-2 py-2", hide("issue"))}>
                    {task.issue ? (
                        <IssueLinkButton url={task.issue.url} number={task.issue.number} label={`Abrir issue ${task.issue.repo}#${task.issue.number} no GitHub`} />
                    ) : (
                        <span className="px-1.5 text-xs text-muted-foreground">—</span>
                    )}
                </td>
                <td className="max-w-0 px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                            <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                    <span className="truncate text-sm">{task.title}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="max-w-md whitespace-normal break-words text-sm">
                                    {task.title}
                                </TooltipContent>
                            </Tooltip>
                            {task.archived && <ArchivedBadge />}
                            <EstimateBadge estimate={task.estimate} />
                            {task.issue?.notice && <IssueNoticeBadge notice={task.issue.notice} />}
                        </span>
                        {task.summary && (
                            <span className="truncate text-xs text-muted-foreground" title={task.summary}>
                                {task.summary}
                            </span>
                        )}
                        {(task.tags?.length ?? 0) > 0 && <TaskTagsBadge tags={task.tags} max={3} />}
                    </div>
                </td>
                <td className="px-3 py-2">
                    <TaskColumnMenu task={task} columns={columns} moving={movingId === task.id} onMove={onMove} />
                </td>
                <td className={cn("px-3 py-2", hide("priority"))}>
                    <TaskPriorityMenu value={task.priority} pending={updating} onChange={(priority) => onUpdate(task, { priority })} />
                </td>
                <td className={cn("px-3 py-2", hide("type"))}>
                    <TaskTypeBadge type={task.taskType} />
                </td>
                <td className={cn("px-3 py-2 text-xs", hide("project"))} title={task.project?.repo}>
                    {task.project ? <TaskProjectRepoLabel project={task.project} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={cn("whitespace-nowrap px-3 py-2 text-xs text-muted-foreground", hide("updatedAt"))}>
                    {task.updatedAt ? format(new Date(task.updatedAt), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                </td>
            </motion.tr>
        )
    }

    return (
        <TooltipProvider>
            <div ref={anchorRef} className={cn("rounded-md border bg-card transition-[padding]", hasSelection && BULK_BAR_CLEARANCE)} data-testid="task-table">
                <table className="w-full table-fixed caption-bottom text-sm">
                    <thead className={cn("sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)] transition-shadow", stuck && "shadow-[0_1px_0_var(--color-border),0_8px_16px_-8px_rgb(0_0_0/0.6)]")} data-stuck={stuck || undefined}>
                        <tr>
                            <th className="h-10 w-[44px] px-3 text-left align-middle">
                                <SelectionCheckbox
                                    checked={headerState}
                                    onToggle={() => selection.setMany(orderedIds, headerState !== true)}
                                    label={headerState === true ? "Desmarcar todas" : "Selecionar todas"}
                                    disabled={rows.length === 0}
                                />
                            </th>
                            {COLUMNS.map((column) => {
                                const active = sort.column === column.key
                                const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
                                return (
                                    <th key={column.key} className={cn("h-10 px-3 text-left align-middle text-xs font-semibold text-muted-foreground", column.className, hide(column.key))} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                                        <button type="button" onClick={() => toggleSort(column.key)} className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}>
                                            {column.label}
                                            <Icon className={cn("h-3 w-3", !active && "opacity-40")} aria-hidden />
                                        </button>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {virtualize ? (
                            <>
                                {padTop > 0 && <tr style={{ height: padTop }} aria-hidden />}
                                {items.map((item) => row(rows[item.index]!, { height: TASK_TABLE_ROW_HEIGHT }))}
                                {padBottom > 0 && <tr style={{ height: padBottom }} aria-hidden />}
                            </>
                        ) : (
                            <AnimatePresence initial={false}>{rows.map((task) => row(task))}</AnimatePresence>
                        )}
                    </tbody>
                </table>
            </div>
        </TooltipProvider>
    )
}
