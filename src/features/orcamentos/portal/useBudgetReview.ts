"use client"

import { useMemo } from "react"
import { useDraftReview, type DraftReview } from "../hooks/useDraftReview"
import { useClientePortal } from "./ClientePortalContext"

/**
 * Revisão da tarefa do portal do cliente: o fluxo de duas fases compartilhado (`useDraftReview`),
 * autenticado pelo token do cliente.
 */
export function useBudgetReview(draftId: string): DraftReview {
    const { token } = useClientePortal()
    const headers = useMemo(() => ({ "x-client-token": token }), [token])
    return useDraftReview({
        previewPath: `/api/cliente/drafts/${draftId}/preview`,
        estimatePath: `/api/cliente/drafts/${draftId}/estimate`,
        headers,
    })
}
