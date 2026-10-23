"use client"

import { useEffect } from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { TASKS_UPDATED_EVENT } from "@/features/tasks/constants"
import { AGENTIC_UPDATED_EVENT } from "../constants"
import type { DockerBuildersDto } from "../docker-builders"
import type { WorkbenchAction } from "../logic"
import type { AgenticSettings, CentralConfig, CreateCentralInput, FormReplyInput, PermissionReplyInput, WorkbenchModelInput } from "../schemas"
import type { AgenticSettingsDto, CentralDto, CentralTestOutcome, InProgressWorkbenchDto, PrWatchScheduleDto, QueueItemDto, WorkbenchDto, WorkbenchSummaryDto } from "../types"

/** Consultas e mutações do desenvolvimento agêntico. */

export const AGENTIC_QUERY_KEY = "agentic"
export const agenticKey = (...parts: unknown[]) => [AGENTIC_QUERY_KEY, ...parts] as const
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export const useAgenticSettings = () => useQuery({ queryKey: agenticKey("settings"), queryFn: () => get<AgenticSettingsDto>("/agentic/settings") })

export function useSaveAgenticSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: AgenticSettings) => unwrapApi((await api.put<ApiResponse<AgenticSettingsDto>>("/agentic/settings", input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(agenticKey("settings"), saved)
            toast.success("Configuração do desenvolvimento agêntico salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export const useCentrals = (enabled = true) => useQuery({ queryKey: agenticKey("centrals"), queryFn: () => get<CentralDto[]>("/agentic/centrals"), enabled })

export const useCentral = (id: string) => useQuery({ queryKey: agenticKey("central", id), queryFn: () => get<CentralDto>(`/agentic/centrals/${id}`) })

export function useCreateCentral() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateCentralInput) => unwrapApi((await api.post<ApiResponse<CentralDto>>("/agentic/centrals", input)).data),
        onSuccess: (central) => {
            void queryClient.invalidateQueries({ queryKey: agenticKey("centrals") })
            toast.success(`Central de ${central.projectName} criada`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a central")),
    })
}

export function useUpdateCentral(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (config: CentralConfig) => unwrapApi((await api.put<ApiResponse<CentralDto>>(`/agentic/centrals/${id}`, config)).data),
        onSuccess: (central) => {
            queryClient.setQueryData(agenticKey("central", id), central)
            void queryClient.invalidateQueries({ queryKey: agenticKey("centrals") })
            toast.success("Central salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a central")),
    })
}

export function useDeleteCentral() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ deleted: boolean }>>(`/agentic/centrals/${id}`)).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: agenticKey("centrals") })
            toast.success("Central excluída")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir a central")),
    })
}

/** Builders do Docker da máquina do OpenCode (aba Ambiente); só consulta de novo ao pedir. */
export const useDockerBuilders = (centralId: string) =>
    useQuery({ queryKey: agenticKey("docker-builders", centralId), queryFn: () => get<DockerBuildersDto>(`/agentic/centrals/${centralId}/docker-builders`), staleTime: 5 * 60_000, retry: false })

export function useTestCentral(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<CentralTestOutcome>>(`/agentic/centrals/${id}/test`)).data),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: agenticKey("central", id) })
            if (result.ok) toast.success(result.message)
            else toast.error(result.message)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível testar a central")),
    })
}

export const useCentralWorkbenches = (centralId: string | null) =>
    useQuery({ queryKey: agenticKey("workbenches", centralId), queryFn: () => get<WorkbenchSummaryDto[]>(`/agentic/centrals/${centralId}/workbenches`), enabled: Boolean(centralId) })

/** Fila da central: tarefas na coluna da fila ainda sem mesa, na ordem do kanban. */
export const useCentralQueue = (centralId: string | null) =>
    useQuery({ queryKey: agenticKey("queue", centralId), queryFn: () => get<QueueItemDto[]>(`/agentic/centrals/${centralId}/queue`), enabled: Boolean(centralId) })

/**
 * Mesas e fila de várias centrais ("Todos os projetos" na Central de desenvolvimento), juntadas numa
 * lista só. Usa as mesmas chaves de `useCentralWorkbenches`/`useCentralQueue` (cache e tempo real).
 */
export function useCentralsTaskState(centralIds: readonly string[]): { workbenches: WorkbenchSummaryDto[]; queue: QueueItemDto[] } {
    const workbenches = useQueries({
        queries: centralIds.map((id) => ({ queryKey: agenticKey("workbenches", id), queryFn: () => get<WorkbenchSummaryDto[]>(`/agentic/centrals/${id}/workbenches`) })),
        combine: flattenResults<WorkbenchSummaryDto>,
    })
    const queue = useQueries({
        queries: centralIds.map((id) => ({ queryKey: agenticKey("queue", id), queryFn: () => get<QueueItemDto[]>(`/agentic/centrals/${id}/queue`) })),
        combine: flattenResults<QueueItemDto>,
    })
    return { workbenches, queue }
}

