"use client"

import { Check, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { columnKeyOf, goColumnView, type BoardColumnView } from "../board"
import { FINAL_TASK_STATUS, requiredUrlFor, type TaskStatus } from "../constants"
import { draftAcceptsColumn } from "../drafts"
import type { TaskDto } from "../types"
import { ColumnBadge, GoStatusChip } from "./TaskBadges"

interface TaskStatusMenuProps {
    task: TaskDto
    columns: readonly BoardColumnView[]
    moving: boolean
    onMove: (task: TaskDto, column: string) => void
    size?: "sm" | "default"
    className?: string
}

/**
 * Status atual (coluna customizada ou do Go! Sipal) com "Mover para…", em dois grupos. Em Produção
 * não volta para outras colunas do Go! Sipal, mas pode ir para as pessoais.
 */
export function TaskStatusMenu({ task, columns, moving, onMove, size = "sm", className }: TaskStatusMenuProps) {
    const currentKey = columnKeyOf(task)
    const current = columns.find((column) => column.key === currentKey) ?? goColumnView(task.status)
    const go = columns.filter((column) => column.kind === "go")
    const custom = columns.filter((column) => column.kind === "custom")
    const item = (column: BoardColumnView) => {
        const selected = column.key === currentKey
        const draft = Boolean(task.draft)
        const locked = draft ? !draftAcceptsColumn(column.key) : column.kind === "go" && task.status === FINAL_TASK_STATUS && column.key !== FINAL_TASK_STATUS
        const requires = !draft && column.kind === "go" && task.status !== column.key ? requiredUrlFor(task, column.key as TaskStatus) : null
        return (
            <DropdownMenuItem key={column.key} disabled={selected || locked} onSelect={() => onMove(task, column.key)} className="gap-2">
                <ColumnBadge column={column} />
                {selected && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
                {!selected && requires && <span className="ml-auto text-[10px] text-muted-foreground">{requires === "commit" ? "pede commit" : "pede PR"}</span>}
                {!selected && draft && column.kind === "go" && !locked && <span className="ml-auto text-[10px] text-muted-foreground">envia</span>}
            </DropdownMenuItem>
        )
    }
    return (
        <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size={size}
                        disabled={moving}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className={cn(size === "sm" && "h-7 px-2", "min-w-0 gap-1.5")}
                        aria-label={`Status: mover ${task.code}`}
                    >
                        <ColumnBadge column={current} />
                        {moving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> : <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenuLabel className="text-xs">Go! Sipal</DropdownMenuLabel>
                    {go.map(item)}
                    {custom.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs">Pessoais (só nO Opex)</DropdownMenuLabel>
                            {custom.map(item)}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            {current.kind === "custom" && !task.draft && <GoStatusChip status={task.status} />}
        </span>
    )
}
