"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { withBasePath } from "@/lib/base-path"
import { useEventStream } from "@/features/agentic/hooks/useEventStream"
import type { TimelineState } from "@/features/agentic/timeline"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { PR_REVIEW_UPDATED_EVENT, type PrReviewAction } from "../constants"
import type { PrReviewSettings } from "../schemas"
import type { PrReviewDetailDto, PrReviewListDto, PrReviewSettingsDto } from "../types"

/** Consultas e mutações da "Revisão de PR". */

const SETTINGS_KEY = [AI_QUERY_KEY, "feature", "pr-review"] as const
export const PR_REVIEWS_QUERY_KEY = "pr-reviews"
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const usePrReviewSettings = () => useQuery({ queryKey: SETTINGS_KEY, queryFn: () => get<PrReviewSettingsDto>("/ai/features/pr-review") })

export function useSavePrReviewSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: PrReviewSettings) => unwrapApi((await api.put<ApiResponse<PrReviewSettingsDto>>("/ai/features/pr-review", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(SETTINGS_KEY, saved)
            toast.success('Configuração de "Revisão de PR" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const usePrReviews = () => useQuery({ queryKey: [PR_REVIEWS_QUERY_KEY, "list"], queryFn: () => get<PrReviewListDto>("/pr-reviews"), staleTime: 10_000 })

export const usePrReview = (id: string | null) =>
    useQuery({ queryKey: [PR_REVIEWS_QUERY_KEY, "detail", id], queryFn: () => get<PrReviewDetailDto>(`/pr-reviews/${id}`), enabled: Boolean(id) })

function useInvalidateReviews() {
    const queryClient = useQueryClient()
    return () => queryClient.invalidateQueries({ queryKey: [PR_REVIEWS_QUERY_KEY] })
}

export function useRequestPrReview() {
    const invalidate = useInvalidateReviews()
    return useMutation({
        mutationFn: async (url: string) => unwrapApi((await api.post<ApiResponse<PrReviewDetailDto>>("/pr-reviews", { url })).data),
        onSuccess: (review) => {
            void invalidate()
            toast.success(`PR #${review.number} na fila de revisão`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível pedir a revisão")),
    })
}

export function usePrReviewAction() {
    const invalidate = useInvalidateReviews()
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: PrReviewAction }) => unwrapApi((await api.post<ApiResponse<PrReviewDetailDto>>(`/pr-reviews/${id}/actions/${action}`)).data),
        onSuccess: (_review, { action }) => {
            void invalidate()
            toast.success(action === "stop" ? "Revisão parada" : "Revisão na fila")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível executar a ação")),
    })
}

/** Revisões mudaram no servidor (rotina, outra aba): recarrega o histórico e o detalhe. */
export function usePrReviewRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [PR_REVIEWS_QUERY_KEY] })
        channel.bind(PR_REVIEW_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(PR_REVIEW_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

/** Saída do agente ao vivo (`GET /api/pr-reviews/[id]/events`). */
export function usePrReviewStream(id: string | null): { timeline: TimelineState; connected: boolean } {
    return useEventStream(id, id ? withBasePath(`/api/pr-reviews/${id}/events`) : null)
}
