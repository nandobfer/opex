"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, MessageSquarePlus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { MarkdownField } from "@/components/ui/markdown-field"
import type { MarkdownLineContext } from "@/components/ui/markdown-line-action"
import { useOwnerAttachmentClient, useTaskDescriptionUploads } from "../../../attachments/hooks"
import { formatDateTime } from "../../../format"
import { useAddComment } from "../../../hooks/useTasks"
import { LINE_COMMENT_FIELD_LABELS, OPTIMISTIC_COMMENT_PREFIX } from "../../../line-comments/format"
import type { LineCommentField } from "../../../types"
import { useTaskLineComments } from "./LineCommentsContext"

interface LineCommentPopoverProps {
    taskId: string
    field: LineCommentField
    commentId: string | null
    sourceKey: string
    context: MarkdownLineContext & { close: () => void }
}

/** Popover do botão da linha: a conversa da linha (mais antigos primeiro) e o campo para comentar. */
export function LineCommentPopover({ taskId, field, commentId, sourceKey, context }: LineCommentPopoverProps) {
    const value = useTaskLineComments()
    const thread = value?.threads(sourceKey).get(context.line) ?? []
    const [content, setContent] = useState("")
    const add = useAddComment(taskId)
    const uploads = useTaskDescriptionUploads(useOwnerAttachmentClient(), taskId)
    const busy = uploads.media.items.some((item) => item.status !== "done")

    const submit = () => {
        const text = content.trim()
        if (!text || busy || add.isPending) return
        const selection = context.selection
        add.mutate({
            content: text,
            lineRef: {
                field,
                commentId,
                line: context.line,
                text: context.text,
                ...(selection && { selection: { text: selection.text.slice(0, 1000), lines: selection.lines, occurrence: selection.occurrence, startLine: selection.startLine } }),
            },
        })
        setContent("")
    }

    return (
        <div className="space-y-3" data-ctrl-enter-scope>
            <p className="line-clamp-3 whitespace-pre-line border-l-2 border-primary/60 pl-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{context.selection ? selectionTitle(context.selection, context.line) : `Linha ${context.line}`}</span> · {LINE_COMMENT_FIELD_LABELS[field]}
                <br />
                {context.selection ? `“${context.selection.text}”` : context.text}
            </p>
            {thread.length > 0 && (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    <AnimatePresence initial={false}>
                        {thread.map(({ comment, relocated }) => {
                            const pending = comment.id.startsWith(OPTIMISTIC_COMMENT_PREFIX)
                            return (
                                <motion.li key={comment.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: pending ? 0.6 : 1, y: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }} className="rounded-md border bg-card p-2">
                                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                        {pending ? (
                                            <span className="flex items-center gap-1.5 text-muted-foreground">
                                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Enviando…
                                            </span>
                                        ) : (
                                            <span className="truncate font-medium">{comment.authorName}</span>
                                        )}
                                        <span className="text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
                                    </div>
                                    {relocated && <p className="mb-1 text-[11px] text-warning">A linha mudou desde o comentário (reancorado pela mais parecida).</p>}
                                    {comment.lineRef?.selection && (
                                        <p className="mb-1 line-clamp-2 whitespace-pre-line rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] text-foreground/80">“{comment.lineRef.selection.text}”</p>
                                    )}
                                    <Markdown lineAction={null} className="text-xs">
                                        {comment.body}
                                    </Markdown>
                                </motion.li>
                            )
                        })}
                    </AnimatePresence>
                </ul>
            )}
            <MarkdownField
                id={`line-comment-${sourceKey}-${context.line}`}
                value={content}
                onChange={setContent}
                rows={3}
                placeholder={context.selection ? "Comente este trecho (Markdown aceito)" : "Comente esta linha (Markdown aceito)"}
                ariaLabel={context.selection ? `Comentário no trecho da linha ${context.line}` : `Comentário na linha ${context.line}`}
                uploads={uploads.media}
            />
            <div className="flex items-center justify-end gap-2">
                {busy && <span className="mr-auto text-xs text-muted-foreground">Aguarde o envio das mídias</span>}
                <Button type="button" variant="ghost" size="sm" onClick={context.close}>
                    Fechar
                </Button>
                <Button type="button" size="sm" className="gap-1.5" data-ctrl-enter-submit disabled={!content.trim() || busy || add.isPending} onClick={submit}>
                    {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                    Comentar
                </Button>
            </div>
        </div>
    )
}

export const LINE_COMMENT_ICON = MessageSquarePlus

/** "Trecho da linha N" ou "Trecho das linhas S–N". */
export function selectionTitle(selection: { lines: number; startLine?: number }, line: number): string {
    const start = selection.startLine ?? line
    return selection.lines > 1 && start < line ? `Trecho das linhas ${start}–${line}` : `Trecho da linha ${line}`
}
