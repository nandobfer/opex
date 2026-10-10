"use client"

import { Check, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { BoardColumnView } from "../board"
import type { TaskDto } from "../types"
import { ColumnBadge } from "./TaskBadges"

interface TaskColumnMenuProps {
    task: TaskDto
    columns: readonly BoardColumnView[]
    moving: boolean
    onMove: (task: TaskDto, column: string) => void
    size?: "sm" | "default"
    className?: string
}

/** Coluna atual da tarefa com "Mover para…". */
export function TaskColumnMenu({ task, columns, moving, onMove, size = "sm", className }: TaskColumnMenuProps) {
    const current = columns.find((column) => column.key === task.columnId)
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
                        aria-label={`Coluna: mover ${task.code}`}
                    >
                        {current && <ColumnBadge column={current} />}
                        {moving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> : <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenuLabel className="text-xs">Mover para…</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {columns.map((column) => {
                        const selected = column.key === task.columnId
                        return (
                            <DropdownMenuItem key={column.key} disabled={selected} onSelect={() => onMove(task, column.key)} className="gap-2">
                                <ColumnBadge column={column} />
                                {selected && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
                            </DropdownMenuItem>
                        )
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </span>
    )
}
