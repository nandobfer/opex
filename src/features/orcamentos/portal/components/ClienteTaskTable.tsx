"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { ArchivedBadge, TaskPriorityBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import { EstimateBadge } from "@/features/tasks/components/EstimateBadge"
import type { BoardColumnView } from "@/features/tasks/board"
import type { TaskDto } from "@/features/tasks/types"

/** Tabela somente leitura do portal do cliente. */
export function ClienteTaskTable({ tasks, columns }: { tasks: readonly TaskDto[]; columns: readonly BoardColumnView[] }) {
    const byKey = new Map(columns.map((column) => [column.key, column.label]))
    return (
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead>
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
                <tbody>
                    {tasks.map((task) => (
                        <tr key={task.id} className="border-b last:border-0">
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                {task.code}
                                {task.archived && <span className="ml-1.5"><ArchivedBadge /></span>}
                            </td>
                            <td className="px-3 py-2">
                                <span className="block font-medium">{task.title}</span>
                                {task.summary && <span className="block line-clamp-1 text-xs text-muted-foreground">{task.summary}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs">{byKey.get(task.columnId) ?? task.columnId}</td>
                            <td className="px-3 py-2"><TaskPriorityBadge priority={task.priority} /></td>
                            <td className="hidden px-3 py-2 lg:table-cell"><TaskTypeBadge type={task.taskType} /></td>
                            <td className="hidden px-3 py-2 md:table-cell">
                                {task.project && <span className="inline-flex max-w-[220px]"><GithubRepoLabel repo={{ fullName: task.project.repo, ownerAvatarUrl: null, description: null, private: false }} /></span>}
                            </td>
                            <td className="px-3 py-2"><EstimateBadge estimate={task.estimate} mode="client" /></td>
                            <td className="hidden px-3 py-2 text-xs text-muted-foreground xl:table-cell">{task.updatedAt ? format(new Date(task.updatedAt), "dd/MM HH:mm", { locale: ptBR }) : "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
