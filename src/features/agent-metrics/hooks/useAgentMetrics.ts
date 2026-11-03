"use client"

import { useEffect } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { AI_CONSUMPTION_UPDATED_EVENT } from "@/lib/ai/consumption-events"
import { AGENTIC_UPDATED_EVENT } from "@/features/agentic/constants"
import { ADVERSARIAL_UPDATED_EVENT } from "@/features/adversarial-agent/constants"
import { MENTOR_UPDATED_EVENT } from "@/features/adversarial-agent/mentor/constants"
import { ARCHITECT_UPDATED_EVENT } from "@/features/architect-agent/constants"
import { MADDOX_SESSION_DELETED_EVENT, MADDOX_SESSION_UPDATED_EVENT, OPEX_SESSION_DELETED_EVENT, OPEX_SESSION_UPDATED_EVENT } from "@/features/opex-agent/constants"
import { ORCAMENTOS_UPDATED_EVENT } from "@/features/orcamentos/constants"
import { PR_REVIEW_UPDATED_EVENT } from "@/features/pr-review/constants"
import { REFINEMENT_UPDATED_EVENT } from "@/features/refinement/constants"
import { TASKS_UPDATED_EVENT } from "@/features/tasks/constants"
import type { AgentId } from "../catalog"
import { AGENT_METRICS_UPDATED_EVENT } from "../constants"
import type { AgentHistoryPageDto, AgentMetricsDto } from "../types"
import type { OpexSessionDetailDto } from "@/features/opex-agent/types"

export const AGENT_METRICS_QUERY_KEY = "agent-metrics"

export function useAgentMetrics(agent: AgentId, params: Record<string, string>, enabled = true) {
    return useQuery({
        enabled,
        queryKey: [AGENT_METRICS_QUERY_KEY, agent, "overview", params],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<AgentMetricsDto>>(`/agents/${agent}/metrics`, { params })).data),
        placeholderData: (previous) => previous,
    })
}

export function useAgentHistoryPages(agent: AgentId, params: Record<string, string>, enabled = true) {
    return useInfiniteQuery({
        queryKey: [AGENT_METRICS_QUERY_KEY, agent, "history", params],
        queryFn: async ({ pageParam }) => unwrapApi((await api.get<ApiResponse<AgentHistoryPageDto>>(`/agents/${agent}/history`, { params: { ...params, page: String(pageParam), limit: "20" } })).data),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
        enabled,
    })
}

export function useAgentConversation(id: string) {
    return useQuery({
        queryKey: [AGENT_METRICS_QUERY_KEY, "conversation", id],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexSessionDetailDto & { clientId: string | null }>>(`/agents/conversations/${id}`)).data),
    })
}

/** Eventos Pusher que já existem e mudam os dados de cada agente (além de `agent-metrics-updated`). */
export const AGENT_REALTIME_EVENTS: Record<AgentId, readonly string[]> = {
    opex: [OPEX_SESSION_UPDATED_EVENT, OPEX_SESSION_DELETED_EVENT],
    maddox: [MADDOX_SESSION_UPDATED_EVENT, MADDOX_SESSION_DELETED_EVENT],
    orcamentista: [ORCAMENTOS_UPDATED_EVENT, TASKS_UPDATED_EVENT, AI_CONSUMPTION_UPDATED_EVENT],
    catalogador: [TASKS_UPDATED_EVENT, AI_CONSUMPTION_UPDATED_EVENT],
    refinador: [REFINEMENT_UPDATED_EVENT],
    desenvolvedor: [AGENTIC_UPDATED_EVENT, ADVERSARIAL_UPDATED_EVENT, MENTOR_UPDATED_EVENT],
    arquiteto: [ARCHITECT_UPDATED_EVENT],
    adversario: [ADVERSARIAL_UPDATED_EVENT, AGENTIC_UPDATED_EVENT],
    revisor: [PR_REVIEW_UPDATED_EVENT, AGENTIC_UPDATED_EVENT],
    mentor: [MENTOR_UPDATED_EVENT],
}

const DEBOUNCE_MS = 1000

/** Atualiza a Visão geral e o Histórico do agente em tempo real (invalidação agrupada em 1 s). */
export function useAgentMetricsRealtime(agent: AgentId): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        let timer: ReturnType<typeof setTimeout> | null = null
        const handler = () => {
            if (timer) return
            timer = setTimeout(() => {
                timer = null
                void queryClient.invalidateQueries({ queryKey: [AGENT_METRICS_QUERY_KEY, agent] })
            }, DEBOUNCE_MS)
        }
        const events = [...AGENT_REALTIME_EVENTS[agent], AGENT_METRICS_UPDATED_EVENT]
        for (const event of events) channel.bind(event, handler)
        return () => {
            if (timer) clearTimeout(timer)
            for (const event of events) channel.unbind(event, handler)
            releaseChannel(name)
        }
    }, [agent, queryClient])
}
