"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { agenticKey } from "@/features/agentic/hooks/useAgentic"
import type { WorkbenchDto } from "@/features/agentic/types"
import { ADVERSARIAL_FEATURE, ADVERSARIAL_UPDATED_EVENT } from "../constants"
import type { AdversarialFixInput, AdversarialSettings } from "../schemas"
import type { AdversarialReviewDetailDto, AdversarialReviewDto, AdversarialSettingsDto } from "../types"

/** Consultas e mutações do Agente Adversário. */

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
const settingsKey = () => [AI_QUERY_KEY, "feature", ADVERSARIAL_FEATURE] as const
export const ADVERSARIAL_REVIEWS_KEY = ["adversarial", "reviews"] as const
const reviewKey = (id: string) => ["adversarial", "review", id] as const
const workbenchReviewKey = (workbenchId: string) => ["adversarial", "workbench", workbenchId] as const

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const useAdversarialSettings = () => useQuery({ queryKey: settingsKey(), queryFn: () => get<AdversarialSettingsDto>(`/ai/features/${ADVERSARIAL_FEATURE}`) })

export function useSaveAdversarialSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: AdversarialSettings) => unwrapApi((await api.put<ApiResponse<AdversarialSettingsDto>>(`/ai/features/${ADVERSARIAL_FEATURE}`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(settingsKey(), saved)
            toast.success('Configuração do "Agente Adversário" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useAdversarialReviews = () => useQuery({ queryKey: ADVERSARIAL_REVIEWS_KEY, queryFn: () => get<AdversarialReviewDto[]>("/adversarial/reviews") })

export const useAdversarialReview = (id: string | null) => useQuery({ queryKey: reviewKey(id ?? ""), queryFn: () => get<AdversarialReviewDetailDto>(`/adversarial/reviews/${id}`), enabled: Boolean(id) })

/** Última rodada da mesa (painel do bloqueio). */
export const useWorkbenchAdversarialReview = (workbenchId: string, enabled: boolean) =>
    useQuery({ queryKey: workbenchReviewKey(workbenchId), queryFn: () => get<AdversarialReviewDetailDto | null>(`/adversarial/workbenches/${workbenchId}`), enabled })

/** Rodadas da mesa (aba "Adversário"); a chave fica sob a da mesa, então o Pusher também a relê. */
export const useWorkbenchAdversarialReviews = (workbenchId: string, enabled: boolean) =>
    useQuery({ queryKey: [...workbenchReviewKey(workbenchId), "rounds"], queryFn: () => get<AdversarialReviewDetailDto[]>(`/adversarial/workbenches/${workbenchId}/reviews`), enabled })

/** Revisões mudaram (rodada nova, veredito, decisão): relê a lista, a mesa e os detalhes. */
export function useAdversarialRealtime(enabled = true): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: { workbenchId?: string } | undefined) => {
            void queryClient.invalidateQueries({ queryKey: ADVERSARIAL_REVIEWS_KEY })
            void queryClient.invalidateQueries({ queryKey: ["adversarial", "review"] })
            if (payload?.workbenchId) void queryClient.invalidateQueries({ queryKey: workbenchReviewKey(payload.workbenchId) })
        }
        channel.bind(ADVERSARIAL_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ADVERSARIAL_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}

type AdversarialAction = { action: "adversarial-fix"; input: AdversarialFixInput } | { action: "adversarial-skip" } | { action: "adversarial-rerun" }

const ACTION_TOASTS: Record<AdversarialAction["action"], string> = {
    "adversarial-fix": "Correção enviada ao implementador",
    "adversarial-skip": "Seguindo sem os bloqueios do agente adversário",
    "adversarial-rerun": "Nova revisão do agente adversário",
}

/** Decisões da mesa depois de um bloqueio (resposta otimista: a mesa entra em "executando" na hora). */
export function useAdversarialWorkbenchAction(workbench: WorkbenchDto) {
    const queryClient = useQueryClient()
    const key = agenticKey("workbench", workbench.taskId)
    return useMutation({
        mutationFn: async (vars: AdversarialAction) =>
            unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench.id}/actions/${vars.action}`, vars.action === "adversarial-fix" ? vars.input : {})).data),
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: key })
            queryClient.setQueryData<WorkbenchDto | null>(key, (current) => (current ? { ...current, runState: "running", error: null } : current))
            return { previous: workbench }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível executar a ação"))
        },
        onSuccess: (saved, vars) => {
            queryClient.setQueryData(key, saved)
            void queryClient.invalidateQueries({ queryKey: agenticKey("workbenches", saved.centralId) })
            void queryClient.invalidateQueries({ queryKey: workbenchReviewKey(saved.id) })
            if (saved.slotQueue) toast.info(`Limite de mesas da central atingido: aguardando vaga${saved.slotQueue.position ? ` (posição #${saved.slotQueue.position})` : ""}`)
            else toast.success(ACTION_TOASTS[vars.action])
        },
    })
}
