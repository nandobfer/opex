"use client"

import type { CSSProperties } from "react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { SelectionCheckbox } from "@/components/ui/selection-checkbox"
import { RunningClock, useRunningTimer } from "@/features/time/components/RunningClock"
import { useWorkbenchProgress } from "@/features/agentic/components/WorkbenchProgressProvider"
import { WorkbenchWaitingLink } from "@/features/agentic/components/WorkbenchWaitingLink"
import { workbenchProgressTone } from "@/features/agentic/logic"
import { GithubRepoLabel, IssueLinkButton } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { cn } from "@/lib/utils"
import type { BoardColumnView } from "../board"
import type { TaskPriority } from "../constants"
import type { TaskSelection } from "../hooks/useTaskSelection"
import type { TaskDto } from "../types"
import { ArchivedBadge, IssueNoticeBadge, TaskTypeBadge } from "./TaskBadges"
import { EstimateBadge } from "./EstimateBadge"
import { TaskColumnMenu } from "./TaskColumnMenu"
import { TaskPriorityMenu } from "./TaskPriorityMenu"
import { TaskTagsBadge } from "./TaskTagsBadge"
import { COMPACT_CARD_CLASS } from "./board-layout"

interface TaskCompactCardProps {
    task: TaskDto
    columns: readonly BoardColumnView[]
    moving: boolean
    updating: boolean
    /** Ids na ordem exibida (seleção com Shift). */
    ordered: readonly string[]
    selection: TaskSelection
    onMove: (task: TaskDto, column: string) => void
    onUpdate: (task: TaskDto, change: { priority: TaskPriority }) => void
    onOpen: (task: TaskDto) => void
    style?: CSSProperties
}

/**
 * Card compacto da visão Tabela no celular (`< md`): código, controles, título, resumo, selos e
 * metadados em linhas que quebram, sem `tr`/`td` nem altura fixa. Clique abre a tarefa; checkbox,
 * menus e links internos não abrem (param a propagação).
 */
export function TaskCompactCard({ task, columns, moving, updating, ordered, selection, onMove, onUpdate, onOpen, style }: TaskCompactCardProps) {
    const selected = selection.selected.has(task.id)
    const running = useRunningTimer(task.id)
    const progress = useWorkbenchProgress()?.progressOf(task.id)
    const repoIndex = useRepoIndex()
    const waiting = progress && !progress.running ? progress : null
    const tone = waiting ? workbenchProgressTone(waiting) : null

    return (
        <motion.div
            layout="position"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={style}
            role="button"
            tabIndex={0}
            aria-label={`Abrir ${task.code}: ${task.title}`}
            onClick={() => onOpen(task)}
            onKeyDown={(event) => event.key === "Enter" && onOpen(task)}
            className={cn(
                COMPACT_CARD_CLASS,
                "cursor-pointer transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                selected
                    ? "border-primary bg-primary/10"
                    : tone === "failed"
                      ? "border-destructive/60 bg-destructive/5"
                      : tone === "waiting"
                        ? "border-warning/60 bg-warning/5"
                        : running
                          ? "border-success/60 bg-success/5"
                          : "hover:border-primary/60",
                task.archived && "opacity-70",
            )}
        >
            <div className="flex items-center gap-2">
                <SelectionCheckbox
                    checked={selected}
                    onToggle={(event) => selection.toggle(task.id, { shift: event.shiftKey, ordered })}
                    label={`Selecionar ${task.code}`}
                />
                <span className="font-mono text-xs font-semibold text-primary">{task.code}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                    {running && <RunningClock startTime={running.startTime} className="text-[10px] font-semibold text-success" />}
                    <TaskPriorityMenu value={task.priority} pending={updating} onChange={(priority) => onUpdate(task, { priority })} />
                    <TaskColumnMenu task={task} columns={columns} moving={moving} onMove={onMove} />
                </span>
            </div>

            <p className="mt-2 line-clamp-2 break-words text-sm font-medium leading-snug">{task.title}</p>
            {task.summary && <p className="mt-0.5 line-clamp-1 break-words text-xs text-muted-foreground">{task.summary}</p>}

            {task.issue?.notice && (
                <div className="mt-2 min-w-0">
                    <IssueNoticeBadge notice={task.issue.notice} />
                </div>
            )}
            {waiting && <WorkbenchWaitingLink taskId={task.id} taskCode={task.code} item={waiting} className="mt-2" />}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <EstimateBadge estimate={task.estimate} />
                <TaskTypeBadge type={task.taskType} />
                <TaskTagsBadge tags={task.tags ?? []} max={3} />
                {task.archived && <ArchivedBadge />}
            </div>

            {(task.project || task.issue || task.updatedAt) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                    {task.project && <GithubRepoLabel repo={repoLabelOption(task.project.repo, repoIndex)} />}
                    {task.issue && <IssueLinkButton url={task.issue.url} number={task.issue.number} label={`Abrir issue ${task.issue.repo}#${task.issue.number} no GitHub`} />}
                    {task.updatedAt && <span className="whitespace-nowrap">Atualizada {format(new Date(task.updatedAt), "dd/MM/yy HH:mm", { locale: ptBR })}</span>}
                </div>
            )}
        </motion.div>
    )
}
