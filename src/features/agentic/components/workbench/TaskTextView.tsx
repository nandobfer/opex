"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { taskPath } from "@/features/tasks/constants"
import type { TaskDetailDto } from "@/features/tasks/types"

interface TaskTextQuery {
    data?: TaskDetailDto
    isLoading: boolean
    isError: boolean
    error: unknown
    refetch: () => unknown
}

interface TaskTextViewProps {
    taskId: string
    query: TaskTextQuery
    /** Campo da tarefa exibido (Markdown do Go! Sipal ou da tarefa avulsa). */
    field: "description" | "technicalSpec"
    emptyTitle: string
    emptyIcon: LucideIcon
}

/**
 * Abas "Descrição" e "Spec." da mesa: o texto da tarefa só para leitura (a edição fica na página
 * da tarefa). Herda o "Citar no campo de resposta" do `ReplyTargetProvider` da mesa.
 */
export function TaskTextView({ taskId, query, field, emptyTitle, emptyIcon }: TaskTextViewProps) {
    if (query.isLoading) {
        return (
            <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
            </div>
        )
    }
    if (query.isError || !query.data) {
        return <ErrorState title="Não foi possível carregar a tarefa" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    }
    const text = query.data[field]
    if (!text?.trim()) {
        return (
            <EmptyState icon={emptyIcon} title={emptyTitle} description="Edite o texto na página da tarefa.">
                <Button asChild size="sm" variant="outline">
                    <Link href={taskPath(taskId)}>Abrir a tarefa</Link>
                </Button>
            </EmptyState>
        )
    }
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Markdown>{text}</Markdown>
        </div>
    )
}
