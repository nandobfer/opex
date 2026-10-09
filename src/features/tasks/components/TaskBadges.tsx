"use client"

import { AlertTriangle, Archive, ArrowUp, ChevronsUp, FilePen, Minus, ArrowDown, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import {
    TASK_PRIORITY_LABELS,
    TASK_PRIORITY_STYLES,
    TASK_STATUS_ACCENT,
    TASK_STATUS_LABELS,
    TASK_TYPE_LABELS,
    TASK_TYPE_SHORT_LABELS,
    TASK_TYPE_STYLES,
    type TaskPriority,
    type TaskStatus,
    type TaskType,
} from "../constants"
import type { BoardColumnView } from "../board"
import type { PersonRef } from "../types"
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

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", className)}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", TASK_STATUS_ACCENT[status].dot)} aria-hidden />
            {TASK_STATUS_LABELS[status]}
        </span>
    )
}

/** Rascunho criado de uma issue do GitHub (ainda não está no Go! Sipal). */
export function DraftBadge({ closed = false }: { closed?: boolean }) {
    return (
        <span className={cn(chip, "border-dashed border-primary/50 bg-primary/10 text-primary")} title={closed ? "Rascunho: a issue foi fechada antes do envio" : "Rascunho: ainda não enviado ao Go! Sipal"}>
            <FilePen className="h-3 w-3" aria-hidden /> Rascunho
            {closed && <span className="text-[9px] uppercase text-warning">· issue fechada</span>}
        </span>
    )
}

/** Aviso da integração GitHub sobre a issue vinculada (ex.: aguardando commit). */
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

export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    return ((parts[0]![0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase()
}

/** Avatar com as iniciais do responsável (ou "sem responsável"). */
export function AssigneeAvatar({ person, highlight = false, showName = false }: { person: PersonRef | null; highlight?: boolean; showName?: boolean }) {
    if (!person) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Sem responsável">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed">
                    <UserRound className="h-3 w-3" aria-hidden />
                </span>
                {showName && "Sem responsável"}
            </span>
        )
    }
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs" title={person.name}>
            <span
                className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    highlight ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
            >
                {initialsOf(person.name)}
            </span>
            {showName && <span className="truncate">{person.name}</span>}
        </span>
    )
}

/** Coluna (Go! Sipal ou customizada) com a bolinha da cor e, nas customizadas, o ícone. */
export function ColumnBadge({ column, className }: { column: BoardColumnView; className?: string }) {
    return (
        <span className={cn("inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs", className)}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", column.dot)} aria-hidden />
            {column.custom && <ColumnIconView icon={column.custom.icon} className="h-3 w-3 shrink-0 text-muted-foreground" />}
            <span className="truncate">{column.label}</span>
        </span>
    )
}

/** Status real no Go! Sipal (mostrado quando a tarefa está numa coluna customizada). */
export function GoStatusChip({ status }: { status: TaskStatus }) {
    return (
        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground" title={`No Go! Sipal: ${TASK_STATUS_LABELS[status]}`}>
            <span className={cn("h-1.5 w-1.5 rounded-full", TASK_STATUS_ACCENT[status].dot)} aria-hidden />
            {TASK_STATUS_LABELS[status]}
        </span>
    )
}
