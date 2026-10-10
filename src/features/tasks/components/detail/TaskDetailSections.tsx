"use client"

import { useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { FileCode2, History, Loader2, MessageSquare, Send, Timer } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { listContainer, listItem } from "@/components/motion/presets"
import { formatDateTime, formatMinutes } from "../../format"
import type { TaskDetailDto } from "../../types"
import { useAddComment } from "../../hooks/useTasks"

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
    if (!task.description && !task.technicalSpec) return <Empty icon={FileCode2}>Sem descrição.</Empty>
    return (
        <motion.div variants={listContainer} initial="hidden" animate="visible" className="space-y-6">
            {task.description && (
                <Block title="Descrição">
                    <Markdown>{task.description}</Markdown>
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

export function CommentsSection({ task }: { task: TaskDetailDto }) {
    const [content, setContent] = useState("")
    const add = useAddComment(task.id)
    const submit = async () => {
        const value = content.trim()
        if (!value) return
        try {
            await add.mutateAsync(value)
            setContent("")
        } catch {
            // Toast já mostrado.
        }
    }
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} placeholder="Escreva um comentário (Markdown aceito)" aria-label="Novo comentário" />
                <div className="flex justify-end">
                    <Button type="button" size="sm" className="gap-1.5" disabled={add.isPending || !content.trim()} onClick={submit}>
                        {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                        Comentar
                    </Button>
                </div>
            </div>
            {task.comments.length === 0 ? (
                <Empty icon={MessageSquare}>Nenhum comentário.</Empty>
            ) : (
                <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-3">
                    {task.comments.map((comment) => (
                        <motion.li key={comment.id} variants={listItem} className="rounded-md border bg-card p-3">
                            <div className="mb-2 flex items-center justify-end gap-2">
                                <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                            </div>
                            <Markdown>{comment.content}</Markdown>
                        </motion.li>
                    ))}
                </motion.ul>
            )}
        </div>
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
                    <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
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
