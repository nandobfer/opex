"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import type { ApiResponse } from "@/lib/types/api"
import { FORK_INTEGRATION_TARGET_LABELS, type ForkIntegrationTarget } from "../constants"
import type { ForkAction } from "../fork-logic"
import type { FormReplyInput, PermissionReplyInput } from "../schemas"
import type { TimelineState } from "../timeline"
import type { ForkDto, WorkbenchDto } from "../types"
import { agenticKey } from "./useAgentic"
import { useEventStream } from "./useEventStream"

/**
 * Forks da conversa de uma mesa. A lista é atualizada em tempo real pelo `useAgenticRealtime`
 * (evento `agentic-updated`, que invalida todas as consultas do desenvolvimento agêntico).
 */

export const forksKey = (workbenchId: string) => agenticKey("forks", workbenchId)
const base = (workbenchId: string) => `/agentic/workbenches/${workbenchId}/forks`

export const useWorkbenchForks = (workbenchId: string) =>
    useQuery({ queryKey: forksKey(workbenchId), queryFn: async () => unwrapApi((await api.get<ApiResponse<ForkDto[]>>(base(workbenchId))).data) })

/** Saída do fork ao vivo (mesmo protocolo NDJSON da mesa). */
export function useForkStream(workbenchId: string, forkId: string | null): { timeline: TimelineState; connected: boolean } {
    return useEventStream(forkId, forkId ? withBasePath(`/api${base(workbenchId)}/${forkId}/events`) : null)
}

function useSetFork(workbenchId: string) {
    const queryClient = useQueryClient()
    return (fork: ForkDto) =>
        queryClient.setQueryData<ForkDto[]>(forksKey(workbenchId), (current) => {
            const list = current ?? []
            return list.some((item) => item.id === fork.id) ? list.map((item) => (item.id === fork.id ? fork : item)) : [...list, fork]
        })
}

export function useOpenFork(workbenchId: string) {
    const setFork = useSetFork(workbenchId)
    return useMutation({
        mutationFn: async ({ text, parentForkId }: { text: string; parentForkId?: string }) => unwrapApi((await api.post<ApiResponse<ForkDto>>(base(workbenchId), parentForkId ? { text, parentForkId } : { text })).data),
        onSuccess: (fork) => {
            setFork(fork)
            toast.success(`Fork ${fork.number} aberto`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível abrir o fork")),
    })
}

type ForkMutation = { action: Exclude<ForkAction, "discard">; text?: string; target?: ForkIntegrationTarget }

const ACTION_TOASTS: Partial<Record<ForkAction, string>> = {
    close: "Fork encerrado",
    resume: "Conversa retomada",
    interrupt: "Interrompendo o agente do fork",
    integrate: "Consolidando o resumo do fork",
    "revise-summary": "Ajuste enviado ao agente",
    "cancel-integration": "Integração cancelada",
}

/** Otimista: o que o servidor fará na hora (a resposta corrige; a falha reverte). */
function optimistic(fork: ForkDto, { action }: ForkMutation): ForkDto {
    switch (action) {
        case "send":
        case "retry":
        case "revise-summary":
            return { ...fork, runState: "running", error: null }
        case "integrate":
            return { ...fork, status: "integrating", summary: null, runState: "running", error: null }
        case "close":
            return { ...fork, status: "closed", runState: "idle", error: null }
        case "resume":
            return { ...fork, status: "active" }
        case "cancel-integration":
            return { ...fork, status: "closed", summary: null }
        default:
            return fork
    }
}

/** Mensagens e ações do fork com resposta otimista. */
export function useForkAction(workbenchId: string, fork: ForkDto) {
    const queryClient = useQueryClient()
    const setFork = useSetFork(workbenchId)
    return useMutation({
        mutationFn: async (input: ForkMutation) => {
            const path = input.action === "send" ? `${base(workbenchId)}/${fork.id}/messages` : `${base(workbenchId)}/${fork.id}/actions/${input.action}`
            const body = input.action === "apply" ? { target: input.target } : input.text === undefined ? {} : { text: input.text }
            return unwrapApi((await api.post<ApiResponse<ForkDto>>(path, body)).data)
        },
        onMutate: async (input) => {
            const key = forksKey(workbenchId)
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<ForkDto[]>(key)
            if (input.action !== "interrupt" && input.action !== "apply") setFork(optimistic(fork, input))
            return { previous }
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(forksKey(workbenchId), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível executar a ação no fork"))
        },
        onSuccess: (saved, input) => {
            setFork(saved)
            // Integrar no planejador ou reabrir muda a mesa: recarrega.
            if (input.action === "apply") {
                void queryClient.invalidateQueries({ queryKey: agenticKey("workbench") })
                toast.success(`Fork integrado: ${FORK_INTEGRATION_TARGET_LABELS[input.target!].label}`)
                return
            }
            const message = ACTION_TOASTS[input.action]
            if (message) toast.success(message)
        },
    })
}

export function useDiscardFork(workbenchId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (fork: ForkDto) => {
            await api.delete(`${base(workbenchId)}/${fork.id}`)
            return fork
        },
        onSuccess: (fork) => {
            queryClient.setQueryData<ForkDto[]>(forksKey(workbenchId), (current) => (current ?? []).filter((item) => item.id !== fork.id))
            toast.success(`Fork ${fork.number} descartado`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível descartar o fork")),
    })
}

export function useReplyForkForm(workbenchId: string, forkId: string) {
    const setFork = useSetFork(workbenchId)
    return useMutation({
        mutationFn: async ({ formId, ...input }: FormReplyInput & { formId: string }) => unwrapApi((await api.post<ApiResponse<ForkDto>>(`${base(workbenchId)}/${forkId}/forms/${encodeURIComponent(formId)}`, input)).data),
        onSuccess: setFork,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a resposta")),
    })
}

export function useReplyForkPermission(workbenchId: string, forkId: string) {
    const setFork = useSetFork(workbenchId)
    return useMutation({
        mutationFn: async ({ requestId, ...input }: PermissionReplyInput & { requestId: string }) =>
            unwrapApi((await api.post<ApiResponse<ForkDto>>(`${base(workbenchId)}/${forkId}/permissions/${encodeURIComponent(requestId)}`, input)).data),
        onSuccess: setFork,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível responder ao pedido")),
    })
}

/** Resposta à pergunta da mesa concluída com forks em aberto. */
export function useForksDonePrompt(workbench: WorkbenchDto) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (decision: "conclude" | "keep") => unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`${base(workbench.id)}/done-prompt`, { decision })).data),
        onMutate: async () => {
            const key = agenticKey("workbench", workbench.taskId)
            await queryClient.cancelQueries({ queryKey: key })
            queryClient.setQueryData<WorkbenchDto | null>(key, (current) => (current ? { ...current, forksDonePrompt: null } : current))
            return { previous: workbench }
        },
        onError: (error, _decision, context) => {
            if (context?.previous) queryClient.setQueryData(agenticKey("workbench", workbench.taskId), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível responder"))
        },
        onSuccess: (saved, decision) => {
            queryClient.setQueryData(agenticKey("workbench", saved.taskId), saved)
            void queryClient.invalidateQueries({ queryKey: forksKey(saved.id) })
            void queryClient.invalidateQueries({ queryKey: agenticKey("workbenches", saved.centralId) })
            toast.success(decision === "conclude" ? "Forks concluídos" : "Forks mantidos")
        },
    })
}
