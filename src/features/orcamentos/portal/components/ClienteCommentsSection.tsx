"use client"

import { useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { Loader2, MessageSquare, Send } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { listContainer, listItem } from "@/components/motion/presets"
import { formatDateTime } from "@/features/tasks/format"
import type { TaskComment } from "@/features/tasks/types"
import { useAddClienteComment } from "../hooks"

function Empty({ children }: { children: ReactNode }) {
    return (
        <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" aria-hidden /> {children}
        </p>
    )
}

/** Comentários do portal do cliente: lista com o autor e formulário (Markdown aceito). */
export function ClienteCommentsSection({ taskId, comments }: { taskId: string; comments: readonly TaskComment[] }) {
    const [content, setContent] = useState("")
    const add = useAddClienteComment(taskId)
    const submit = async () => {
        const value = content.trim()
        if (!value) return
        try {
            await add.mutateAsync(value)
            setContent("")
        } catch {
            // Toast já mostrado; o campo fica como está para corrigir.
        }
    }
    return (
        <div className="space-y-4">
            <div className="space-y-2" data-ctrl-enter-scope>
                <Textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} placeholder="Escreva um comentário (Markdown aceito)" aria-label="Novo comentário" />
                <div className="flex justify-end">
                    <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={add.isPending || !content.trim()} onClick={submit}>
                        {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                        Comentar
                    </Button>
                </div>
            </div>
            {comments.length === 0 ? (
                <Empty>Nenhum comentário.</Empty>
            ) : (
                <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-3">
                    {comments.map((comment) => (
                        <motion.li key={comment.id} variants={listItem} className="rounded-md border bg-card p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-medium">{comment.authorName}</span>
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
