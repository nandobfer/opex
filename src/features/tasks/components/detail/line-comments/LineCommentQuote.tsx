"use client"

import { CornerDownRight, MessageSquareQuote } from "lucide-react"
import { LINE_COMMENT_FIELD_LABELS } from "../../../line-comments/format"
import type { TaskComment } from "../../../types"
import { useTaskLineComments } from "./LineCommentsContext"

/** Citação da linha comentada no topo do comentário, com "Ir para a linha" (desabilitado se a linha sumiu). */
export function LineCommentQuote({ comment }: { comment: TaskComment }) {
    const value = useTaskLineComments()
    const ref = comment.lineRef
    if (!ref) return null
    const anchored = value?.byComment.get(comment.id)
    const line = anchored?.line ?? null
    const where = ref.field === "comment" ? "de um comentário" : `da ${LINE_COMMENT_FIELD_LABELS[ref.field]}`
    const status =
        line === null
            ? "Linha não encontrada (alterada ou removida)"
            : anchored?.selectionMissing
              ? `O trecho não está mais no texto (fica na linha ${line})`
              : anchored?.relocated
                ? `Reancorado na linha ${line} (o texto mudou)`
                : null
    const title = ref.selection ? (ref.selection.lines > 1 ? `Trecho de ${ref.selection.lines} linhas até a linha ${ref.line}` : `Trecho da linha ${ref.line}`) : `Linha ${ref.line}`

    return (
        <div className="mb-2 rounded-md border-l-2 border-primary/60 bg-primary/5 px-2.5 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <MessageSquareQuote className="h-3.5 w-3.5 text-primary" aria-hidden /> {title} {where}
                </span>
                <button
                    type="button"
                    disabled={line === null || !value}
                    title={line === null ? "A linha comentada não existe mais no texto" : undefined}
                    onClick={() => value?.jump(comment.id)}
                    className="flex items-center gap-1 text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                    <CornerDownRight className="h-3 w-3" aria-hidden /> Ir para a linha
                </button>
            </div>
            {ref.selection ? (
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-muted-foreground">“{ref.selection.text}”</p>
            ) : (
                ref.quote && <p className="mt-1 line-clamp-2 text-muted-foreground">{ref.quote}</p>
            )}
            {status && <p className={line === null ? "mt-1 text-destructive" : "mt-1 text-warning"}>{status}</p>}
        </div>
    )
}
