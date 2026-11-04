"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { MENTOR_REORG_UPDATED_EVENT, type MentorTarget } from "../mentor/constants"
import type { MentorReorgDto, MentorReorgListDto, MentorReorgPreviewDto } from "../mentor/types"

/** Consultas e mutações da reorganização do acervo do Agente Mentor (OPE-132). */

export const MENTOR_REORG_KEY = ["adversarial", "mentor", "reorg"] as const

const get = async <T,>(path: string, params?: Record<string, string>) => unwrapApi((await api.get<ApiResponse<T>>(path, { params })).data)

export const useMentorReorgs = () => useQuery({ queryKey: [...MENTOR_REORG_KEY, "list"], queryFn: () => get<MentorReorgListDto>("/adversarial/mentor/reorganizations") })

/** Plano aberto: relê a cada 2 s enquanto a revisão ou a aplicação está em andamento (o Pusher avisa antes). */
export function useMentorReorg(id: string | null) {
    return useQuery({
        queryKey: [...MENTOR_REORG_KEY, "plan", id],
        queryFn: () => get<MentorReorgDto>(`/adversarial/mentor/reorganizations/${id}`),
        enabled: Boolean(id),
        refetchInterval: (query) => {
            const status = query.state.data?.status
            return status === "queued" || status === "running" || status === "applying" ? 2000 : false
        },
    })
}

/** Estimativa do recorte antes de iniciar (memórias, chamadas e custo médio por memória). */
export function useMentorReorgPreview(scope: { targets: MentorTarget[]; centralIds: string[] }, enabled = true) {
    const params = { targets: scope.targets.join(","), centralIds: scope.centralIds.join(",") }
    return useQuery({
        queryKey: [...MENTOR_REORG_KEY, "preview", params],
        queryFn: () => get<MentorReorgPreviewDto>("/adversarial/mentor/reorganizations/preview-count", params),
        enabled,
        staleTime: 10_000,
    })
}

export function useStartMentorReorg() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (scope: { targets: MentorTarget[]; centralIds: string[] }) => unwrapApi((await api.post<ApiResponse<MentorReorgDto>>("/adversarial/mentor/reorganizations", scope)).data),
        onSuccess: (plan) => {
            queryClient.setQueryData([...MENTOR_REORG_KEY, "plan", plan.id], plan)
            void queryClient.invalidateQueries({ queryKey: MENTOR_REORG_KEY })
            toast.success("Revisão do acervo iniciada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar a revisão")),
    })
}

/** Aprovar (tudo ou os itens escolhidos) ou descartar o plano; cancelar a revisão em andamento. */
export function useMentorReorgDecision() {
    const queryClient = useQueryClient()
    const key = (id: string) => [...MENTOR_REORG_KEY, "plan", id]
    return useMutation({
        mutationFn: async (vars: { id: string; decision: "apply" | "discard" | "cancel"; itemIds?: string[]; overrides?: Record<string, { text?: string; confirmOwner?: boolean }> }) => {
            const body = vars.decision === "cancel" ? {} : vars.decision === "apply" ? { ...(vars.itemIds ? { itemIds: vars.itemIds } : {}), ...(vars.overrides ? { overrides: vars.overrides } : {}) } : { ...(vars.itemIds ? { itemIds: vars.itemIds } : {}) }
            return unwrapApi((await api.post<ApiResponse<MentorReorgDto>>(`/adversarial/mentor/reorganizations/${vars.id}/${vars.decision}`, body)).data)
        },
        onMutate: async (vars) => {
            if (vars.decision === "cancel") return { previous: undefined }
            await queryClient.cancelQueries({ queryKey: key(vars.id) })
            const previous = queryClient.getQueryData<MentorReorgDto>(key(vars.id))
            if (previous) {
                const ids = new Set(vars.itemIds ?? previous.items.map((item) => item.id))
                const status = vars.decision === "apply" ? "approved" : "discarded"
                queryClient.setQueryData<MentorReorgDto>(key(vars.id), { ...previous, items: previous.items.map((item) => (item.status === "pending" && ids.has(item.id) ? { ...item, status } : item)) })
            }
            return { previous }
        },
        onError: (error, vars, context) => {
            if (context?.previous) queryClient.setQueryData(key(vars.id), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível concluir a ação"))
        },
        onSuccess: (plan) => {
            queryClient.setQueryData(key(plan.id), plan)
            void queryClient.invalidateQueries({ queryKey: MENTOR_REORG_KEY })
            toast.success(plan.status === "applied" ? "Plano de reorganização aplicado" : plan.status === "cancelled" ? "Revisão cancelada" : plan.status === "discarded" ? "Plano descartado" : "Plano atualizado")
        },
    })
}

/** Reorganizações (item revisado, status, decisão): relê a lista e o plano aberto. */
export function useMentorReorgRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: MENTOR_REORG_KEY })
        channel.bind(MENTOR_REORG_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(MENTOR_REORG_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
