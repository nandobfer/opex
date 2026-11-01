"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { ENGRAMIND_QUERY_KEY } from "../constants"
import { agentDisplayName, DEFAULT_STALE_AFTER_DAYS, type SubscriptionInput } from "../network/network-math"
import type { MemoryUsageMap, NetworkAgent, NetworkChannel, NetworkMemory } from "../network/types"
import type { Category, EngramindAgent, EngramindApp, EngramindChannel, EngramindMemory, EngramindSubscription, SettingMeta } from "../types"
import { useEngramindList, useEngramindQuery } from "./useEngramind"

/**
 * Dados da rede do Engramind (OPE-109): canais (com os arquivados), apps, agentes, assinaturas e
 * memórias de todos os status (todas as páginas), configurações globais (o prazo
 * `consolidation.stale_after_days` não aceita sobreposição por canal) e o uso registrado pelo Opex.
 * Tudo pelas rotas `/api/engramind/**` (o navegador nunca chama o Engramind).
 */

export const STALE_AFTER_DAYS_KEY = "consolidation.stale_after_days"
export const MEMORY_USAGE_KEY = [ENGRAMIND_QUERY_KEY, "memory-usage"] as const
const ALL_STATUSES = "active,permanent,archived"

export function toNetworkMemory(memory: EngramindMemory): NetworkMemory {
    return {
        id: memory.id,
        channel: memory.channel,
        title: memory.title?.trim() || firstSentence(memory.text),
        text: memory.text,
        category: memory.category,
        status: memory.status,
        version: memory.version,
        createdAt: memory.created_at,
        updatedAt: memory.updated_at,
        retrievals: memory.retrieval_count ?? 0,
        injections: memory.injected_count ?? 0,
        lastRetrievedAt: memory.last_retrieved_at ?? null,
        verifiedAt: memory.verified_at ?? null,
        stale: memory.stale_candidate === true,
        author: memory.author?.agent ?? memory.author?.app ?? null,
    }
}

export function firstSentence(text: string): string {
    const flat = text.replace(/\s+/g, " ").trim()
    const match = /^(.{1,140}?[.!?])(\s|$)/.exec(flat)
    return match ? match[1] : flat.length > 140 ? `${flat.slice(0, 137)}…` : flat
}

export function useMemoryUsage(enabled = true) {
    return useQuery({
        queryKey: MEMORY_USAGE_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MemoryUsageMap>>("/engramind/memory-usage")).data),
        enabled,
        staleTime: 30_000,
    })
}

export function useEngramindNetwork() {
    const channels = useEngramindList<EngramindChannel>("channels", "channels", { include_archived: true }, { all: true })
    const apps = useEngramindList<EngramindApp>("apps", "apps", {}, { all: true })
    const agents = useEngramindList<EngramindAgent>("agents", "agents", {}, { all: true })
    const subscriptions = useEngramindList<EngramindSubscription>("subscriptions", "subscriptions", {}, { all: true })
    const memories = useEngramindList<EngramindMemory>("memories", "memories", { status: ALL_STATUSES }, { all: true })
    const settings = useEngramindQuery<{ settings: SettingMeta[] }>("settings")
    const usage = useMemoryUsage()

    const setting = (key: string) => settings.data?.settings.find((meta) => meta.key === key)?.value
    const staleDays = setting(STALE_AFTER_DAYS_KEY)
    const maxBatch = setting("limits.max_batch")
    const categories = (setting("categories.list") as Category[] | undefined) ?? []
    const textMin = setting("memory.text_min")
    const textMax = setting("memory.text_max")
    const limits = typeof textMin === "number" && typeof textMax === "number" ? { textMin, textMax } : undefined

    const data = useMemo(() => {
        const qualifiedById = new Map(agents.items.map((agent) => [agent.id, agent.qualified_slug]))
        const networkAgents: NetworkAgent[] = agents.items.filter((agent) => !agent.disabled_at).map((agent) => ({ id: agent.qualified_slug, app: agent.app.slug, name: agentDisplayName(agent.name) }))
        const networkChannels: NetworkChannel[] = channels.items.map((channel) => ({ slug: channel.slug, name: channel.name, archived: Boolean(channel.archived_at) }))
        const subscriptionInputs: SubscriptionInput[] = subscriptions.items.map((subscription) => ({
            id: subscription.id,
            agent: subscription.agent.qualified_slug ?? qualifiedById.get(subscription.agent.id) ?? subscription.agent.slug,
            target: subscription.target,
            isPrefix: subscription.is_prefix,
            mode: subscription.mode,
            reaches: subscription.reaches ?? [],
        }))
        return { agents: networkAgents, channels: networkChannels, subscriptions: subscriptionInputs, memories: memories.items.map(toNetworkMemory) }
    }, [agents.items, channels.items, subscriptions.items, memories.items])

    const queries = [channels, apps, agents, subscriptions, memories]
    const loading = queries.some((query) => query.isLoading) || queries.some((query) => query.hasNextPage)
    const error = queries.find((query) => query.error)?.error ?? settings.error ?? null
    return {
        ...data,
        apps: apps.items.filter((app) => !app.disabled_at).map((app) => ({ slug: app.slug, name: app.name })),
        rawChannels: channels.items,
        rawAgents: agents.items,
        rawMemories: memories.items,
        usage: usage.data ?? {},
        categories,
        limits,
        maxBatch: typeof maxBatch === "number" ? maxBatch : null,
        staleAfterDays: typeof staleDays === "number" && staleDays > 0 ? staleDays : DEFAULT_STALE_AFTER_DAYS,
        memoriesUpdatedAt: memories.dataUpdatedAt,
        isLoading: loading && !error,
        error,
        refetch: () => {
            for (const query of queries) void query.refetch()
            void settings.refetch()
            void usage.refetch()
        },
    }
}
