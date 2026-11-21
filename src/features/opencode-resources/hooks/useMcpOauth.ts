"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { McpOauthCompleteInput } from "../schemas"
import type { McpOauthAttemptDto, McpOauthStatusDto } from "../types"
import { OPENCODE_RESOURCES_KEY } from "./useOpencodeResources"

/** OAuth dos MCPs remotos do OpenCode (OPE-176): Autorizar, acompanhar, concluir e desconectar. */

const BASE = "/ai/providers/opencode/resources/mcp"
const seg = encodeURIComponent
export const MCP_OAUTH_POLL_MS = 2000

function useInvalidateMcps() {
    const queryClient = useQueryClient()
    return () => void queryClient.invalidateQueries({ queryKey: [...OPENCODE_RESOURCES_KEY, "list", "mcp"] })
}

export function useStartMcpOauth() {
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.post<ApiResponse<McpOauthAttemptDto>>(`${BASE}/${seg(id)}/oauth`)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar a autorização no OpenCode")),
    })
}

/** Situação da tentativa (consulta enquanto pendente); ao concluir, relê a lista de MCPs. */
export function useMcpOauthStatus(id: string | null, attemptId: string | null) {
    const invalidate = useInvalidateMcps()
    const query = useQuery({
        queryKey: ["ai", "opencode-mcp-oauth", id, attemptId],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<McpOauthStatusDto>>(`${BASE}/${seg(id ?? "")}/oauth/${seg(attemptId ?? "")}`)).data),
        enabled: Boolean(id && attemptId),
        refetchInterval: (current) => (current.state.data && current.state.data.status !== "pending" ? false : MCP_OAUTH_POLL_MS),
        retry: false,
        gcTime: 0,
    })
    const status = query.data?.status
    useEffect(() => {
        if (status === "complete") invalidate()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só à mudança de status
    }, [status])
    return query
}

export function useCompleteMcpOauth() {
    const invalidate = useInvalidateMcps()
    return useMutation({
        mutationFn: async ({ id, attemptId, input }: { id: string; attemptId: string; input: McpOauthCompleteInput }) =>
            unwrapApi((await api.post<ApiResponse<McpOauthStatusDto>>(`${BASE}/${seg(id)}/oauth/${seg(attemptId)}/complete`, input, { timeout: 0 })).data),
        onSuccess: (result) => {
            if (result.status === "complete") invalidate()
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a autorização")),
    })
}

export function useCancelMcpOauth() {
    return useMutation({
        mutationFn: async ({ id, attemptId }: { id: string; attemptId: string }) => unwrapApi((await api.delete<ApiResponse<{ cancelled: true }>>(`${BASE}/${seg(id)}/oauth/${seg(attemptId)}`)).data),
    })
}

export function useDisconnectMcpOauth() {
    const invalidate = useInvalidateMcps()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ removed: number }>>(`${BASE}/${seg(id)}/oauth`)).data),
        onSuccess: () => toast.success("Autorização removida do OpenCode"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível desconectar")),
        onSettled: invalidate,
    })
}
