"use client"

import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { BoardColumnView } from "@/features/tasks/board"
import type { TaskDto } from "@/features/tasks/types"
import { workbenchPath } from "../../constants"
import { productColorClass, taskProductLabel } from "../../dev-center-product"
import { workbenchUserWaitReason } from "../../logic"
import type { CentralDto, QueueItemDto, WorkbenchSummaryDto } from "../../types"
import { QueueBadge } from "../QueueBadge"
import { ForksOpenBadge } from "../workbench/ForkStatusBadge"
import { WorkbenchStageBadge } from "../WorkbenchStageBadge"
import { WorkbenchWaitingBadge } from "../WorkbenchWaitingBadge"

interface TaskRowProps {
    task: TaskDto
    column: BoardColumnView | undefined
    /** Central do projeto da tarefa (cor e repositório da linha do projeto). */
    central: CentralDto | undefined
    workbench: WorkbenchSummaryDto | undefined
    queueItem: QueueItemDto | undefined
    active: boolean
}

/** Classes do card da lista (o skeleton usa as mesmas para ter a mesma altura). */
const ROW_CLASS = "flex flex-col gap-1 rounded-md px-2.5 py-1.5"

/** Bullet da coluna do quadro com a dica (tooltip) do nome da coluna. */
function ColumnDot({ column }: { column: BoardColumnView }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", column.dot)} aria-label={column.label} data-testid="task-column-dot" />
                </TooltipTrigger>
                <TooltipContent>{column.label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

/**
 * Card de uma tarefa na lista da Central de desenvolvimento: bullet da coluna (dica com o nome),
 * código e selos da mesa; abaixo, o repositório na cor da central, o título e o resumo.
 */
export function TaskRow({ task, column, central, workbench, queueItem, active }: TaskRowProps) {
    // Warning quando a mesa está parada aguardando o usuário (build_queued, espera por vaga e done não contam).
    const waitingFor = workbench
        ? workbenchUserWaitReason({ stage: workbench.stage, runState: workbench.runState, pendingPermissions: workbench.pendingPermissions, pendingForms: workbench.pendingForms, waitingSlot: Boolean(workbench.slotQueue) })
        : null
    const product = taskProductLabel(task, central)
    return (
        <Link
            href={workbenchPath(task.id)}
            aria-current={active ? "page" : undefined}
            className={cn(ROW_CLASS, "transition-colors", active ? "bg-primary/15" : "hover:bg-muted/50")}
        >
            <span className="flex items-center gap-2">
                {column && <ColumnDot column={column} />}
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-primary">{task.code}</span>
                {waitingFor && <WorkbenchWaitingBadge reason={waitingFor} />}
                {workbench?.forksDonePrompt && <ForksOpenBadge />}
                {workbench ? (
                    workbench.slotQueue?.position ? (
                        <QueueBadge position={workbench.slotQueue.position} label="Aguardando vaga" title="Aguardando vaga no limite de mesas da central" />
                    ) : workbench.stage === "build_queued" && workbench.buildQueuePosition ? (
                        <QueueBadge position={workbench.buildQueuePosition} label="Na fila do build" title="Aguardando a vez do build" />
                    ) : (
                        <WorkbenchStageBadge stage={workbench.stage} runState={workbench.runState} running={workbench.runState === "running" && waitingFor === null} />
                    )
                ) : (
                    queueItem && <QueueBadge position={queueItem.position} />
                )}
            </span>
            {product && (
                <span data-testid="task-product" className={cn("truncate text-[11px] font-bold", productColorClass(central?.config?.color))}>
                    {product}
                </span>
            )}
            <span className="truncate text-sm">{task.title}</span>
            {task.summary && (
                <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground" title={task.summary}>
                    {task.summary}
                </span>
            )}
        </Link>
    )
}

/** Carregamento no formato do `TaskRow`: bullet + código, linha do projeto, título e resumo. */
export function TaskRowSkeleton() {
    return (
        <div className={ROW_CLASS} data-testid="task-row-skeleton">
            <span className="flex h-4 items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="ml-auto h-4 w-14" />
            </span>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
        </div>
    )
}
