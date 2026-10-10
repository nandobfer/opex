"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskPriorityBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import type { TaskPriority, TaskType } from "@/features/tasks/constants"

/** Card de tipo e prioridade da prévia. */
export function TypePriorityMetaCard({ taskType, priority, loading = false }: { taskType: TaskType | null; priority: TaskPriority; loading?: boolean }) {
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
                        <TaskPriorityBadge priority={priority} />
                    </>
                )}
            </CardContent>
        </Card>
    )
}
