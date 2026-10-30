"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { OPEX_MCP_EVENT, type OpexMcpServerDto, type OpexMcpServerInput, type OpexMcpTestInput, type OpexMcpTestResultDto } from "../mcp"

/** MCPs do Agente Opex (seção MCPs e aba do cliente). */

export const opexMcpServersKey = ["opex-mcp-servers"] as const

export const useOpexMcpServers = () =>
    useQuery({
        queryKey: opexMcpServersKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexMcpServerDto[]>>("/opex/mcp-servers")).data),
        staleTime: 30_000,
    })

/** Qualquer mudança num MCP (tela, agente ou turno com falha de conexão) relê a lista. */
export function useOpexMcpRealtime(enabled = true): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: opexMcpServersKey })
        channel.bind(OPEX_MCP_EVENT, handler)
        return () => {
            channel.unbind(OPEX_MCP_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}

/** Cadastrar (sem `id`) ou editar (com `id`). */
export function useSaveOpexMcpServer() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string | null; input: OpexMcpServerInput }) =>
            unwrapApi((id ? await api.put<ApiResponse<OpexMcpServerDto>>(`/opex/mcp-servers/${id}`, input) : await api.post<ApiResponse<OpexMcpServerDto>>("/opex/mcp-servers", input)).data),
        onSuccess: (saved, { id }) => {
            queryClient.setQueryData<OpexMcpServerDto[]>(opexMcpServersKey, (list) => {
                if (!list) return [saved]
                return id ? list.map((item) => (item.id === saved.id ? saved : item)) : [...list, saved].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
            })
            toast.success(id ? "MCP salvo" : "MCP cadastrado")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o MCP")),
    })
}

/** Habilitar/desabilitar com resposta otimista e reversão em falha. */
export function useToggleOpexMcpServer() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => unwrapApi((await api.patch<ApiResponse<OpexMcpServerDto>>(`/opex/mcp-servers/${id}`, { enabled })).data),
        onMutate: async ({ id, enabled }) => {
            await queryClient.cancelQueries({ queryKey: opexMcpServersKey })
            const previous = queryClient.getQueryData<OpexMcpServerDto[]>(opexMcpServersKey)
            queryClient.setQueryData<OpexMcpServerDto[]>(opexMcpServersKey, (list) => list?.map((item) => (item.id === id ? { ...item, enabled } : item)))
            return { previous }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(opexMcpServersKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível alterar o MCP"))
        },
        onSuccess: (saved) => {
            queryClient.setQueryData<OpexMcpServerDto[]>(opexMcpServersKey, (list) => list?.map((item) => (item.id === saved.id ? saved : item)))
            toast.success(saved.enabled ? "MCP habilitado" : "MCP desabilitado")
        },
    })
}

export function useDeleteOpexMcpServer() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ deleted: true }>>(`/opex/mcp-servers/${id}`)).data),
        onSuccess: (_result, id) => {
            queryClient.setQueryData<OpexMcpServerDto[]>(opexMcpServersKey, (list) => list?.filter((item) => item.id !== id))
            toast.success("MCP excluído")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o MCP")),
    })
}

/** "Testar conexão" do rascunho (não grava nada). */
export function useTestOpexMcpServer() {
    return useMutation({
        mutationFn: async (input: OpexMcpTestInput) => unwrapApi((await api.post<ApiResponse<OpexMcpTestResultDto>>("/opex/mcp-servers/test", input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível testar o MCP")),
    })
}
