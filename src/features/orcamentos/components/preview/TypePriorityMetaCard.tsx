"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskPriorityBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import { TaskPriorityMenu } from "@/features/tasks/components/TaskPriorityMenu"
import type { TaskPriority, TaskType } from "@/features/tasks/constants"

/**
 * Card de tipo e prioridade da prévia. Com `onPriorityChange`, a prioridade vira editável (o cliente
 * escolhe e a tarefa nasce com ela ao aprovar); sem ele, o card é somente leitura.
 */
export function TypePriorityMetaCard({ taskType, priority, loading = false, onPriorityChange, updating = false }: { taskType: TaskType | null; priority: TaskPriority; loading?: boolean; onPriorityChange?: (priority: TaskPriority) => void; updating?: boolean }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tipo e prioridade</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 pt-0">
                {loading ? (
                    <>
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-5 w-20" />
                    </>
                ) : (
                    <>
                        <TaskTypeBadge type={taskType} long />
                        {onPriorityChange ? <TaskPriorityMenu value={priority} pending={updating} onChange={onPriorityChange} /> : <TaskPriorityBadge priority={priority} />}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
