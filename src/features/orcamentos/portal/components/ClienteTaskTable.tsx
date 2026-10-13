"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { GithubRepoLabel } from "@/features/github/components/shared"
import type { GithubRepoLabelData } from "@/features/github/types"
import { repoLabelFrom } from "@/features/orcamentos/logic"
import { ArchivedBadge, TaskPriorityBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import { TaskPriorityMenu } from "@/features/tasks/components/TaskPriorityMenu"
import type { TaskPriority } from "@/features/tasks/constants"
import type { BoardColumnView } from "@/features/tasks/board"
import type { ClienteTaskDto } from "@/features/orcamentos/types"
import { ClienteEstimateBadge } from "./ClienteEstimateBadge"

/** Tabela do portal do cliente; o título abre a página da tarefa e a prioridade é editável com `onUpdate`. */
export function ClienteTaskTable({
    tasks,
    columns,
    repoIndex,
    hrefFor,
    onUpdate,
    updating = false,
}: {
    tasks: readonly ClienteTaskDto[]
    columns: readonly BoardColumnView[]
    repoIndex?: ReadonlyMap<string, GithubRepoLabelData>
    hrefFor: (task: ClienteTaskDto) => string
    onUpdate?: (task: ClienteTaskDto, change: { priority: TaskPriority }) => void
    updating?: boolean
}) {
    const byKey = new Map(columns.map((column) => [column.key, column.label]))
    return (
        <div className="rounded-lg border max-md:border-0">
            <table className="w-full text-sm max-md:block">
                <thead className="max-md:hidden">
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Código</th>
                        <th className="px-3 py-2 font-medium">Título</th>
                        <th className="px-3 py-2 font-medium">Coluna</th>
                        <th className="px-3 py-2 font-medium">Prioridade</th>
                        <th className="hidden px-3 py-2 font-medium lg:table-cell">Tipo</th>
                        <th className="hidden px-3 py-2 font-medium md:table-cell">Repositório</th>
                        <th className="px-3 py-2 font-medium">Estimativa</th>
                        <th className="hidden px-3 py-2 font-medium xl:table-cell">Atualizada</th>
                    </tr>
                </thead>
                <tbody className="max-md:block">
                    {tasks.map((task) => (
                        <tr key={task.id} className="border-b last:border-0 max-md:mb-3 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-2 max-md:gap-y-1 max-md:rounded-lg max-md:border max-md:p-3 max-md:last:mb-0">
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground max-md:px-0 max-md:py-0">
                                {task.code}
                                {task.archived && <span className="ml-1.5"><ArchivedBadge /></span>}
                            </td>
                            <td className="px-3 py-2 max-md:order-last max-md:w-full max-md:px-0 max-md:pt-1 max-md:pb-0">
                                <Link href={hrefFor(task)} className="block font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    {task.title}
                                </Link>
                                {task.summary && <span className="block line-clamp-1 text-xs text-muted-foreground">{task.summary}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs max-md:ml-auto max-md:px-0 max-md:py-0">{byKey.get(task.columnId) ?? task.columnId}</td>
                            <td className="px-3 py-2 max-md:px-0 max-md:py-0">
                                {onUpdate ? <TaskPriorityMenu value={task.priority} pending={updating} onChange={(priority) => onUpdate(task, { priority })} /> : <TaskPriorityBadge priority={task.priority} />}
                            </td>
                            <td className="hidden px-3 py-2 lg:table-cell"><TaskTypeBadge type={task.taskType} /></td>
                            <td className="hidden px-3 py-2 md:table-cell">
                                {task.project && <span className="inline-flex max-w-[220px]"><GithubRepoLabel repo={repoLabelFrom(task.project.repo, repoIndex)} /></span>}
                            </td>
                            <td className="px-3 py-2 max-md:px-0 max-md:py-0"><ClienteEstimateBadge estimate={task.estimate} /></td>
                            <td className="hidden px-3 py-2 text-xs text-muted-foreground xl:table-cell">{task.updatedAt ? format(new Date(task.updatedAt), "dd/MM HH:mm", { locale: ptBR }) : "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
