"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel, integrationChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { AiAgentId } from "../agents"
import { AI_MEMORIES_UPDATED_EVENT } from "../constants"
import { PENDING_PREFIX, optimisticMemories, sortMemories, type MemoryAction } from "../memory-list"
import type { MemoriesMetaDto, MemoryDto, MemoryMutationResult } from "../types"

export { PENDING_PREFIX, type MemoryAction } from "../memory-list"

/** Origem das memórias de uma lista: chave do cache e rota base (sem `/api`). */
export interface MemorySource {
    queryKey: QueryKey
    basePath: string
    enabled?: boolean
}

/** Memórias de uma lista do catálogo `agents.ts`. */
export const agentMemoriesSource = (agentId: AiAgentId, enabled = true): MemorySource => ({ queryKey: ["ai", "memories", agentId], basePath: `/ai/agents/${agentId}/memories`, enabled })

/** Memórias do agente desenvolvedor de uma central (`developer-central`). */
export const centralMemoriesSource = (centralId: string, enabled = true): MemorySource => ({ queryKey: ["ai", "memories", "developer-central", centralId], basePath: `/agentic/centrals/${centralId}/memories`, enabled })

/** Memórias de um cliente específico (`*-client-specific`). */
export const clientMemoriesSource = (agentId: AiAgentId, clientId: string, enabled = true): MemorySource => ({ queryKey: ["ai", "memories", agentId, clientId], basePath: `/ai/agents/${agentId}/clients/${clientId}/memories`, enabled })

export const MEMORIES_META_KEY: QueryKey = ["ai", "memories-meta"]

/** Limites e categorias do Engramind, migração pendente e saúde do contexto. */
export function useMemoriesMeta() {
    return useQuery({ queryKey: MEMORIES_META_KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<MemoriesMetaDto>>("/ai/memories/meta")).data), staleTime: 30_000 })
}

async function send(source: MemorySource, action: MemoryAction): Promise<MemoryMutationResult | null> {
    switch (action.type) {
        case "create":
            return unwrapApi((await api.post<ApiResponse<MemoryMutationResult>>(source.basePath, { texto: action.texto, categoria: action.categoria })).data)
        case "update":
            return unwrapApi((await api.patch<ApiResponse<MemoryMutationResult>>(`${source.basePath}/${action.id}`, { texto: action.texto, categoria: action.categoria, versao: action.versao })).data)
        case "pin":
            return unwrapApi((await api.patch<ApiResponse<MemoryMutationResult>>(`${source.basePath}/${action.id}`, { fixada: action.fixada })).data)
        case "active":
            return unwrapApi((await api.patch<ApiResponse<MemoryMutationResult>>(`${source.basePath}/${action.id}`, { ativa: action.ativa })).data)
        case "delete":
            await api.delete(`${source.basePath}/${action.id}`)
            return null
    }
}

const SUCCESS: Record<MemoryAction["type"], (action: MemoryAction) => string> = {
    create: () => "Memória adicionada",
    update: () => "Memória atualizada",
    pin: (action) => (action.type === "pin" && action.fixada ? "Memória fixada" : "Memória desafixada"),
    active: (action) => (action.type === "active" && action.ativa ? "Memória ativada" : "Memória inativada"),
    delete: () => "Memória excluída",
}

/**
 * Lista de memórias (Engramind) com criar, editar, fixar, ativar/inativar e excluir otimistas: a
 * linha muda na hora e, ao responder, mostra o que o Engramind gravou. Falha → volta ao estado
 * anterior com toast (conflito de versão: "Esta memória mudou enquanto você editava…" e a lista relê).
 */
export function useMemories(source: MemorySource) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: source.queryKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MemoryDto[]>>(source.basePath)).data),
        enabled: source.enabled !== false,
    })
    const mutation = useMutation({
        mutationFn: (action: MemoryAction) => send(source, action),
        onMutate: async (action) => {
            await queryClient.cancelQueries({ queryKey: source.queryKey })
            const previous = queryClient.getQueryData<MemoryDto[]>(source.queryKey)
            if (previous) queryClient.setQueryData<MemoryDto[]>(source.queryKey, optimisticMemories(previous, action))
            return { previous }
        },
        onError: (error, _action, context) => {
            if (context?.previous) queryClient.setQueryData(source.queryKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar a memória"))
        },
        onSuccess: (result, action) => {
            if (result) {
                queryClient.setQueryData<MemoryDto[]>(source.queryKey, (current) => {
                    const list = (current ?? []).filter((item) => !item.id.startsWith(PENDING_PREFIX) || action.type !== "create")
                    const others = list.filter((item) => item.id !== result.memoria.id)
                    return sortMemories([...others, result.memoria])
                })
            }
            if (result?.duplicada) toast.info("Já existe uma memória igual nesta lista: nada foi gravado.")
            else toast.success(SUCCESS[action.type](action))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: source.queryKey }),
    })
    return { query, memories: query.data ?? [], mutate: mutation.mutate, pending: mutation.isPending }
}

/** Memórias alteradas em outra aba, pelo Agente Opex, por um agente sozinho ou no Engramind: só invalida e relê. */
export function useMemoriesRealtime(enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = integrationChannel("ai")
        const app = appChannel()
        const channel = acquireChannel(name)
        const appEvents = acquireChannel(app)
        const handler = (payload: { agentId?: string; centralId?: string; clientId?: string }) => {
            const scope = payload?.centralId ?? payload?.clientId
            const queryKey = payload?.agentId ? ["ai", "memories", payload.agentId, ...(scope ? [scope] : [])] : ["ai", "memories"]
            void queryClient.invalidateQueries({ queryKey })
        }
        // Migração concluída, contexto indisponível/recuperado ou configurações do Engramind: relê os avisos e limites.
        const metaHandler = (payload: { type?: string }) => {
            const type = payload?.type ?? ""
            if (type === "migration.updated" || type === "memories.context" || type === "settings.updated") void queryClient.invalidateQueries({ queryKey: MEMORIES_META_KEY })
        }
        channel.bind(AI_MEMORIES_UPDATED_EVENT, handler)
        appEvents.bind("engramind-updated", metaHandler)
        return () => {
            channel.unbind(AI_MEMORIES_UPDATED_EVENT, handler)
            appEvents.unbind("engramind-updated", metaHandler)
            releaseChannel(name)
            releaseChannel(app)
        }
    }, [enabled, queryClient])
}
