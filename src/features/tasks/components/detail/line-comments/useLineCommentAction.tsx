"use client"

import { useMemo } from "react"
import type { MarkdownLineAction } from "@/components/ui/markdown-line-action"
import { OPTIMISTIC_COMMENT_PREFIX } from "../../../line-comments/format"
import type { LineCommentField } from "../../../types"
import { LINE_COMMENT_ICON, LineCommentPopover } from "./LineCommentPopover"
import { sourceKeyOf, useTaskLineComments } from "./LineCommentsContext"

/**
 * Ação "Comentar a linha" para o `Markdown` de um texto da tarefa: badge com a quantidade de
 * comentários da linha e popover com a conversa + campo. Sem o provider (ou em comentário ainda
 * otimista) devolve `null`.
 */
export function useLineCommentAction(field: LineCommentField, commentId: string | null = null): MarkdownLineAction | null {
    const value = useTaskLineComments()
    const sourceKey = sourceKeyOf(field, commentId)
    const taskId = value?.task.id ?? null
    const threads = value?.threads(sourceKey) ?? null
    const flash = value?.flash && value.flash.sourceKey === sourceKey ? value.flash : null
    const disabled = !taskId || (field === "comment" && (!commentId || commentId.startsWith(OPTIMISTIC_COMMENT_PREFIX)))

    return useMemo<MarkdownLineAction | null>(() => {
        if (disabled || !taskId) return null
        return {
            icon: LINE_COMMENT_ICON,
            label: "Comentar a linha",
            anchorId: sourceKey,
            count: (line) => threads?.get(line)?.length ?? 0,
            flash: flash ? { line: flash.line, key: flash.key } : null,
            renderPopover: (context) => <LineCommentPopover taskId={taskId} field={field} commentId={commentId} sourceKey={sourceKey} context={context} />,
        }
    }, [disabled, taskId, sourceKey, threads, flash, field, commentId])
}
