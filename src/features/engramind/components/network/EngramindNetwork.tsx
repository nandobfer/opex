"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { channelColors, pickChannelColors, subscriptionLinks } from "../../network/network-math"
import { clearNetworkFilters, DEFAULT_NETWORK_FILTERS, hasActiveFilters, matchesFilters, NETWORK_FILTERS_STORAGE_KEY, networkFiltersSchema, type NetworkFilters } from "../../network/filters"
import type { NetworkMemory } from "../../network/types"
import { useEngramindRealtime } from "../../hooks/useEngramind"
import { useEngramindNetwork } from "../../hooks/useEngramindNetwork"
import { useNetworkSearch } from "../../hooks/useNetworkSearch"
import { QueryBoundary } from "../shared/QueryBoundary"
import { ImportMemoriesDialog } from "../page/memories/ImportMemoriesDialog"
import { ChannelDialog } from "../page/channels/ChannelDialog"
import { ChannelPanel } from "./ChannelPanel"
import { AgentLabelsProvider } from "./AgentLabels"
import { ChannelLabelsProvider, useChannelLabels } from "./ChannelName"
import { channelDisplayName } from "../../network/channel-labels"
import { MemoryUniverse } from "./MemoryUniverse"
import { NetworkBreadcrumb } from "./NetworkBreadcrumb"
import { NetworkSkeleton } from "./NetworkSkeleton"
import { NetworkActions, NetworkToolbar } from "./NetworkToolbar"
import { OverviewView } from "./OverviewView"
import { AboutCard } from "../page/AboutCard"
import { useRawMemoryActions } from "./useRawMemoryActions"
import { useUniverseParam } from "./useUniverseParam"

/**
 * Rede do Engramind em `/engramind` (OPE-109): visão inicial (agentes e canais), universo do canal e
 * universo do agente, com a gestão de canais e memórias (antes as abas Canais e Memórias).
 */
export function EngramindNetwork({ onConfigure }: { onConfigure: () => void }) {
    return (
        <ChannelLabelsProvider>
            <EngramindNetworkContent onConfigure={onConfigure} />
        </ChannelLabelsProvider>
    )
}

function EngramindNetworkContent({ onConfigure }: { onConfigure: () => void }) {
    useEngramindRealtime()
    const data = useEngramindNetwork()
    return (
        <AgentLabelsProvider value={data.agentNames}>
            <EngramindNetworkView onConfigure={onConfigure} data={data} />
        </AgentLabelsProvider>
    )
}

