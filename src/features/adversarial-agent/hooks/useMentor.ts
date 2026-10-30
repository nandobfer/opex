"use client"

import { useEffect } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { MENTOR_FEATURE, MENTOR_HISTORY_LIMIT, MENTOR_UPDATED_EVENT } from "../mentor/constants"
import type { MentorRunListParams } from "../mentor/filters"
import type { MentorSettings } from "../mentor/schemas"
import type { MentorRunDto, MentorRunListDto, MentorSettingsDto } from "../mentor/types"

/** Consultas e mutações do Agente Mentor (parte do Agente Adversário). */

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
const settingsKey = () => [AI_QUERY_KEY, "feature", MENTOR_FEATURE] as const
export const MENTOR_RUNS_KEY = ["adversarial", "mentor", "runs"] as const

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const useMentorSettings = () => useQuery({ queryKey: settingsKey(), queryFn: () => get<MentorSettingsDto>(`/ai/features/${MENTOR_FEATURE}`) })

export function useSaveMentorSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: MentorSettings) => unwrapApi((await api.put<ApiResponse<MentorSettingsDto>>(`/ai/features/${MENTOR_FEATURE}`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(settingsKey(), saved)
            toast.success('Configuração do "Agente Mentor" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

const getRuns = async (params: MentorRunListParams & { page?: number }) => unwrapApi((await api.get<ApiResponse<MentorRunListDto>>("/adversarial/mentor/runs", { params })).data)

/** As execuções mais recentes (aba Execuções da configuração). */
export const useMentorRuns = () => useQuery({ queryKey: [...MENTOR_RUNS_KEY, "history"], queryFn: () => getRuns({ limit: String(MENTOR_HISTORY_LIMIT) }), select: (data) => data.items })

/** Execuções paginadas no recorte dos filtros (página Agente Mentor, rolagem infinita). */
export function useMentorRunPages(params: MentorRunListParams) {
    return useInfiniteQuery({
        queryKey: [...MENTOR_RUNS_KEY, "pages", params],
        queryFn: ({ pageParam }) => getRuns({ ...params, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
        staleTime: 10_000,
    })
}

/** Aprovar (com o texto opcionalmente editado) ou descartar uma sugestão do Mentor. */
export function useMentorRunDecision() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (vars: { id: string; decision: "approve" | "discard"; text?: string }) =>
            unwrapApi((await api.post<ApiResponse<MentorRunDto>>(`/adversarial/mentor/runs/${vars.id}/${vars.decision}`, vars.decision === "approve" && vars.text ? { text: vars.text } : {})).data),
        onSuccess: (_saved, vars) => {
            // A lista da aba e as páginas filtradas (a execução pode sair do recorte de Situação).
            void queryClient.invalidateQueries({ queryKey: MENTOR_RUNS_KEY })
            void queryClient.invalidateQueries({ queryKey: ["adversarial", "memories"] })
            toast.success(vars.decision === "approve" ? "Memória do Agente Adversário gravada" : "Sugestão descartada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a ação")),
    })
}

/** Execuções mudaram (fila, veredito, decisão): relê a lista. */
export function useMentorRealtime(enabled = true): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: MENTOR_RUNS_KEY })
        channel.bind(MENTOR_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(MENTOR_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}
