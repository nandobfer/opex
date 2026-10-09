"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { CalendarClock, Clock, ExternalLink, FolderKanban, GitCommitHorizontal, GitPullRequest, Link2, Package, UserRound, UserPen } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { fadeUp } from "@/components/motion/presets"
import { formatDate, formatDateTime, formatMinutes } from "../../format"
import type { TaskPriority } from "../../constants"
import type { PersonRef, TaskDetailDto } from "../../types"
import { TaskTypeBadge } from "../TaskBadges"
import { TaskAssigneePicker } from "../TaskAssigneePicker"
import { TaskPriorityMenu } from "../TaskPriorityMenu"

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

function ExternalUrl({ href }: { href: string }) {
    return (
        <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 text-primary hover:underline">
            <span className="truncate">{href.replace(/^https?:\/\//, "")}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </a>
    )
}

interface TaskDetailSidebarProps {
    task: TaskDetailDto
    people: readonly PersonRef[]
    currentUserId: string | null
    updating: boolean
    onUpdate: (change: { assignee?: PersonRef | null; priority?: TaskPriority }) => void
}

/** Propriedades da tarefa (coluna lateral); responsável e prioridade editáveis. */
export function TaskDetailSidebar({ task, people, currentUserId, updating, onUpdate }: TaskDetailSidebarProps) {
    const mine = currentUserId !== null && task.assignee?.id === currentUserId
    return (
        <motion.aside variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.05 }}>
            <Card>
                <CardContent className="divide-y pt-4">
                    <dl>
                        <Row icon={UserRound} label="Responsável">
                            <TaskAssigneePicker value={task.assignee} people={people} currentUserId={currentUserId} highlight={mine} pending={updating} onChange={(assignee) => onUpdate({ assignee })} />
                        </Row>
                        <Row icon={Package} label="Prioridade e tipo">
                            <span className="flex flex-wrap gap-1.5">
                                <TaskPriorityMenu value={task.priority} pending={updating} onChange={(priority) => onUpdate({ priority })} />
                                <TaskTypeBadge type={task.taskType} long />
                            </span>
                        </Row>
                        <Row icon={FolderKanban} label="Produto">
                            {task.product?.name ?? "—"}
                        </Row>
                        <Row icon={Package} label="Pacote de trabalho">
                            {task.workPackage ? (
                                <>
                                    {task.workPackage.name}
                                    {(task.workPackage.startDate || task.workPackage.endDate) && (
                                        <span className="block text-xs text-muted-foreground">
                                            {formatDate(task.workPackage.startDate)} – {formatDate(task.workPackage.endDate)}
                                        </span>
                                    )}
                                </>
                            ) : (
                                "—"
                            )}
                        </Row>
                        <Row icon={Clock} label="Horas apontadas">
                            <span className="font-mono">{formatMinutes(task.totalTimeLogged)}</span>
                        </Row>
                        {task.commitUrl && (
                            <Row icon={GitCommitHorizontal} label="Commit">
                                <ExternalUrl href={task.commitUrl} />
                            </Row>
                        )}
                        {task.pullRequestUrl && (
                            <Row icon={GitPullRequest} label="Pull Request">
                                <ExternalUrl href={task.pullRequestUrl} />
                            </Row>
                        )}
                        {(task.linkedRequest || task.linkedImprovement) && (
                            <Row icon={Link2} label="Vínculos">
                                {task.linkedRequest && (
                                    <span className="block">
                                        Solicitação <span className="font-mono">{task.linkedRequest.code}</span>
                                        {task.linkedRequest.title && <span className="text-muted-foreground"> · {task.linkedRequest.title}</span>}
                                    </span>
                                )}
                                {task.linkedImprovement && (
                                    <span className="block">
                                        Melhoria <span className="font-mono">{task.linkedImprovement.code}</span>
                                        {task.linkedImprovement.title && <span className="text-muted-foreground"> · {task.linkedImprovement.title}</span>}
                                    </span>
                                )}
                            </Row>
                        )}
                        <Row icon={UserPen} label="Criada">
                            {formatDateTime(task.createdAt)}
                            {task.createdBy && <span className="block text-xs text-muted-foreground">por {task.createdBy.name}</span>}
                        </Row>
                        <Row icon={CalendarClock} label="Atualizada">
                            {formatDateTime(task.updatedAt)}
                        </Row>
                    </dl>
                </CardContent>
            </Card>
        </motion.aside>
    )
}
