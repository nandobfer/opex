"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel, integrationChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { AiAgentId } from "../agents"
import { AI_MEMORIES_UPDATED_EVENT } from "../constants"
import { memoryListBasePath } from "../memory-notice"
import type { MemoriesMetaDto } from "../types"

/**
 * Chave do cache e rota base (sem `/api`) de uma lista. Desde a OPE-148 as telas mostram o universo do agente
 * pela lib (`AgentUniverseCard`); as chaves continuam como o alvo da invalidação de `useMemoriesRealtime`.
 */
export interface MemorySource {
    queryKey: QueryKey
    basePath: string
    enabled?: boolean
}

/** Memórias de uma lista do catálogo `agents.ts`. */
export const agentMemoriesSource = (agentId: AiAgentId, enabled = true): MemorySource => ({ queryKey: ["ai", "memories", agentId], basePath: memoryListBasePath(agentId), enabled })

/** Memórias do agente desenvolvedor de uma central (`developer-central`). */
export const centralMemoriesSource = (centralId: string, enabled = true): MemorySource => ({ queryKey: ["ai", "memories", "developer-central", centralId], basePath: memoryListBasePath("developer-central", { centralId }), enabled })

/** Memórias de um cliente específico (`*-client-specific`). */
export const clientMemoriesSource = (agentId: AiAgentId, clientId: string, enabled = true): MemorySource => ({ queryKey: ["ai", "memories", agentId, clientId], basePath: memoryListBasePath(agentId, { clientId }), enabled })

export const MEMORIES_META_KEY: QueryKey = ["ai", "memories-meta"]

/** Limites e categorias do Engramind, migração pendente e saúde do contexto. */
export function useMemoriesMeta() {
    return useQuery({ queryKey: MEMORIES_META_KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<MemoriesMetaDto>>("/ai/memories/meta")).data), staleTime: 30_000 })
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
        const handler = (payload: { agentId?: string; centralId?: string; clientId?: string; routineSlug?: string }) => {
            const scope = payload?.centralId ?? payload?.clientId ?? payload?.routineSlug
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
