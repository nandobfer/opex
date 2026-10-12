"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ORCAMENTOS_UPDATED_EVENT } from "../constants"
import type { ClienteOrcamentoInput, ClienteUserInput } from "../schemas"
import type { ClienteOrcamentoDto, ClienteUserDto, CreatedClienteOrcamentoDto, CreatedClienteUserDto } from "../types"

/** Consultas e mutações dos clientes do portal de Orçamentos. */

export const ORCAMENTOS_QUERY_KEY = "orcamentos"
export const orcamentoClientsKey = [ORCAMENTOS_QUERY_KEY, "clients"] as const

export function useOrcamentoClients() {
    return useQuery({
        queryKey: orcamentoClientsKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteOrcamentoDto[]>>("/integrations/orcamentos/clients")).data),
    })
}

export function useCreateCliente() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ClienteOrcamentoInput) => unwrapApi((await api.post<ApiResponse<CreatedClienteOrcamentoDto>>("/integrations/orcamentos/clients", input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar o cliente")),
        onSuccess: (created) => {
            void queryClient.invalidateQueries({ queryKey: orcamentoClientsKey })
            toast.success(`Cliente ${created.item.name} criado`)
        },
    })
}

export function useUpdateCliente() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: ClienteOrcamentoInput }) =>
            unwrapApi((await api.patch<ApiResponse<ClienteOrcamentoDto>>(`/integrations/orcamentos/clients/${id}`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o cliente")),
        onSuccess: (item) => {
            void queryClient.invalidateQueries({ queryKey: orcamentoClientsKey })
            toast.success(`Cliente ${item.name} salvo`)
        },
    })
}

export function useDeleteCliente() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (client: ClienteOrcamentoDto) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/integrations/orcamentos/clients/${client.id}`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o cliente")),
        onSuccess: (_data, client) => {
            void queryClient.invalidateQueries({ queryKey: orcamentoClientsKey })
            toast.success(`Cliente ${client.name} excluído`)
        },
    })
}

export function useRegenerateClienteToken() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<CreatedClienteOrcamentoDto>>(`/integrations/orcamentos/clients/${id}/token`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar um novo token")),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: orcamentoClientsKey })
            toast.success("Novo token gerado: o anterior deixou de funcionar")
        },
    })
}

/** Clientes alterados em outra aba/janela: recarrega a lista. */
export function useOrcamentosRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: orcamentoClientsKey })
        channel.bind(ORCAMENTOS_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ORCAMENTOS_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}

// ── Configuração de um cliente (dono) ──────────────────────────────────────

export const orcamentoClientKey = (id: string) => [ORCAMENTOS_QUERY_KEY, "client", id] as const
export const orcamentoUsersKey = (clientId: string) => [ORCAMENTOS_QUERY_KEY, "users", clientId] as const

/** Detalhe de um cliente (página de configuração). */
export function useOrcamentoClient(id: string) {
    return useQuery({
        queryKey: orcamentoClientKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteOrcamentoDto>>(`/integrations/orcamentos/clients/${id}`)).data),
    })
}

/** Usuários de um cliente (gestão do dono). */
export function useClienteUsers(clientId: string) {
    return useQuery({
        queryKey: orcamentoUsersKey(clientId),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<ClienteUserDto[]>>(`/integrations/orcamentos/clients/${clientId}/users`)).data),
    })
}

const invalidateUsers = (queryClient: ReturnType<typeof useQueryClient>, clientId: string) => void queryClient.invalidateQueries({ queryKey: orcamentoUsersKey(clientId) })

export function useCreateClienteUser(clientId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: ClienteUserInput) => unwrapApi((await api.post<ApiResponse<CreatedClienteUserDto>>(`/integrations/orcamentos/clients/${clientId}/users`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar o usuário")),
        onSuccess: (created) => {
            invalidateUsers(queryClient, clientId)
            toast.success(`Usuário ${created.item.username} criado`)
        },
    })
}

export function useUpdateClienteUser(clientId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: ClienteUserInput }) => unwrapApi((await api.patch<ApiResponse<ClienteUserDto>>(`/integrations/orcamentos/clients/${clientId}/users/${id}`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o usuário")),
        onSuccess: (item) => {
            invalidateUsers(queryClient, clientId)
            toast.success(`Usuário ${item.username} salvo`)
        },
    })
}

export function useDeleteClienteUser(clientId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (user: ClienteUserDto) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/integrations/orcamentos/clients/${clientId}/users/${user.id}`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o usuário")),
        onSuccess: (_data, user) => {
            invalidateUsers(queryClient, clientId)
            toast.success(`Usuário ${user.username} removido`)
        },
    })
}

export function useRegenerateClienteUserToken(clientId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<CreatedClienteUserDto>>(`/integrations/orcamentos/clients/${clientId}/users/${id}/token`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar um novo token")),
        onSuccess: () => {
            invalidateUsers(queryClient, clientId)
            toast.success("Novo token gerado: o anterior deixou de funcionar")
        },
    })
}
