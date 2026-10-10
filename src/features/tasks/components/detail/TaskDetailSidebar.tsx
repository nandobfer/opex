"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { CalendarClock, Clock, Github, Package, Tag, UserPen } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { fadeUp } from "@/components/motion/presets"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { formatDateTime, formatMinutes } from "../../format"
import type { TaskPriority } from "../../constants"
import type { TaskDetailDto } from "../../types"
import { TaskTypeBadge } from "../TaskBadges"
import { TaskTagsBadge } from "../TaskTagsBadge"
import { TaskPriorityMenu } from "../TaskPriorityMenu"
import { TaskEstimateCard } from "./TaskEstimateCard"
import { TaskClientCard } from "./TaskClientCard"

function Row({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: ReactNode }) {
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

interface TaskDetailSidebarProps {
    task: TaskDetailDto
    updating: boolean
    onUpdate: (priority: TaskPriority) => void
}

/** Propriedades da tarefa (coluna lateral); prioridade editável na hora. */
export function TaskDetailSidebar({ task, updating, onUpdate }: TaskDetailSidebarProps) {
    const repoIndex = useRepoIndex()
    return (
        <motion.aside variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.05 }}>
            <div className="space-y-4">
                <Card>
                    <CardContent className="divide-y pt-4">
                        <dl>
                            <Row icon={Package} label="Prioridade e tipo">
                                <span className="flex flex-wrap gap-1.5">
                                    <TaskPriorityMenu value={task.priority} pending={updating} onChange={onUpdate} />
                                    <TaskTypeBadge type={task.taskType} long />
                                </span>
                            </Row>
                            <Row icon={Tag} label="Tags">
                                {(task.tags?.length ?? 0) > 0 ? <TaskTagsBadge tags={task.tags} max={99} /> : <span className="text-muted-foreground">—</span>}
                            </Row>
                            <Row icon={Github} label="Repositório">
                                {task.project ? <GithubRepoLabel repo={repoLabelOption(task.project.repo, repoIndex)} /> : "—"}
                            </Row>
                            <Row icon={Clock} label="Horas apontadas">
                                <span className="font-mono">{formatMinutes(task.totalTimeLogged)}</span>
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
                <TaskClientCard task={task} />
                <TaskEstimateCard task={task} />
            </div>
        </motion.aside>
    )
}
