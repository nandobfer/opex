"use client"

import { useDraftReview, type DraftReview } from "../hooks/useDraftReview"

/**
 * Revisão da tarefa do portal do cliente: o fluxo de duas fases compartilhado (`useDraftReview`),
 * autenticado por **cookie de sessão** (mesmo domínio).
 */
export function useBudgetReview(draftId: string): DraftReview {
    return useDraftReview({
        previewPath: `/api/cliente/drafts/${draftId}/preview`,
        estimatePath: `/api/cliente/drafts/${draftId}/estimate`,
    })
}
