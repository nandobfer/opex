"use client"

import Link from "next/link"
import { TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { workbenchPath } from "../constants"
import { workbenchProgressTone } from "../logic"
import type { InProgressWorkbenchDto } from "../types"

interface WorkbenchWaitingLinkProps {
    taskId: string
    taskCode: string
    /** Mesa em andamento da tarefa (executando ou aguardando ação humana). */
    item: Pick<InProgressWorkbenchDto, "runState" | "running" | "waitingFor">
    className?: string
}

/**
 * Motivo pelo qual uma mesa de trabalho aguarda o usuário (ou precisa de ação, em falha/interrupção)
 * exibido como link: clicar abre **direto a mesa** que está aguardando a interação
 * (`/desenvolvimento/[tarefa]`). Usado no card do kanban e na linha da tabela.
 *
 * O clique interrompe a propagação para não abrir a tarefa e não iniciar o arraste do card (dnd-kit).
 */
export function WorkbenchWaitingLink({ taskId, taskCode, item, className }: WorkbenchWaitingLinkProps) {
    if (item.running || !item.waitingFor) return null
    const failed = workbenchProgressTone(item) === "failed"
    return (
        <Link
            href={workbenchPath(taskId)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            title={item.waitingFor}
            aria-label={`Abrir a mesa de ${taskCode} — ${item.waitingFor}`}
            className={cn(
                "flex items-center gap-1 text-[10px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                failed ? "text-destructive" : "text-warning",
                className,
            )}
        >
            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{item.waitingFor}</span>
        </Link>
    )
}
