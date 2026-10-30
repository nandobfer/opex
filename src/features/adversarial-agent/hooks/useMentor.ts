"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { MENTOR_FEATURE, MENTOR_TARGET_LABELS, MENTOR_UPDATED_EVENT, type MentorTarget } from "../mentor/constants"
import type { MentorSettings } from "../mentor/schemas"
import type { MentorRunDto, MentorSettingsDto } from "../mentor/types"

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

export const useMentorRuns = () => useQuery({ queryKey: MENTOR_RUNS_KEY, queryFn: () => get<MentorRunDto[]>("/adversarial/mentor/runs") })

/** Aprovar (com o texto opcionalmente editado) ou descartar uma sugestão do Mentor. */
export function useMentorRunDecision() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (vars: { id: string; decision: "approve" | "discard"; text?: string; target?: MentorTarget }) =>
            unwrapApi((await api.post<ApiResponse<MentorRunDto>>(`/adversarial/mentor/runs/${vars.id}/${vars.decision}`, vars.decision === "approve" ? { ...(vars.text ? { text: vars.text } : {}), ...(vars.target ? { target: vars.target } : {}) } : {})).data),
        onSuccess: (saved, vars) => {
            queryClient.setQueryData<MentorRunDto[]>(MENTOR_RUNS_KEY, (current) => current?.map((run) => (run.id === saved.id ? saved : run)))
            void queryClient.invalidateQueries({ queryKey: ["adversarial", "memories"] })
            toast.success(vars.decision === "approve" ? `Memória gravada em "${vars.target ? MENTOR_TARGET_LABELS[vars.target].label : "Agente Adversário"}"` : "Sugestão descartada")
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
