"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, FileCode2, History, MessageSquare, Timer } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { listContainer, listItem } from "@/components/motion/presets"
import { formatDateTime, formatMinutes } from "../../format"
import type { TaskDetailDto } from "../../types"
import { AssigneeAvatar } from "../TaskBadges"

function Empty({ icon: Icon, children }: { icon: typeof History; children: ReactNode }) {
    return (
        <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden /> {children}
        </p>
    )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
    return (
        <motion.section variants={listItem} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            {children}
        </motion.section>
    )
}

export function DescriptionSection({ task }: { task: TaskDetailDto }) {
    const hasAny = task.description || task.technicalSpec || task.businessContext || task.acceptanceCriteria.length
    if (!hasAny) return <Empty icon={FileCode2}>Sem descrição no Go! Sipal.</Empty>
    return (
        <motion.div variants={listContainer} initial="hidden" animate="visible" className="space-y-6">
            {task.description && (
                <Block title="Descrição">
                    <Markdown>{task.description}</Markdown>
                </Block>
            )}
            {task.businessContext && (
                <Block title="Contexto de negócio">
                    <Markdown>{task.businessContext}</Markdown>
                </Block>
            )}
            {task.acceptanceCriteria.length > 0 && (
                <Block title="Critérios de aceite">
                    <ul className="space-y-1.5">
                        {task.acceptanceCriteria.map((item, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                                <Markdown className="flex-1">{item}</Markdown>
                            </li>
                        ))}
                    </ul>
                </Block>
            )}
            {task.technicalSpec && (
                <Block title="Especificação técnica">
                    <Markdown>{task.technicalSpec}</Markdown>
                </Block>
            )}
        </motion.div>
    )
}

const COMPLEXITY = { low: "Baixa", medium: "Média", high: "Alta" } as const

export function PlanSection({ task }: { task: TaskDetailDto }) {
    const plan = task.implementationPlan
    if (!plan) return <Empty icon={FileCode2}>Sem plano de implementação.</Empty>
    return (
        <motion.div variants={listContainer} initial="hidden" animate="visible" className="space-y-6">
            <motion.p variants={listItem} className="text-xs text-muted-foreground">
                {plan.complexity && <>Complexidade estimada: <strong className="text-foreground">{COMPLEXITY[plan.complexity]}</strong> · </>}
                Gerado em {formatDateTime(plan.generatedAt)}
                {plan.generatedBy && <> por {plan.generatedBy.name}</>}
            </motion.p>
            {plan.steps.length > 0 && (
                <Block title="Passos">
                    <ol className="space-y-2">
                        {plan.steps.map((step, index) => (
                            <li key={index} className="flex gap-3 text-sm">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[11px] text-primary">{index + 1}</span>
                                <Markdown className="flex-1">{step}</Markdown>
                            </li>
                        ))}
                    </ol>
                </Block>
            )}
            {plan.relatedFiles.length > 0 && (
                <Block title="Arquivos envolvidos">
                    <ul className="flex flex-wrap gap-1.5">
                        {plan.relatedFiles.map((file) => (
                            <li key={file} className="rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
                                {file}
                            </li>
                        ))}
                    </ul>
                </Block>
            )}
        </motion.div>
    )
}

export function CommentsSection({ task }: { task: TaskDetailDto }) {
    if (task.comments.length === 0) return <Empty icon={MessageSquare}>Nenhum comentário.</Empty>
    return (
        <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-3">
            {task.comments.map((comment) => (
                <motion.li key={comment.id} variants={listItem} className="rounded-md border bg-card p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <AssigneeAvatar person={comment.author} showName />
                        <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                    </div>
                    <Markdown>{comment.content}</Markdown>
                </motion.li>
            ))}
        </motion.ul>
    )
}

export function HistorySection({ task }: { task: TaskDetailDto }) {
    if (task.history.length === 0) return <Empty icon={History}>Sem histórico.</Empty>
    return (
        <motion.ol variants={listContainer} initial="hidden" animate="visible" className="relative space-y-4 border-l pl-5">
            {task.history.map((entry) => (
                <motion.li key={entry.id} variants={listItem} className="relative">
                    <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <p className="text-sm">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                        {entry.performedBy && <> · {entry.performedBy.name}</>}
                    </p>
                </motion.li>
            ))}
        </motion.ol>
    )
}

export function TimeLogsSection({ task }: { task: TaskDetailDto }) {
    if (task.timeLogs.length === 0) return <Empty icon={Timer}>Nenhuma hora apontada.</Empty>
    return (
        <motion.ul variants={listContainer} initial="hidden" animate="visible" className="divide-y rounded-md border">
            {task.timeLogs.map((log) => (
                <motion.li key={log.id} variants={listItem} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <AssigneeAvatar person={log.user} showName />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={log.description ?? undefined}>
                        {log.description ?? "Sem descrição"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {formatDateTime(log.startTime)}
                        {log.endTime && <> → {formatDateTime(log.endTime)}</>}
                    </span>
                    {log.active ? (
                        <span className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-success">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden /> Em andamento
                        </span>
                    ) : (
                        <span className="font-mono text-xs font-semibold">{formatMinutes(log.duration)}</span>
                    )}
                </motion.li>
            ))}
        </motion.ul>
    )
}
