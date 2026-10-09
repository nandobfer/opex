"use client"

import type { ReactNode } from "react"
import { Check, ChevronDown, Loader2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { TASK_PRIORITIES, type TaskPriority } from "../constants"
import { TaskPriorityBadge } from "./TaskBadges"

interface TaskPriorityMenuProps {
    /** Prioridade atual (`null` = várias tarefas, nenhuma marcada). */
    value: TaskPriority | null
    onChange: (priority: TaskPriority) => void
    pending?: boolean
    disabled?: boolean
    /** Gatilho próprio (barra de ações); padrão = o selo da prioridade. */
    trigger?: ReactNode
    label?: string
    align?: "start" | "end" | "center"
}

/** Prioridade com "Alterar para…": escolher aplica na hora (mesmo padrão do status). */
export function TaskPriorityMenu({ value, onChange, pending = false, disabled = false, trigger, label = "Prioridade", align = "start" }: TaskPriorityMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled || pending}>
                {trigger ?? (
                    <button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        aria-label={`${label}: alterar`}
                        className={cn("inline-flex items-center gap-1 rounded-md p-0.5 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-60")}
                    >
                        {value && <TaskPriorityBadge priority={value} />}
                        {pending ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden /> : <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60" aria-hidden />}
                    </button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} onClick={(event) => event.stopPropagation()}>
                <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {TASK_PRIORITIES.map((priority) => (
                    <DropdownMenuItem key={priority} disabled={priority === value} onSelect={() => onChange(priority)} className="gap-2">
                        <TaskPriorityBadge priority={priority} />
                        {priority === value && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
