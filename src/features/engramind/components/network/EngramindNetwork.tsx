"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { channelColors, pickChannelColors, hasActiveFilters, matchesFilters, subscriptionLinks, type MemoryFilters } from "../../network/network-math"
import type { NetworkMemory } from "../../network/types"
import type { SearchResults } from "../../types"
import { engramindSend, useEngramindMutation, useEngramindRealtime } from "../../hooks/useEngramind"
import { useEngramindNetwork } from "../../hooks/useEngramindNetwork"
import { QueryBoundary } from "../shared/QueryBoundary"
import { ImportMemoriesDialog } from "../page/memories/ImportMemoriesDialog"
import { ChannelDialog } from "../page/channels/ChannelDialog"
import { ChannelPanel } from "./ChannelPanel"
import { ChannelLabelsProvider } from "./ChannelName"
import { MemoryUniverse } from "./MemoryUniverse"
import { NetworkBreadcrumb } from "./NetworkBreadcrumb"
import { NetworkSkeleton } from "./NetworkSkeleton"
import { NetworkToolbar } from "./NetworkToolbar"
import { OverviewView } from "./OverviewView"
import { useRawMemoryActions } from "./useRawMemoryActions"
import { useUniverseParam } from "./useUniverseParam"

interface SearchHitIds {
    ids: Set<string>
    textOnly: boolean
}

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
    const [includeArchived, setIncludeArchived] = useState(false)
    const [hiddenApps, setHiddenApps] = useState<string[]>([])
    const [filters, setFilters] = useState<MemoryFilters>({})
    const [query, setQuery] = useState("")
    const [search, setSearch] = useState<SearchHitIds | null>(null)
    const [panel, setPanel] = useState<string | null>(null)
    const [dialog, setDialog] = useState<"import" | "channel" | null>(null)
    const { universe, open, back } = useUniverseParam({ escapeEnabled: panel === null && dialog === null })

    const rawById = useMemo(() => new Map(data.rawMemories.map((memory) => [memory.id, memory])), [data.rawMemories])
    const raw = useRawMemoryActions({ rawById, channels: data.rawChannels, categories: data.categories, limits: data.limits })
    const links = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, true), [data.subscriptions, data.channels])
    const visibleChannels = useMemo(() => data.channels.filter((channel) => includeArchived || !channel.archived), [data.channels, includeArchived])
    const visibleLinks = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, includeArchived), [data.subscriptions, data.channels, includeArchived])

    const filtering = hasActiveFilters(filters, search?.ids ?? null)
    const isMatch = useMemo(() => (filtering ? (memory: NetworkMemory) => matchesFilters(memory, filters, search?.ids ?? null) : null), [filtering, filters, search])
    const hitsByChannel = useMemo(() => {
        if (!isMatch) return null
        const hits = new Map<string, number>()
        for (const memory of data.memories) if (isMatch(memory)) hits.set(memory.channel, (hits.get(memory.channel) ?? 0) + 1)
        return hits
    }, [isMatch, data.memories])

    const runSearch = useEngramindMutation(
        (text: string) => engramindSend<SearchResults>("post", "memories/search", { query: text, ...(filters.channel ? { channels: [filters.channel] } : {}), ...(filters.category ? { categories: [filters.category] } : {}), include_archived: true, limit: 50 }),
        { invalidate: [] },
    )
    const doSearch = async () => {
        const text = query.trim()
        if (!text) return setSearch(null)
        const result = await runSearch.mutateAsync(text)
        setSearch({ ids: new Set(result.results.map((hit) => hit.memory.id)), textOnly: result.mode === "text" })
    }

    const channel = universe?.kind === "channel" ? data.channels.find((item) => item.slug === universe.slug) : undefined
    const agent = universe?.kind === "agent" ? data.agents.find((item) => item.id === universe.id) : undefined
    const missing = !data.isLoading && !data.error && universe !== null && !channel && !agent
    useEffect(() => {
        if (!missing) return
        toast.error(universe?.kind === "channel" ? "Canal não encontrado: voltando à rede." : "Agente não encontrado: voltando à rede.")
        back({ replace: true })
    }, [missing, universe, back])

    const agentChannels = useMemo(() => (agent ? [...new Set(links.filter((link) => link.agent === agent.id && (includeArchived || !data.channels.find((item) => item.slug === link.channel)?.archived)).map((link) => link.channel))] : []), [agent, links, includeArchived, data.channels])
    // Cores sobre todos os canais (estáveis entre universos); o universo só lê as dos seus canais.
    const allColors = useMemo(() => channelColors(data.channels.map((item) => item.slug)), [data.channels])
    const colors = useMemo(() => pickChannelColors(allColors, agentChannels), [allColors, agentChannels])
    const universeMemories = useMemo(() => {
        if (channel) return data.memories.filter((memory) => memory.channel === channel.slug)
        if (agent) return data.memories.filter((memory) => agentChannels.includes(memory.channel))
        return []
    }, [channel, agent, agentChannels, data.memories])

    const current = channel ? { kind: "channel" as const, label: channel.slug } : agent ? { kind: "agent" as const, label: agent.name } : null
    return (
        <div className="flex flex-col gap-3">
            <NetworkToolbar
                filters={filters}
                onFilters={setFilters}
                channels={data.channels.map((item) => item.slug)}
                categories={data.categories.map((item) => item.key)}
                query={query}
                onQuery={setQuery}
                onSearch={() => void doSearch()}
                onClearSearch={() => {
                    setSearch(null)
                    setQuery("")
                }}
                searching={runSearch.isPending}
                hasSearch={search !== null}
                textOnly={search?.textOnly === true}
                includeArchived={includeArchived}
                onIncludeArchived={setIncludeArchived}
                onNewChannel={() => setDialog("channel")}
                onImport={() => setDialog("import")}
                importDisabled={data.channels.every((item) => item.archived)}
            />
            <NetworkBreadcrumb current={current} onBack={() => back()} />
            <QueryBoundary isLoading={data.isLoading} error={data.error} onRetry={data.refetch} skeleton={<NetworkSkeleton />} onConfigure={onConfigure}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={current ? `${current.kind}:${current.label}` : "overview"} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.22 }}>
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
                                memories={data.memories.filter((memory) => visibleChannels.some((item) => item.slug === memory.channel))}
                                apps={data.apps}
                                hiddenApps={hiddenApps}
                                onToggleApp={(app, visible) => setHiddenApps((list) => (visible ? list.filter((item) => item !== app) : [...new Set([...list, app])]))}
                                hitsByChannel={hitsByChannel}
                                onOpenAgent={(id) => open({ kind: "agent", id })}
                                onOpenChannel={(slug) => open({ kind: "channel", slug })}
                                onChannelMenu={setPanel}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </QueryBoundary>
            <ChannelPanel channel={data.rawChannels.find((item) => item.slug === panel) ?? null} onOpenChange={(next) => !next && setPanel(null)} onDeleted={(slug) => universe?.kind === "channel" && universe.slug === slug && back()} />
            {dialog === "channel" && <ChannelDialog key="new" channel={null} open onOpenChange={(next) => !next && setDialog(null)} />}
            {dialog === "import" && <ImportMemoriesDialog channels={data.rawChannels} maxBatch={data.maxBatch} onOpenChange={(next) => !next && setDialog(null)} />}
            {raw.dialogs}
        </div>
    )
}
