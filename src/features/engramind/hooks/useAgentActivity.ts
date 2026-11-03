"use client"

import { useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel, integrationChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { MemoryIdentity } from "@/features/ai/agents"
import { AI_MEMORIES_UPDATED_EVENT } from "@/features/ai/constants"
import type { AgentActivityDto } from "../agent-activity"
import { ENGRAMIND_CONSUMPTION_EVENT, ENGRAMIND_UPDATED_EVENT } from "../constants"
import { areaKey } from "./useEngramind"

/** Adoção por agente (OPE-117): `GET /api/engramind/agent-activity`. */
export const AGENT_ACTIVITY_KEY = areaKey("agent-activity")
const REFRESH_DELAY_MS = 3_000

export function useAgentActivity(enabled = true) {
    const query = useQuery({
        queryKey: AGENT_ACTIVITY_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<AgentActivityDto[]>>("/engramind/agent-activity")).data),
        enabled,
        staleTime: 30_000,
    })
    const byAgent = useMemo(() => new Map<MemoryIdentity, AgentActivityDto>((query.data ?? []).map((row) => [row.agent, row])), [query.data])
    return { query, byAgent }
}

/**
 * Tempo real da adoção: memória gravada (`ai-memories-updated`, `engramind-updated` `memory.*`), saúde do
 * contexto e consumo (`engramind-consumption`, com atraso para juntar o lote) invalidam o cache.
 */
export function useAgentActivityRealtime(enabled = true): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const app = appChannel()
        const ai = integrationChannel("ai")
        const appEvents = acquireChannel(app)
        const aiEvents = acquireChannel(ai)
        let timer: ReturnType<typeof setTimeout> | null = null
        const invalidate = () => void queryClient.invalidateQueries({ queryKey: AGENT_ACTIVITY_KEY })
        const later = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(invalidate, REFRESH_DELAY_MS)
        }
        const onUpdated = (payload: { type?: string }) => {
            const type = payload?.type ?? ""
            if (type.startsWith("memory.") || type === "memories.context") invalidate()
        }
        appEvents.bind(ENGRAMIND_UPDATED_EVENT, onUpdated)
        appEvents.bind(ENGRAMIND_CONSUMPTION_EVENT, later)
        aiEvents.bind(AI_MEMORIES_UPDATED_EVENT, invalidate)
        return () => {
            if (timer) clearTimeout(timer)
            appEvents.unbind(ENGRAMIND_UPDATED_EVENT, onUpdated)
            appEvents.unbind(ENGRAMIND_CONSUMPTION_EVENT, later)
            aiEvents.unbind(AI_MEMORIES_UPDATED_EVENT, invalidate)
            releaseChannel(app)
            releaseChannel(ai)
        }
    }, [enabled, queryClient])
}
