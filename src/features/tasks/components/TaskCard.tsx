"use client"

import type { HTMLAttributes, MouseEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Loader2, TriangleAlert } from "lucide-react"
import { SelectionCheckbox } from "@/components/ui/selection-checkbox"
import { cn } from "@/lib/utils"
import type { TaskDto } from "../types"
import { RunningClock, useRunningTimer } from "@/features/time/components/RunningClock"
import { useWorkbenchProgress } from "@/features/agentic/components/WorkbenchProgressProvider"
import { workbenchProgressTone } from "@/features/agentic/logic"
import { GithubRepoLabel, IssueLinkButton } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { ArchivedBadge, IssueNoticeBadge, TaskPriorityBadge, TaskTypeBadge } from "./TaskBadges"
import { EstimateBadge } from "./EstimateBadge"

/** Seleção do card: checkbox (aparece ao passar o mouse; sempre visível quando há seleção). */
export interface CardSelection {
    selected: boolean
    /** Há alguma tarefa selecionada: o checkbox fica sempre visível. */
    active: boolean
    onToggle: (event: MouseEvent) => void
}

interface TaskCardViewProps {
    task: TaskDto
    moving?: boolean
    dragging?: boolean
    selection?: CardSelection
    onOpen?: () => void
    handleProps?: HTMLAttributes<HTMLDivElement>
}

/** Card do kanban: código, tipo, título, projeto, prioridade e arquivada. Clique abre a tarefa. */
export function TaskCardView({ task, moving = false, dragging = false, selection, onOpen, handleProps }: TaskCardViewProps) {
    const selected = selection?.selected ?? false
    const running = useRunningTimer(task.id)
    const progress = useWorkbenchProgress()?.progressOf(task.id)
    const repoIndex = useRepoIndex()
    const waiting = progress && !progress.running ? progress : null
    const tone = waiting ? workbenchProgressTone(waiting) : null
    return (
        <div
            {...handleProps}
            role="button"
            tabIndex={0}
            aria-label={`Abrir ${task.code}: ${task.title}`}
            onClick={(event) => {
                if (selection && (event.metaKey || event.ctrlKey)) selection.onToggle(event)
                else onOpen?.()
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") onOpen?.()
                handleProps?.onKeyDown?.(event)
            }}
            className={cn(
                "group relative cursor-grab select-none rounded-md border bg-card p-2.5 shadow-xs transition-colors hover:border-primary/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary active:cursor-grabbing",
                task.archived && "opacity-70",
                selected && "border-primary bg-primary/10",
                running && "border-success/70 bg-success/5",
                tone === "failed" && "border-destructive/70 bg-destructive/5",
                tone === "waiting" && "border-warning/70 bg-warning/5",
                dragging && "cursor-grabbing border-primary shadow-lg shadow-primary/20 ring-1 ring-primary/40",
            )}
        >
            <AnimatePresence>
                {running && (
                    <motion.span
                        key="running"
                        className="pointer-events-none absolute -inset-px rounded-md ring-1 ring-success/60"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.35, 1, 0.35], boxShadow: ["0 0 0px rgba(52,211,153,0)", "0 0 14px rgba(52,211,153,0.35)", "0 0 0px rgba(52,211,153,0)"] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                        aria-hidden
                    />
                )}
                {tone && (
                    <motion.span
                        key={`waiting-${tone}`}
                        className={cn("pointer-events-none absolute -inset-px rounded-md ring-1", tone === "failed" ? "ring-destructive/60" : "ring-warning/60")}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        aria-hidden
                    />
                )}
            </AnimatePresence>
            <div className="mb-1.5 flex items-center gap-1.5">
                {selection && (
                    <SelectionCheckbox
                        checked={selected}
                        onToggle={selection.onToggle}
                        label={`Selecionar ${task.code}`}
                        className={cn("transition-opacity", !selected && !selection.active && "opacity-0 focus-visible:opacity-100 group-hover:opacity-100")}
                    />
                )}
                <span className="font-mono text-[11px] font-semibold text-primary">{task.code}</span>
                <TaskTypeBadge type={task.taskType} />
                <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                    {running && <RunningClock startTime={running.startTime} className="text-[10px] font-semibold text-success" />}
                    {moving && <Loader2 className="h-3 w-3 animate-spin" aria-label="Movendo" />}
                </span>
            </div>
            <h4 className="mb-2 line-clamp-2 text-xs font-semibold leading-snug transition-colors group-hover:text-primary" title={task.title}>
                {task.title}
            </h4>
            {task.summary && (
                <p className="mb-2 line-clamp-1 text-[11px] leading-snug text-muted-foreground" title={task.summary}>
                    {task.summary}
                </p>
            )}
            {tone && waiting && (
                <p className={cn("mb-2 flex items-center gap-1 text-[10px] font-medium", tone === "failed" ? "text-destructive" : "text-warning")} title={waiting.waitingFor ?? undefined}>
                    <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{waiting.waitingFor}</span>
                </p>
            )}
            {task.project && (
                <div className="mb-2 text-[11px] text-muted-foreground">
                    <GithubRepoLabel repo={repoLabelOption(task.project.repo, repoIndex)} />
                </div>
            )}
            {task.issue?.notice && (
                <div className="mb-2 min-w-0">
                    <IssueNoticeBadge notice={task.issue.notice} />
                </div>
            )}
            <div className="flex items-center justify-between gap-1.5 border-t pt-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <TaskPriorityBadge priority={task.priority} />
                    <EstimateBadge estimate={task.estimate} />
                    {task.archived && <ArchivedBadge />}
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                    {task.issue && !dragging && <IssueLinkButton url={task.issue.url} number={task.issue.number} label={`Abrir issue ${task.issue.repo}#${task.issue.number} no GitHub`} className="rounded-full border" />}
                </span>
            </div>
        </div>
    )
}

interface SortableTaskCardProps {
    task: TaskDto
    columnKey: string
    moving: boolean
    selection: CardSelection
    /** Outro card selecionado está sendo arrastado junto com este: fica esmaecido. */
    hidden?: boolean
    /** Anima a troca de posição (desligado durante o arraste, que usa as transformações do dnd-kit). */
    layoutEnabled: boolean
    onOpen: () => void
}

/**
 * Card arrastável. A transformação do dnd-kit fica no invólucro (os vizinhos abrem espaço na hora);
 * o Framer Motion anima entrada/saída e a acomodação depois de soltar.
 */
export function SortableTaskCard({ task, columnKey, moving, selection, hidden = false, layoutEnabled, onOpen }: SortableTaskCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: "card", key: columnKey } })
    return (
        <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="relative" data-testid={`task-card-${task.id}`}>
            {isDragging && <div className="absolute inset-0 rounded-md border-2 border-dashed border-primary/60 bg-primary/5" aria-hidden />}
            <motion.div
                layout={layoutEnabled ? "position" : false}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: isDragging ? 0 : hidden ? 0.35 : 1, y: 0, scale: hidden ? 0.97 : 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
            >
                <TaskCardView
                    task={task}
                    moving={moving}
                    selection={selection}
                    onOpen={onOpen}
                    handleProps={{ ...attributes, ...listeners } as HTMLAttributes<HTMLDivElement>}
                />
            </motion.div>
        </div>
    )
}