// Fora do componente: com referência estável, o TanStack Query só recalcula o `combine` quando os dados mudam.
function flattenResults<T>(results: readonly { data?: T[] }[]): T[] {
    return results.flatMap((result) => result.data ?? [])
}

/** Mesas em andamento (executando ou aguardando ação humana) — lista "Trabalhos em andamento". */
export const useWorkbenchesInProgress = (enabled = true) =>
    useQuery({ queryKey: agenticKey("workbenches", "in-progress"), queryFn: () => get<InProgressWorkbenchDto[]>("/agentic/workbenches/in-progress"), enabled, staleTime: 15_000 })

/** Agendamento do acompanhamento do PR (contagem até a próxima verificação na mesa em PR aberto). */
export const usePrWatchSchedule = (enabled: boolean) =>
    useQuery({ queryKey: agenticKey("pr-watch"), queryFn: () => get<PrWatchScheduleDto>("/agentic/pr-watch"), enabled, refetchInterval: enabled ? 30_000 : false })

export const useWorkbenchByTask = (taskId: string | null) =>
    useQuery({ queryKey: agenticKey("workbench", taskId), queryFn: () => get<WorkbenchDto | null>(`/agentic/workbenches/by-task/${taskId}`), enabled: Boolean(taskId) })

function useSetWorkbench() {
    const queryClient = useQueryClient()
    return (workbench: WorkbenchDto) => {
        queryClient.setQueryData(agenticKey("workbench", workbench.taskId), workbench)
        void queryClient.invalidateQueries({ queryKey: agenticKey("workbenches", workbench.centralId) })
    }
}

export function useStartWorkbench() {
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async (input: { centralId: string; taskId: string; text?: string }) => unwrapApi((await api.post<ApiResponse<WorkbenchDto>>("/agentic/workbenches", input)).data),
        onSuccess: (workbench) => {
            setWorkbench(workbench)
            toast.success("Mesa aberta: o planejamento começou")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível abrir a mesa")),
    })
}

const ACTION_TOASTS: Partial<Record<WorkbenchAction, string>> = {
    "revise-plan": "Correção enviada ao planejador",
    implement: "Implementação iniciada",
    "request-correction": "Correção enviada ao planejador",
    approve: "Abrindo o Pull Request",
    "submit-pr-feedback": "Mudanças enviadas ao planejador",
    reopen: "Mesa reaberta",
    reconnect: "Reconectando à sessão do agente",
    interrupt: "Interrompendo o agente",
    "cancel-wait": "Espera por vaga cancelada",
}

/** Ações da mesa com resposta otimista (a mesa entra em "executando" na hora). */
export function useWorkbenchAction(workbench: WorkbenchDto | null | undefined) {
    const queryClient = useQueryClient()
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async ({ action, text }: { action: WorkbenchAction; text?: string }) =>
            unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench!.id}/actions/${action}`, text === undefined ? {} : { text })).data),
        onMutate: async ({ action }) => {
            // Reconectar e interromper não marcam "executando" otimista: quem decide é o estado remoto.
            if (!workbench || action === "interrupt" || action === "reconnect") return { previous: workbench }
            const key = agenticKey("workbench", workbench.taskId)
            await queryClient.cancelQueries({ queryKey: key })
            // Cancelar a espera só tira o aviso de vaga; as demais ações marcam "executando" (a resposta corrige se a mesa ficar aguardando vaga).
            queryClient.setQueryData<WorkbenchDto | null>(key, (current) => (current ? (action === "cancel-wait" ? { ...current, slotQueue: null } : { ...current, runState: "running", error: null }) : current))
            return { previous: workbench }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(agenticKey("workbench", context.previous.taskId), context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível executar a ação"))
        },
        onSuccess: (saved, { action }) => {
            setWorkbench(saved)
            if (saved.slotQueue && action !== "cancel-wait") {
                toast.info(`Limite de mesas da central atingido: aguardando vaga${saved.slotQueue.position ? ` (posição #${saved.slotQueue.position})` : ""}`)
                return
            }
            const message = ACTION_TOASTS[action]
            if (message) toast.success(message)
        },
    })
}

/** Troca o modelo de um papel da mesa (resposta otimista; reverte e avisa em caso de falha). */
/** Chave "Gerar prévia" da mesa (resposta otimista; reverte e avisa em caso de falha). */
export function useSetWorkbenchPreview(workbench: WorkbenchDto) {
    const queryClient = useQueryClient()
    const setWorkbench = useSetWorkbench()
    const key = agenticKey("workbench", workbench.taskId)
    return useMutation({
        mutationFn: async (enabled: boolean) => unwrapApi((await api.put<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench.id}/preview`, { enabled })).data),
        onMutate: async (enabled) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<WorkbenchDto | null>(key) ?? workbench
            queryClient.setQueryData<WorkbenchDto | null>(key, (current) => (current ? { ...current, agenticFlow: enabled ? "preview" : "auto_pr" } : current))
            return { previous }
        },
        onError: (error, _enabled, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível trocar a geração de prévia"))
        },
        onSuccess: (saved, enabled) => {
            setWorkbench(saved)
            toast.success(enabled ? "Geração de prévia ligada" : "Geração de prévia desligada: a mesa publica direto no PR")
        },
    })
}

