"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { CalendarClock, Github, Package, UserPen } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { fadeUp } from "@/components/motion/presets"
import { GithubRepoLabel } from "@/features/github/components/shared"
import type { GithubRepoLabelData } from "@/features/github/types"
import { repoLabelFrom } from "../../logic"
import { formatDateTime } from "@/features/tasks/format"
import { ArchivedBadge, TaskPriorityBadge, TaskTypeBadge } from "@/features/tasks/components/TaskBadges"
import type { ClienteTaskDetailDto } from "../../types"
import type { TaskPriority } from "@/features/tasks/constants"
import { TaskPriorityMenu } from "@/features/tasks/components/TaskPriorityMenu"
import { ClienteEstimateCard } from "./ClienteEstimateCard"

function Row({ icon: Icon, label, children }: { icon: typeof Github; label: string; children: ReactNode }) {
    return (
        <div className="flex items-start gap-2.5 py-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 break-words text-sm">{children}</dd>
            </div>
        </div>
    )
}

/**
 * Propriedades da tarefa na visão do cliente (coluna lateral): prioridade editável na hora (com
 * `onUpdate`), tipo, repositório, datas e a estimativa (só o tempo inflado). Sem horas apontadas nem
 * histórico.
 */
export function ClienteTaskSidebar({ task, repoIndex, onUpdate, updating = false }: { task: ClienteTaskDetailDto; repoIndex?: ReadonlyMap<string, GithubRepoLabelData>; onUpdate?: (priority: TaskPriority) => void; updating?: boolean }) {
    return (
        <motion.aside variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.05 }}>
            <div className="space-y-4">
                <Card>
                    <CardContent className="divide-y pt-4">
                        <dl>
                            <Row icon={Package} label="Prioridade e tipo">
                                <span className="flex flex-wrap gap-1.5">
                                    {onUpdate ? <TaskPriorityMenu value={task.priority} pending={updating} onChange={onUpdate} /> : <TaskPriorityBadge priority={task.priority} />}
                                    <TaskTypeBadge type={task.taskType} long />
                                    {task.archived && <ArchivedBadge />}
                                </span>
                            </Row>
                            <Row icon={Github} label="Repositório">
                                {task.project ? <GithubRepoLabel repo={repoLabelFrom(task.project.repo, repoIndex)} /> : "—"}
                            </Row>
                            <Row icon={UserPen} label="Criada">
                                {formatDateTime(task.createdAt)}
                            </Row>
                            <Row icon={CalendarClock} label="Atualizada">
                                {formatDateTime(task.updatedAt)}
                            </Row>
                        </dl>
                    </CardContent>
                </Card>
                <ClienteEstimateCard estimate={task.estimate} />
            </div>
        </motion.aside>
    )
}
