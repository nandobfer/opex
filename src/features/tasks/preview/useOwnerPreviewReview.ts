"use client"

import { useDraftReview, type DraftReview } from "@/features/orcamentos/hooks/useDraftReview"

/**
 * Revisão da prévia do **dono**: o fluxo compartilhado de duas fases sobre os endpoints internos
 * (`/api/tasks/drafts/**`, autenticados pela sessão). `runEstimate({ clientId })` reestima **só o
 * custo** reusando as horas já estimadas.
 */
export function useOwnerPreviewReview(draftId: string): DraftReview {
    return useDraftReview({
        previewPath: `/api/tasks/drafts/${draftId}/preview`,
        estimatePath: `/api/tasks/drafts/${draftId}/estimate`,
    })
}