export function useSetWorkbenchModel(workbench: WorkbenchDto) {
    const queryClient = useQueryClient()
    const setWorkbench = useSetWorkbench()
    const key = agenticKey("workbench", workbench.taskId)
    return useMutation({
        mutationFn: async (input: WorkbenchModelInput) => unwrapApi((await api.put<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench.id}/model`, input)).data),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<WorkbenchDto | null>(key) ?? workbench
            queryClient.setQueryData<WorkbenchDto | null>(key, (current) => {
                const models = (current ?? workbench).models
                if (!models) return current
                const choice = input.model ? { model: input.model, variant: input.variant, overridden: true } : { ...models[input.role], overridden: false }
                return { ...(current ?? workbench), models: { ...models, [input.role]: choice } }
            })
            return { previous }
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível trocar o modelo"))
        },
        onSuccess: (saved, input) => {
            setWorkbench(saved)
            toast.success(input.model ? "Modelo trocado: vale a partir do próximo turno" : "Modelo de volta ao padrão: vale a partir do próximo turno")
        },
    })
}

export function useReplyPermission(workbench: WorkbenchDto) {
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async ({ requestId, ...input }: PermissionReplyInput & { requestId: string }) =>
            unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench.id}/permissions/${encodeURIComponent(requestId)}`, input)).data),
        onSuccess: setWorkbench,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível responder ao pedido")),
    })
}

export function useReplyForm(workbench: WorkbenchDto) {
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async ({ formId, ...input }: FormReplyInput & { formId: string }) =>
            unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbench.id}/forms/${encodeURIComponent(formId)}`, input)).data),
        onSuccess: setWorkbench,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar a resposta")),
    })
}

export function useDeleteWorkbench() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (workbench: WorkbenchDto) => {
            const result = unwrapApi((await api.delete<ApiResponse<{ deleted: boolean }>>(`/agentic/workbenches/${workbench.id}`)).data)
            return { workbench, deleted: result.deleted }
        },
        onSuccess: ({ workbench, deleted }) => {
            if (deleted) {
                queryClient.setQueryData(agenticKey("workbench", workbench.taskId), null)
                void queryClient.invalidateQueries({ queryKey: agenticKey("workbenches", workbench.centralId) })
                toast.success("Mesa excluída")
                return
            }
            // A mesa ainda vai sair: o ambiente é limpo antes de o registro ser apagado.
            void queryClient.invalidateQueries({ queryKey: [AGENTIC_QUERY_KEY] })
            toast.info("Excluindo a mesa: o ambiente é limpo antes de remover o registro")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir a mesa")),
    })
}

/**
 * Reconectar à sessão do agente (mesa). Sem toast próprio: as tentativas automáticas do ciclo de
 * reconexão são silenciosas (o feedback fica no indicador "Reconectando…" do botão compartilhado).
 */
export function useWorkbenchReconnect(workbenchId: string) {
    const setWorkbench = useSetWorkbench()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<WorkbenchDto>>(`/agentic/workbenches/${workbenchId}/actions/reconnect`)).data),
        onSuccess: setWorkbench,
    })
}

/** Mesas em andamento mudaram no servidor: recarrega só a lista de trabalhos em andamento. */
export function useWorkbenchProgressRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: agenticKey("workbenches", "in-progress") })
        channel.bind(AGENTIC_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(AGENTIC_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

/** Centrais, mesas ou configuração alteradas no servidor: recarrega. */
export function useAgenticRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: [AGENTIC_QUERY_KEY] })
        // A fila muda quando tarefas mudam de coluna (mesmo sem abrir mesa): recarrega só a fila.
        const queueHandler = () => void queryClient.invalidateQueries({ queryKey: agenticKey("queue") })
        channel.bind(AGENTIC_UPDATED_EVENT, handler)
        channel.bind(TASKS_UPDATED_EVENT, queueHandler)
        return () => {
            channel.unbind(AGENTIC_UPDATED_EVENT, handler)
            channel.unbind(TASKS_UPDATED_EVENT, queueHandler)
            releaseChannel(name)
        }
    }, [queryClient])
}
