"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useReducedMotion } from "framer-motion"
import { resolveLineAnchors } from "../../../line-comments/anchors"
import type { LineCommentField, TaskComment, TaskDetailDto, TaskLineSelection } from "../../../types"

/**
 * Comentários de linha da página da tarefa: cada comentário com `lineRef` é ligado à linha atual do
 * texto comentado (descrição, especificação ou corpo de outro comentário) e a página sabe ir até a
 * linha (troca de aba, rola e destaca com flash).
 */

export type LineCommentTab = "description" | "spec" | "comments"

export interface AnchoredComment {
    comment: TaskComment
    /** Texto comentado: `description`, `technicalSpec` ou `comment-{id}`. */
    sourceKey: string
    line: number | null
    relocated: boolean
    /** Trecho comentado não está mais na linha (o comentário fica só na linha). */
    selectionMissing: boolean
}

interface Flash {
    sourceKey: string
    line: number
    key: number
    selection: TaskLineSelection | null
}

interface LineCommentsValue {
    task: TaskDetailDto
    byComment: Map<string, AnchoredComment>
    /** Linha → comentários (mais antigos primeiro) de um texto. */
    threads: (sourceKey: string) => Map<number, AnchoredComment[]>
    jump: (commentId: string) => void
    flash: Flash | null
}

const LineCommentsContext = createContext<LineCommentsValue | null>(null)

export const sourceKeyOf = (field: LineCommentField, commentId?: string | null) => (field === "comment" ? `comment-${commentId ?? ""}` : field)

const TAB_OF: Record<LineCommentField, LineCommentTab> = { description: "description", technicalSpec: "spec", comment: "comments" }

function sourceText(task: TaskDetailDto, field: LineCommentField, commentId: string | null): string {
    if (field === "description") return task.description ?? ""
    if (field === "technicalSpec") return task.technicalSpec ?? ""
    return task.comments.find((comment) => comment.id === commentId)?.body ?? ""
}

/** Liga todos os comentários de linha da tarefa às linhas atuais (função pura, testável). */
export function anchorTaskComments(task: TaskDetailDto): Map<string, AnchoredComment> {
    const groups = new Map<string, TaskComment[]>()
    for (const comment of task.comments) {
        if (!comment.lineRef) continue
        const key = sourceKeyOf(comment.lineRef.field, comment.lineRef.commentId)
        groups.set(key, [...(groups.get(key) ?? []), comment])
    }
    const result = new Map<string, AnchoredComment>()
    for (const [sourceKey, comments] of groups) {
        const ref = comments[0]!.lineRef!
        const anchors = resolveLineAnchors(sourceText(task, ref.field, ref.commentId), comments, (comment) => comment.lineRef!)
        for (const anchor of anchors) result.set(anchor.item.id, { comment: anchor.item, sourceKey, line: anchor.line, relocated: anchor.relocated, selectionMissing: anchor.selectionMissing })
    }
    return result
}

const byDate = (a: AnchoredComment, b: AnchoredComment) => (a.comment.createdAt ?? "").localeCompare(b.comment.createdAt ?? "")

export function TaskLineCommentsProvider({ task, onTab, children }: { task: TaskDetailDto; onTab: (tab: LineCommentTab) => void; children: ReactNode }) {
    const reduceMotion = useReducedMotion()
    const [flash, setFlash] = useState<Flash | null>(null)
    const byComment = useMemo(() => anchorTaskComments(task), [task])
    const threadMap = useMemo(() => {
        const map = new Map<string, Map<number, AnchoredComment[]>>()
        for (const anchored of byComment.values()) {
            if (anchored.line === null) continue
            const lines = map.get(anchored.sourceKey) ?? new Map<number, AnchoredComment[]>()
            lines.set(anchored.line, [...(lines.get(anchored.line) ?? []), anchored].sort(byDate))
            map.set(anchored.sourceKey, lines)
        }
        return map
    }, [byComment])
    const threads = useCallback((sourceKey: string) => threadMap.get(sourceKey) ?? new Map<number, AnchoredComment[]>(), [threadMap])

    const jump = useCallback(
        (commentId: string) => {
            const anchored = byComment.get(commentId)
            const ref = anchored?.comment.lineRef
            if (!anchored || !ref || anchored.line === null) return
            const line = anchored.line
            onTab(TAB_OF[ref.field])
            const selector = `[data-md-anchor="${anchored.sourceKey}:${line}"]`
            const deadline = Date.now() + 1500
            // A aba troca com animação: espera a linha aparecer no DOM antes de rolar.
            const tick = () => {
                const element = document.querySelector<HTMLElement>(selector)
                if (element) {
                    element.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" })
                    setFlash({ sourceKey: anchored.sourceKey, line, key: Date.now(), selection: anchored.selectionMissing ? null : ref.selection })
                } else if (Date.now() < deadline) requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
        },
        [byComment, onTab, reduceMotion],
    )

    const value = useMemo(() => ({ task, byComment, threads, jump, flash }), [task, byComment, threads, jump, flash])
    return <LineCommentsContext.Provider value={value}>{children}</LineCommentsContext.Provider>
}

export const useTaskLineComments = () => useContext(LineCommentsContext)
