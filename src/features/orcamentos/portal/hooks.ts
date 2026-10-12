"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { clientChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { TaskPriority } from "@/features/tasks/constants"
import type { TaskDto } from "@/features/tasks/types"
import { CLIENTE_TASKS_UPDATED_EVENT } from "../constants"
import type { ClienteDraftInput, ClienteUserInput } from "../schemas"
import type { ClienteDashboardDto, ClienteFinanceDto, ClientePortalOptionsDto, ClienteTaskDetailDto, ClienteTaskDto, ClienteTaskListDto, ClienteUserDto, CreatedClienteUserDto, OrcamentoDraftDto } from "../types"
import { useClientePortal } from "./ClientePortalContext"

/** Consultas e mutações do portal do cliente (axios autenticado pelo token). */

export const CLIENTE_QUERY_KEY = "cliente"
const optionsKey = [CLIENTE_QUERY_KEY, "options"] as const
const tasksKey = (includeArchived: boolean) => [CLIENTE_QUERY_KEY, "tasks", { includeArchived }] as const
const taskKey = (id: string) => [CLIENTE_QUERY_KEY, "task", id] as const
const draftKey = (id: string) => [CLIENTE_QUERY_KEY, "draft", id] as const

export function useClienteOptions() {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: optionsKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClientePortalOptionsDto>>("/cliente/options")).data),
        staleTime: 5 * 60_000,
    })
}

export function useClienteTasks(includeArchived: boolean) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: tasksKey(includeArchived),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteTaskListDto>>("/cliente/tasks", { params: includeArchived ? { includeArchived: true } : {} })).data),
        staleTime: 15_000,
    })
}

/** Detalhe da tarefa na visão do cliente (só as que ele solicitou). */
export function useClienteTask(id: string) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: taskKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteTaskDetailDto>>(`/cliente/tasks/${id}`)).data),
    })
}

/** Comentário do cliente numa tarefa do portal. */
export function useAddClienteComment(taskId: string) {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (content: string) => unwrapApi((await api.post<ApiResponse<{ id: string }>>(`/cliente/tasks/${taskId}/comments`, { content })).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível comentar")),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: taskKey(taskId) }),
    })
}

interface SetClientePriorityVariables {
    task: Pick<ClienteTaskDto, "id" | "code">
    priority: TaskPriority
}

type PrioritySnapshot = [QueryKey, unknown][]

/**
 * Edita a prioridade de uma tarefa do cliente (`PATCH /cliente/tasks/[id]`), com resposta otimista:
 * a lista e o detalhe mudam na hora e revertem se o servidor recusar.
 */
export function useSetClienteTaskPriority() {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation<unknown, unknown, SetClientePriorityVariables, PrioritySnapshot>({
        mutationFn: async ({ task, priority }) => unwrapApi((await api.patch<ApiResponse<{ id: string }>>(`/cliente/tasks/${task.id}`, { priority })).data),
        onMutate: async ({ task, priority }) => {
            await queryClient.cancelQueries({ queryKey: [CLIENTE_QUERY_KEY] })
            const snapshot: PrioritySnapshot = [...queryClient.getQueriesData({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] }), ...queryClient.getQueriesData({ queryKey: taskKey(task.id) })]
            const patch = <T extends { id: string; priority: TaskPriority }>(item: T): T => (item.id === task.id ? { ...item, priority } : item)
            queryClient.setQueriesData<ClienteTaskListDto>({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] }, (data) => (data ? { ...data, tasks: data.tasks.map(patch) } : data))
            queryClient.setQueryData<ClienteTaskDetailDto>(taskKey(task.id), (data) => (data ? patch(data) : data))
            return snapshot
        },
        onError: (error, _variables, snapshot) => {
            for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível atualizar a prioridade"))
        },
        onSuccess: (_data, { task }) => toast.success(`Prioridade de ${task.code} atualizada`),
        onSettled: (_data, _error, { task }) => {
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] })
            void queryClient.invalidateQueries({ queryKey: taskKey(task.id) })
        },
    })
}

export function useClienteDraft(id: string) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: draftKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OrcamentoDraftDto>>(`/cliente/drafts/${id}`)).data),
    })
}

export function useCreateDraft() {
    const { api } = useClientePortal()
    return useMutation({
        mutationFn: async (input: ClienteDraftInput) => unwrapApi((await api.post<ApiResponse<OrcamentoDraftDto>>("/cliente/drafts", input)).data),
    })
}

