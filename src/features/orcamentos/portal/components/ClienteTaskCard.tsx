"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { GithubRepoLabel } from "@/features/github/components/shared"
import type { GithubRepoLabelData } from "@/features/github/types"
import { repoLabelFrom } from "@/features/orcamentos/logic"
import { ArchivedBadge, TaskPriorityBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import type { ClienteTaskDto } from "@/features/orcamentos/types"
import { ClienteEstimateBadge } from "./ClienteEstimateBadge"

/** Card da tarefa no portal do cliente (somente leitura); clicar abre a página da tarefa. */
export function ClienteTaskCard({ task, repoIndex, href }: { task: ClienteTaskDto; repoIndex?: ReadonlyMap<string, GithubRepoLabelData>; href: string }) {
    return (
        <motion.article layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Link href={href} className="block space-y-2 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{task.code}</span>
                    <div className="flex items-center gap-1">
                        {task.archived && <ArchivedBadge />}
                        <TaskTypeBadge type={task.taskType} />
                    </div>
                </div>
                <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
                {task.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{task.summary}</p>}
                {task.project && (
                    <div className="text-xs">
                        <GithubRepoLabel repo={repoLabelFrom(task.project.repo, repoIndex)} />
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-1">
                    <TaskPriorityBadge priority={task.priority} />
                    <ClienteEstimateBadge estimate={task.estimate} />
                </div>
            </Link>
        </motion.article>
    )
}
