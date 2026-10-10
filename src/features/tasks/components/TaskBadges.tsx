"use client"

import { AlertTriangle, Archive, ArrowDown, ArrowUp, ChevronsUp, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { TASK_PRIORITY_ICON_STYLES, TASK_PRIORITY_LABELS, TASK_PRIORITY_STYLES, TASK_TYPE_LABELS, TASK_TYPE_SHORT_LABELS, TASK_TYPE_STYLES, type TaskPriority, type TaskType } from "../constants"
import type { BoardColumnView } from "../board"
import { ColumnIconView } from "./column-icons"

const chip = "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none"

export function TaskTypeBadge({ type, long = false }: { type: TaskType | null; long?: boolean }) {
    if (!type) return null
    return (
        <span className={cn(chip, TASK_TYPE_STYLES[type])} title={TASK_TYPE_LABELS[type]}>
            {long ? TASK_TYPE_LABELS[type] : TASK_TYPE_SHORT_LABELS[type]}
        </span>
    )
}

const PRIORITY_ICON = { urgent: ChevronsUp, high: ArrowUp, medium: Minus, low: ArrowDown } as const

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
    const Icon = PRIORITY_ICON[priority]
    return (
        <span className={cn(chip, TASK_PRIORITY_STYLES[priority])} title={`Prioridade ${TASK_PRIORITY_LABELS[priority].toLowerCase()}`}>
            <Icon className="h-3 w-3" aria-hidden />
            {TASK_PRIORITY_LABELS[priority]}
        </span>
    )
}

/** Ícone da prioridade com a cor correspondente, sem rótulo (rodapé do card do kanban). */
export function TaskPriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
    const Icon = PRIORITY_ICON[priority]
    const label = TASK_PRIORITY_LABELS[priority]
    return (
        <span
            role="img"
            aria-label={`Prioridade ${label}`}
            title={`Prioridade ${label.toLowerCase()}`}
            className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded", TASK_PRIORITY_ICON_STYLES[priority], className)}
        >
            <Icon className="h-3 w-3" aria-hidden />
        </span>
    )
}

/** Aviso da integração GitHub sobre a issue vinculada. */
export function IssueNoticeBadge({ notice }: { notice: string }) {
    return (
        <span className={cn(chip, "max-w-full border-warning/40 bg-warning/10 text-warning")} title={notice}>
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{notice}</span>
        </span>
    )
}

export function ArchivedBadge() {
    return (
        <span className={cn(chip, "border-border bg-muted text-muted-foreground")}>
            <Archive className="h-3 w-3" aria-hidden /> Arquivada
        </span>
    )
}

/** Coluna com a bolinha da cor e o ícone. */
export function ColumnBadge({ column, className }: { column: BoardColumnView; className?: string }) {
    return (
        <span className={cn("inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs", className)}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", column.dot)} aria-hidden />
            <ColumnIconView icon={column.column.icon} className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{column.label}</span>
        </span>
    )
}
