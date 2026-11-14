"use client"

import { useEffect, useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { isGoneError } from "@/features/ai/hooks/useMemoryDetail"
import { MENTOR_FEATURE, MENTOR_HISTORY_LIMIT, MENTOR_TARGET_LABELS, MENTOR_UPDATED_EVENT, type MentorTarget } from "../mentor/constants"
import type { MentorRunListParams } from "../mentor/filters"
import type { MentorSettings } from "../mentor/schemas"
import type { MentorLearningRunDto, MentorRunDto, MentorRunListDto, MentorRunMemoryDto, MentorSettingsDto } from "../mentor/types"

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

/** Enquanto o Engramind gera o resumo, relê a cada 5 s por até 2 min (contados a cada abertura do detalhe). */
export const MENTOR_MEMORY_POLL_MS = 5_000
export const MENTOR_MEMORY_POLL_MAX_MS = 120_000

/** Intervalo da releitura do resumo: só com o resumo pendente e antes de estourar o limite da abertura. */
export const mentorMemoryPollInterval = (data: Pick<MentorRunMemoryDto, "resumoPendente"> | undefined, expired: boolean): number | false =>
    data?.resumoPendente && !expired ? MENTOR_MEMORY_POLL_MS : false

/**
 * Resumo da memória gravada pela execução aberta (só com `memoryId`). Fica sob `MENTOR_RUNS_KEY`:
 * a aprovação e o `adversarial-mentor-updated` também o invalidam. `expired`: o limite da releitura
 * estourou nesta abertura com o resumo ainda pendente (a tela para de dizer que está gerando).
 */
export function useMentorRunMemory(run: Pick<MentorRunDto, "id" | "memoryId"> | null) {
    const id = run?.id ?? null
    const memoryId = run?.memoryId ?? null
    const key = id && memoryId ? `${id}:${memoryId}` : null
    const [expiredKey, setExpiredKey] = useState<string | null>(null)
    const expired = key !== null && expiredKey === key
    const query = useQuery({
        queryKey: [...MENTOR_RUNS_KEY, "memory", id, memoryId],
        queryFn: () => get<MentorRunMemoryDto>(`/adversarial/mentor/runs/${id}/memory`),
        enabled: key !== null,
        refetchInterval: (current) => mentorMemoryPollInterval(current.state.data, expired),
    })
    const pending = Boolean(query.data?.resumoPendente)
    // O relógio do limite começa quando o detalhe abre (o hook monta) ou troca de execução, não no cache.
    useEffect(() => {
        if (!key || !pending || expiredKey === key) return
        const timer = setTimeout(() => setExpiredKey(key), MENTOR_MEMORY_POLL_MAX_MS)
        return () => clearTimeout(timer)
    }, [key, pending, expiredKey])
    return { ...query, expired }
}

/** Aprovar (com o texto opcionalmente editado) ou descartar uma sugestão do Mentor. */
export function useMentorRunDecision() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (vars: { id: string; decision: "approve" | "discard"; text?: string; target?: MentorTarget; extraText?: string; includeExtra?: boolean }) =>
            unwrapApi(
                (
                    await api.post<ApiResponse<MentorRunDto>>(
                        `/adversarial/mentor/runs/${vars.id}/${vars.decision}`,
                        vars.decision === "approve"
                            ? { ...(vars.text ? { text: vars.text } : {}), ...(vars.target ? { target: vars.target } : {}), ...(vars.extraText ? { extraText: vars.extraText } : {}), ...(vars.includeExtra === false ? { includeExtra: false } : {}) }
                            : {},
                    )
                ).data,
            ),
        onSuccess: (_saved, vars) => {
            // A lista da aba e as páginas filtradas (a execução pode sair do recorte de Situação).
            void queryClient.invalidateQueries({ queryKey: MENTOR_RUNS_KEY })
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

/** Uma execução do Mentor (com os casos, no aprendizado), lida quando o detalhe ou o painel da sugestão abre. */
export function useMentorRun(id: string | null, enabled: boolean) {
    return useQuery({
        queryKey: [...MENTOR_RUNS_KEY, "one", id],
        queryFn: () => get<MentorLearningRunDto>(`/adversarial/mentor/runs/${id}`),
        enabled: enabled && id !== null,
        staleTime: 15_000,
        retry: (count, error) => !isGoneError(error) && count < 2,
    })
}

/** Execuções de aprendizado de uma mesa, com os casos (aba "Aprendizado", OPE-165). */
export function useWorkbenchMentorRuns(workbenchId: string) {
    return useQuery({
        queryKey: [...MENTOR_RUNS_KEY, "workbench", workbenchId],
        queryFn: () => get<MentorLearningRunDto[]>(`/adversarial/workbenches/${workbenchId}/mentor-runs`),
        staleTime: 10_000,
    })
}

/** Tentar novamente uma execução de aprendizado que falhou (nova tentativa da mesma conclusão). */
export function useRetryMentorRun() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<{ id: string }>>(`/adversarial/mentor/runs/${id}/retry`, {})).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: MENTOR_RUNS_KEY })
            toast.success("O Agente Mentor vai aprender com esta mesa de novo")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível tentar novamente")),
    })
}
