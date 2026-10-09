"use client"

import type { HTMLAttributes, MouseEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Loader2, Lock } from "lucide-react"
import { SelectionCheckbox } from "@/components/ui/selection-checkbox"
import { cn } from "@/lib/utils"
import { FINAL_TASK_STATUS } from "../constants"
import type { TaskDto } from "../types"
import { RunningClock, TimerButton, useRunningTimer } from "@/features/time/components/TimerButton"
import { IssueLinkButton } from "@/features/github/components/shared"
import { ArchivedBadge, AssigneeAvatar, DraftBadge, GoStatusChip, IssueNoticeBadge, TaskPriorityBadge, TaskTypeBadge } from "./TaskBadges"

/** Seleção do card: checkbox (aparece ao passar o mouse; sempre visível quando há seleção). */
export interface CardSelection {
    selected: boolean
    /** Há alguma tarefa selecionada: o checkbox fica sempre visível. */
    active: boolean
    onToggle: (event: MouseEvent) => void
}

interface TaskCardViewProps {
    task: TaskDto
    mine?: boolean
    moving?: boolean
    dragging?: boolean
    /** Card numa coluna customizada: mostra o status real do Go! Sipal. */
    showGoStatus?: boolean
    /** Destaque passageiro (ex.: voltou de uma coluna customizada). */
    flash?: boolean
    selection?: CardSelection
    onOpen?: () => void
    handleProps?: HTMLAttributes<HTMLDivElement>
}

/**
 * Card do kanban: código, tipo, título, produto/pacote, prioridade e responsável. Clique abre a
 * tarefa; Ctrl/⌘ + clique marca/desmarca.
 */
export function TaskCardView({ task, mine = false, moving = false, dragging = false, showGoStatus = false, flash = false, selection, onOpen, handleProps }: TaskCardViewProps) {
    const draft = task.draft ?? null
    const final = !draft && task.status === FINAL_TASK_STATUS
    const selected = selection?.selected ?? false
    const running = useRunningTimer(task.id)
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
                mine && "border-l-[3px] border-l-primary",
                task.archived && "opacity-70",
                draft && "border-dashed border-primary/45 bg-primary/[0.04]",
                selected && "border-primary bg-primary/10",
                running && "border-success/70 bg-success/5",
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
                {flash && (
                    <motion.span
                        key="flash"
                        className="pointer-events-none absolute -inset-px rounded-md ring-2 ring-primary"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0.2, 1, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2.4, ease: "easeInOut" }}
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
                    {final && !showGoStatus && <Lock className="h-3 w-3" aria-label="Em Produção: não volta para outras colunas do Go! Sipal" />}
                </span>
            </div>
            <h4 className="mb-2 line-clamp-2 text-xs font-semibold leading-snug transition-colors group-hover:text-primary" title={task.title}>
                {task.title}
            </h4>
            {(task.product || task.workPackage) && (
                <p className="mb-2 truncate text-[11px] text-muted-foreground" title={[task.product?.name, task.workPackage?.name].filter(Boolean).join(" · ")}>
                    {task.product?.name}
                    {task.product && task.workPackage && " · "}
                    {task.workPackage?.name}
                </p>
            )}
            {(draft || (showGoStatus && !draft)) && (
                <div className="mb-2">{draft ? <DraftBadge closed={draft.issueClosed} /> : <GoStatusChip status={task.status} />}</div>
            )}
            {!draft && task.issue?.notice && (
                <div className="mb-2 min-w-0">
                    <IssueNoticeBadge notice={task.issue.notice} />
                </div>
            )}
            <div className="flex items-center justify-between gap-1.5 border-t pt-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <TaskPriorityBadge priority={task.priority} />
                    {task.archived && <ArchivedBadge />}
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                    {task.issue && !dragging && <IssueLinkButton url={task.issue.url} number={task.issue.number} label={`Abrir issue ${task.issue.repo}#${task.issue.number} no GitHub`} className="rounded-full border" />}
                    {!dragging && !draft && <TimerButton task={task} />}
                    <AssigneeAvatar person={task.assignee} highlight={mine} />
                </span>
            </div>
        </div>
    )
}

interface SortableTaskCardProps {
    task: TaskDto
    columnKey: string
    mine: boolean
    moving: boolean
    selection: CardSelection
    /** Outro card selecionado está sendo arrastado junto com este: fica esmaecido. */
    hidden?: boolean
    flash?: boolean
    /** Anima a troca de posição (desligado durante o arraste, que usa as transformações do dnd-kit). */
    layoutEnabled: boolean
    onOpen: () => void
}

/**
 * Card arrastável. A transformação do dnd-kit fica no invólucro (os vizinhos abrem espaço na hora);
 * o Framer Motion anima entrada/saída e a acomodação depois de soltar. No lugar do card arrastado
 * aparece o espaço tracejado.
 */
export function SortableTaskCard({ task, columnKey, mine, moving, selection, hidden = false, flash = false, layoutEnabled, onOpen }: SortableTaskCardProps) {
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
                    mine={mine}
                    moving={moving}
                    flash={flash}
                    showGoStatus={columnKey !== task.status}
                    selection={selection}
                    onOpen={onOpen}
                    handleProps={{ ...attributes, ...listeners } as HTMLAttributes<HTMLDivElement>}
                />
            </motion.div>
        </div>
    )
}