function EngramindNetworkView({ onConfigure, data }: { onConfigure: () => void; data: ReturnType<typeof useEngramindNetwork> }) {
    const { value: filters, setValue: setFilters } = usePersistentState<NetworkFilters>(NETWORK_FILTERS_STORAGE_KEY, networkFiltersSchema, DEFAULT_NETWORK_FILTERS)
    const patchFilters = useCallback((patch: Partial<NetworkFilters>) => setFilters((previous) => ({ ...previous, ...patch })), [setFilters])
    const clearFilters = useCallback(() => setFilters((previous) => clearNetworkFilters(previous)), [setFilters])
    const includeArchived = filters.includeArchived
    const [panel, setPanel] = useState<string | null>(null)
    const [dialog, setDialog] = useState<"import" | "channel" | null>(null)
    const { universe, open, back } = useUniverseParam({ escapeEnabled: panel === null && dialog === null })

    const rawById = useMemo(() => new Map(data.rawMemories.map((memory) => [memory.id, memory])), [data.rawMemories])
    const raw = useRawMemoryActions({ rawById, channels: data.rawChannels, categories: data.categories, limits: data.limits })
    const links = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, true), [data.subscriptions, data.channels])
    const visibleChannels = useMemo(() => data.channels.filter((channel) => includeArchived || !channel.archived), [data.channels, includeArchived])
    const visibleLinks = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, includeArchived), [data.subscriptions, data.channels, includeArchived])

    const channel = universe?.kind === "channel" ? data.channels.find((item) => item.slug === universe.slug) : undefined
    const agent = universe?.kind === "agent" ? data.agents.find((item) => item.id === universe.id) : undefined
    const missing = !data.isLoading && !data.error && universe !== null && !channel && !agent
    useEffect(() => {
        if (!missing) return
        toast.error(universe?.kind === "channel" ? "Canal não encontrado: voltando à rede." : "Agente não encontrado: voltando à rede.")
        back({ replace: true })
    }, [missing, universe, back])

    const agentChannels = useMemo(() => (agent ? [...new Set(links.filter((link) => link.agent === agent.id && (includeArchived || !data.channels.find((item) => item.slug === link.channel)?.archived)).map((link) => link.channel))] : []), [agent, links, includeArchived, data.channels])
    // Cores sobre todos os canais (estáveis entre universos); o universo só lê as dos seus canais e dá o
    // roxo primário ao canal com mais memórias nele (`universeChannelColors`, no MemoryUniverse).
    const allColors = useMemo(() => channelColors(data.channels.map((item) => item.slug)), [data.channels])
    const colors = useMemo(() => pickChannelColors(allColors, agentChannels), [allColors, agentChannels])
    const universeMemories = useMemo(() => {
        if (channel) return data.memories.filter((memory) => memory.channel === channel.slug)
        if (agent) return data.memories.filter((memory) => agentChannels.includes(memory.channel))
        return []
    }, [channel, agent, agentChannels, data.memories])
    const overviewMemories = useMemo(() => data.memories.filter((memory) => visibleChannels.some((item) => item.slug === memory.channel)), [data.memories, visibleChannels])

    // A busca cita os canais da visão atual (o Engramind só busca nos `manage` e arquivados citados).
    const viewChannels = useMemo(() => (channel ? [channel.slug] : agent ? agentChannels : visibleChannels.map((item) => item.slug)), [channel, agent, agentChannels, visibleChannels])
    const searchChannels = useMemo(() => (filters.channels.length ? viewChannels.filter((slug) => filters.channels.includes(slug)) : viewChannels), [viewChannels, filters.channels])
    const searching = filters.search.trim().length > 0
    const search = useNetworkSearch({ query: filters.search, channels: searchChannels, categories: filters.categories, fusion: data.searchFusion, enabled: searchChannels.length > 0 })
    // Busca que falhou não reaproveita o destaque do termo anterior: nada destaca e a barra avisa.
    const searchFailed = searching && searchChannels.length > 0 && search.isError
    const searchError = searchFailed ? apiErrorMessage(search.error, "Não foi possível buscar as memórias.") : null
    const searchIds = useMemo<ReadonlySet<string> | null>(() => (!searching || searchFailed ? null : searchChannels.length ? (search.data?.ids ?? null) : new Set<string>()), [searching, searchFailed, searchChannels.length, search.data])
    useEffect(() => {
        if (search.errorUpdatedAt && searchFailed) toast.error(`Busca falhou: ${apiErrorMessage(search.error, "Não foi possível buscar as memórias.")}`)
        // Um aviso por falha (o `errorUpdatedAt` muda a cada erro).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search.errorUpdatedAt])

    const filtering = hasActiveFilters(filters, searchIds)
    const isMatch = useMemo(() => (filtering ? (memory: NetworkMemory) => matchesFilters(memory, filters, searchIds) : null), [filtering, filters, searchIds])
    const hitsByChannel = useMemo(() => {
        if (!isMatch) return null
        const hits = new Map<string, number>()
        for (const memory of data.memories) if (isMatch(memory)) hits.set(memory.channel, (hits.get(memory.channel) ?? 0) + 1)
        return hits
    }, [isMatch, data.memories])
    const viewMemories = channel || agent ? universeMemories : overviewMemories
    const total = isMatch ? viewMemories.filter(isMatch).length : viewMemories.length
    const filterOptions = useMemo(
        () => ({
            channels: data.channels.filter((item) => includeArchived || !item.archived).map((item) => item.slug),
            categories: data.categories.map((item) => item.key),
            authors: [...new Set(data.memories.map((memory) => memory.author).filter((author): author is string => Boolean(author)))].sort(),
        }),
        [data.channels, data.categories, data.memories, includeArchived],
    )

    const channelLabels = useChannelLabels()
    const current = channel ? { kind: "channel" as const, id: channel.slug, label: channelDisplayName(channel.slug, channelLabels) } : agent ? { kind: "agent" as const, id: agent.id, label: agent.name } : null
    return (
        <div className="flex flex-col gap-3">
            <NetworkBreadcrumb
                current={current}
                onBack={() => back()}
                actions={<NetworkActions onNewChannel={() => setDialog("channel")} onImport={() => setDialog("import")} importDisabled={data.channels.every((item) => item.archived)} />}
            />
            <NetworkToolbar
                filters={filters}
                onFilters={patchFilters}
                options={filterOptions}
                onClear={clearFilters}
                total={total}
                textOnly={searching && !searchFailed && search.data?.textOnly === true}
                searchError={searchError}
                onRetrySearch={() => void search.refetch()}
            />
            <QueryBoundary isLoading={data.isLoading} error={data.error} onRetry={data.refetch} skeleton={<NetworkSkeleton />} onConfigure={onConfigure}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={current ? `${current.kind}:${current.id}` : "overview"} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.22 }}>
                        {channel ? (
                            <MemoryUniverse
                                center={{ kind: "channel", id: channel.slug, label: channel.slug, archived: channel.archived }}
                                memories={universeMemories}
                                usage={data.usage}
                                staleAfterDays={data.staleAfterDays}
                                isMatch={isMatch}
                                actions={channel.archived ? { ...raw.actions, readOnly: true } : raw.actions}
                                localRemovals={raw.localRemovals}
                                subscribers={new Set(links.filter((link) => link.channel === channel.slug).map((link) => link.agent)).size}
                                dataVersion={data.memoriesUpdatedAt}
                                onCreate={channel.archived ? null : () => raw.openCreate(channel.slug)}
                                createLabel="Nova memória"
                            />
                        ) : agent ? (
                            <MemoryUniverse
                                center={{ kind: "agent", id: agent.id, label: agent.name }}
                                memories={universeMemories}
                                usage={data.usage}
                                staleAfterDays={data.staleAfterDays}
                                channelColors={colors}
                                isMatch={isMatch}
                                actions={raw.actions}
                                localRemovals={raw.localRemovals}
                                dataVersion={data.memoriesUpdatedAt}
                                emptyTitle={agentChannels.length ? "Nenhuma memória nos canais deste agente" : "Este agente não assina nenhum canal"}
                            />
                        ) : (
                            <OverviewView
                                agents={data.agents}
                                channels={visibleChannels}
                                links={visibleLinks}
                                memories={overviewMemories}
                                allMemories={data.memories}
                                apps={data.apps}
                                selectedApps={filters.apps}
                                onSelectApps={(apps) => patchFilters({ apps })}
                                layout={filters.overviewLayout}
                                hitsByChannel={hitsByChannel}
                                onOpenAgent={(id) => open({ kind: "agent", id })}
                                onOpenChannel={(slug) => open({ kind: "channel", slug })}
                                onChannelMenu={setPanel}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </QueryBoundary>
            {/* Fim da página (OPE-113): o resumo, Configurar, Saiba mais e a distribuição da visão inicial. */}
            <AboutCard onConfigure={onConfigure} layout={universe ? undefined : { value: filters.overviewLayout, onChange: (overviewLayout) => patchFilters({ overviewLayout }) }} />
            <ChannelPanel channel={data.rawChannels.find((item) => item.slug === panel) ?? null} onOpenChange={(next) => !next && setPanel(null)} onDeleted={(slug) => universe?.kind === "channel" && universe.slug === slug && back()} />
            {dialog === "channel" && <ChannelDialog key="new" channel={null} open onOpenChange={(next) => !next && setDialog(null)} />}
            {dialog === "import" && <ImportMemoriesDialog channels={data.rawChannels} maxBatch={data.maxBatch} onOpenChange={(next) => !next && setDialog(null)} />}
            {raw.dialogs}
        </div>
    )
}
