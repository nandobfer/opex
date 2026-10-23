"use client"

import { useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { AlertCircle, FileCode2, FileTerminal, History, Loader2, MessageSquare, Send, Timer } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { MarkdownField } from "@/components/ui/markdown-field"
import { Button } from "@/components/ui/button"
import { listContainer, listItem } from "@/components/motion/presets"
import { formatDateTime, formatMinutes } from "../../format"
import { formatCostUsd, formatTokens } from "@/features/time/format"
import type { MarkdownLineAction } from "@/components/ui/markdown-line-action"
import type { TaskComment, TaskDetailDto } from "../../types"
import { useAddComment } from "../../hooks/useTasks"
import { useOwnerAttachmentClient, useTaskDescriptionUploads } from "../../attachments/hooks"
import { LineCommentQuote } from "./line-comments/LineCommentQuote"
import { useLineCommentAction } from "./line-comments/useLineCommentAction"

function Empty({ icon: Icon, children }: { icon: typeof History; children: ReactNode }) {
    return (
        <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden /> {children}
        </p>
    )
}

/** `lineAction`: "Comentar a linha" (página da tarefa do dono); ausente = Markdown comum (portal). */
export function TaskDescription({ description, lineAction }: { description: string | null; lineAction?: MarkdownLineAction | null }) {
    if (!description) return <Empty icon={FileCode2}>Sem descrição.</Empty>
    return (
        <motion.div variants={listContainer} initial="hidden" animate="visible">
            <motion.div variants={listItem}>
                <Markdown lineAction={lineAction}>{description}</Markdown>
            </motion.div>
        </motion.div>
    )
}

export function DescriptionSection({ task }: { task: TaskDetailDto }) {
    const lineAction = useLineCommentAction("description")
    return <TaskDescription description={task.description} lineAction={lineAction} />
}

export function TaskTechnicalSpec({ technicalSpec, lineAction }: { technicalSpec: string | null; lineAction?: MarkdownLineAction | null }) {
    if (!technicalSpec) return <Empty icon={FileTerminal}>Sem especificação técnica.</Empty>
    return (
        <motion.div variants={listContainer} initial="hidden" animate="visible">
            <motion.div variants={listItem}>
                <Markdown lineAction={lineAction}>{technicalSpec}</Markdown>
            </motion.div>
        </motion.div>
    )
}

export function TechnicalSpecSection({ task }: { task: TaskDetailDto }) {
    const lineAction = useLineCommentAction("technicalSpec")
    return <TaskTechnicalSpec technicalSpec={task.technicalSpec} lineAction={lineAction} />
}

export function CommentsSection({ task }: { task: TaskDetailDto }) {
    const [content, setContent] = useState("")
    const add = useAddComment(task.id)
    const attachmentClient = useOwnerAttachmentClient()
    // Mesma fila de upload da descrição, vinculada a esta tarefa: a mídia colada vira anexo da tarefa.
    const uploads = useTaskDescriptionUploads(attachmentClient, task.id)
    /** Envios em andamento; enquanto houver, publicar perderia a mídia ainda não confirmada. */
    const uploading = uploads.media.items.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "confirming")
    /**
     * Mídia com falha ou cancelada aguardando decisão: resolver antes evita inserir a referência
     * ao vivo depois de o comentário ser publicado.
     */
    const unresolved = uploads.media.items.some((item) => item.status === "error" || item.status === "canceled")
    const busy = uploading || unresolved
    const submit = async () => {
        const value = content.trim()
        if (!value || busy) return
        try {
            await add.mutateAsync(value)
            setContent("")
        } catch {
            // Toast já mostrado.
        }
    }
    return (
        <div className="space-y-4">
            <div className="space-y-2" data-ctrl-enter-scope>
                <MarkdownField
                    value={content}
                    onChange={setContent}
                    rows={3}
                    placeholder="Escreva um comentário (Markdown aceito)"
                    ariaLabel="Novo comentário"
                    tablistLabel="Editar ou visualizar o comentário"
                    uploadsLabel="Mídias enviadas pelo comentário"
                    uploads={uploads.media}
                />
                <div className="flex items-center justify-end gap-2">
                    {busy && (
                        <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                            {uploading ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Enviando anexos…
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="h-3 w-3 text-destructive" aria-hidden /> Tente novamente ou descarte a mídia com falha para comentar.
                                </>
                            )}
                        </p>
                    )}
                    <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={add.isPending || busy || !content.trim()} onClick={submit}>
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
                        <CommentItem key={comment.id} comment={comment} />
                    ))}
                </motion.ul>
            )}
        </div>
    )
}

/** Um comentário: citação da linha (comentário de linha), corpo com "Comentar a linha" em cada linha. */
function CommentItem({ comment }: { comment: TaskComment }) {
    const lineAction = useLineCommentAction("comment", comment.id)
    return (
        <motion.li variants={listItem} className="rounded-md border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{comment.authorName}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
            </div>
            <LineCommentQuote comment={comment} />
            <Markdown lineAction={lineAction}>{comment.body}</Markdown>
        </motion.li>
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
            {task.timeLogs.map((log) => {
                const tokens = log.inputTokens + log.outputTokens + log.reasoningTokens
                return (
                    <motion.li key={log.id} variants={listItem} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-muted-foreground" title={log.description ?? undefined}>
                                {log.description ?? "Sem descrição"}
                            </span>
                            {(log.agent || log.model || tokens > 0 || log.costUsd > 0) && (
                                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                    {log.agent && <span>{log.agent}</span>}
                                    {log.model && <span>· {log.model}</span>}
                                    {tokens > 0 && <span>· {formatTokens(tokens)} tokens</span>}
                                    {log.costUsd > 0 && <span>· {formatCostUsd(log.costUsd)}</span>}
                                </span>
                            )}
                        </div>
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
                )
            })}
        </motion.ul>
    )
}