export function useSetCorrection(id: string) {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (correction: string) => unwrapApi((await api.post<ApiResponse<OrcamentoDraftDto>>(`/cliente/drafts/${id}/correction`, { correction })).data),
        onSuccess: (draft) => queryClient.setQueryData(draftKey(id), draft),
    })
}

export function useApproveDraft(id: string) {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (priority?: TaskPriority) => unwrapApi((await api.post<ApiResponse<TaskDto>>(`/cliente/drafts/${id}/approve`, priority ? { priority } : {})).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] })
            void queryClient.invalidateQueries({ queryKey: draftKey(id) })
        },
    })
}

/**
 * Tempo real do portal: assina o canal privado do cliente (`private-client-{clientId}`) e invalida as
 * tarefas quando o dono (ou a sincronização do GitHub) muda algo. Nunca publica eventos.
 */
export function useClienteRealtime(): void {
    const { clientId } = useClientePortal()
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = clientChannel(clientId)
        const channel = acquireChannel(name)
        const handler = () => {
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "tasks"] })
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "task"] })
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "dashboard"] })
            void queryClient.invalidateQueries({ queryKey: [CLIENTE_QUERY_KEY, "finance"] })
        }
        channel.bind(CLIENTE_TASKS_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(CLIENTE_TASKS_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [clientId, queryClient])
}

const dashboardKey = (query: { from: string; to: string; timeZone: string }) => [CLIENTE_QUERY_KEY, "dashboard", query] as const
const financeKey = (query: { from: string; to: string; projectIds: readonly string[] }) => [CLIENTE_QUERY_KEY, "finance", { from: query.from, to: query.to, projectIds: [...query.projectIds].sort() }] as const
const usersKey = [CLIENTE_QUERY_KEY, "users"] as const

/**
 * Dashboard do cliente: distribuições de tarefas do período e (admin) o resumo de custo. O fuso do
 * navegador entra na consulta para o servidor agrupar a série criadas × concluídas.
 */
export function useClienteDashboard(query: { from: string; to: string; timeZone: string }, enabled: boolean) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: dashboardKey(query),
        enabled,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteDashboardDto>>("/cliente/dashboard", { params: { from: query.from, to: query.to, timeZone: query.timeZone } })).data),
        staleTime: 30_000,
    })
}

/** Custo das tarefas concluídas do cliente (admin): período (ISO) e repositórios selecionados. */
export function useClienteFinance(query: { from: string; to: string; projectIds: readonly string[] }) {
    const { api } = useClientePortal()
    return useQuery({
        queryKey: financeKey(query),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteFinanceDto>>("/cliente/financeiro", { params: { from: query.from || undefined, to: query.to || undefined, ...(query.projectIds.length ? { projectIds: query.projectIds.join(",") } : {}) } })).data),
        staleTime: 30_000,
    })
}

/** Usuários do cliente (admin do cliente). */
export function useClienteUsers() {
    const { api } = useClientePortal()
    return useQuery({ queryKey: usersKey, queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteUserDto[]>>("/cliente/usuarios")).data) })
}

function invalidateUsers(queryClient: ReturnType<typeof useQueryClient>) {
    void queryClient.invalidateQueries({ queryKey: usersKey })
}

export function useCreateClienteUser() {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ClienteUserInput) => unwrapApi((await api.post<ApiResponse<CreatedClienteUserDto>>("/cliente/usuarios", input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar o usuário")),
        onSuccess: (created) => {
            invalidateUsers(queryClient)
            toast.success(`Usuário ${created.item.username} criado`)
        },
    })
}

export function useUpdateClienteUser() {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: ClienteUserInput }) => unwrapApi((await api.patch<ApiResponse<ClienteUserDto>>(`/cliente/usuarios/${id}`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o usuário")),
        onSuccess: (item) => {
            invalidateUsers(queryClient)
            toast.success(`Usuário ${item.username} salvo`)
        },
    })
}

export function useDeleteClienteUser() {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (user: ClienteUserDto) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/cliente/usuarios/${user.id}`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o usuário")),
        onSuccess: (_data, user) => {
            invalidateUsers(queryClient)
            toast.success(`Usuário ${user.username} removido`)
        },
    })
}

export function useRegenerateClienteUserToken() {
    const { api } = useClientePortal()
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<CreatedClienteUserDto>>(`/cliente/usuarios/${id}/token`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar um novo token")),
        onSuccess: () => {
            invalidateUsers(queryClient)
            toast.success("Novo token gerado: o anterior deixou de funcionar")
        },
    })
}
