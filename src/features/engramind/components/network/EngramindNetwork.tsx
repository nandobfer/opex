"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AppWindow, Unplug, UserX } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ENGRAMIND_INTEGRATION_HREF } from "../../constants"
import { channelsWithMemories } from "../../network/app-network"
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
import { AppsOverviewView } from "./AppsOverviewView"
import { AboutCard } from "../page/AboutCard"
import { useRawMemoryActions } from "./useRawMemoryActions"
import { useUniverseParam } from "./useUniverseParam"

/**
 * Rede do Engramind em `/engramind` (OPE-109): visão inicial Apps x canais (OPE-129), a visão Agentes x
 * canais de um app (`?app=`), universo do canal e universo do agente, com a gestão de canais e
 * memórias (antes as abas Canais e Memórias). As duas redes escondem os canais sem nenhuma memória.
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
    const { universe, app: appSlug, open, openApp, back, home } = useUniverseParam({ escapeEnabled: panel === null && dialog === null })
    const router = useRouter()

    const rawById = useMemo(() => new Map(data.rawMemories.map((memory) => [memory.id, memory])), [data.rawMemories])
    const raw = useRawMemoryActions({ rawById, channels: data.rawChannels, categories: data.categories, limits: data.limits })
    const links = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, true), [data.subscriptions, data.channels])
    const visibleChannels = useMemo(() => data.channels.filter((channel) => includeArchived || !channel.archived), [data.channels, includeArchived])
    const visibleLinks = useMemo(() => subscriptionLinks(data.subscriptions, data.channels, includeArchived), [data.subscriptions, data.channels, includeArchived])

    const channel = universe?.kind === "channel" ? data.channels.find((item) => item.slug === universe.slug) : undefined
    const agent = universe?.kind === "agent" ? data.agents.find((item) => item.id === universe.id) : undefined
    // Canal recém-criado (Novo canal abre o universo dele): espera a lista de canais ser relida.
    const missing = !data.isLoading && !data.error && universe !== null && !channel && !agent && !(universe.kind === "channel" && data.channelsFetching)
    useEffect(() => {
        if (!missing) return
        toast.error(universe?.kind === "channel" ? "Canal não encontrado: voltando à rede." : "Agente não encontrado: voltando à rede.")
        back({ replace: true })
    }, [missing, universe, back])
    const app = appSlug ? data.apps.find((item) => item.slug === appSlug) : undefined
    const missingApp = !data.isLoading && !data.error && appSlug !== null && !app
    useEffect(() => {
        if (!missingApp) return
        toast.error("App não encontrado: voltando à rede.")
        home({ replace: true })
    }, [missingApp, home])

    // As duas redes (Apps x canais e Agentes x canais) só mostram canais com alguma memória (inativas contam).
    const networkChannels = useMemo(() => channelsWithMemories(visibleChannels, data.memories), [visibleChannels, data.memories])
    const networkLinks = useMemo(() => {
        const slugs = new Set(networkChannels.map((item) => item.slug))
        return visibleLinks.filter((link) => slugs.has(link.channel))
    }, [networkChannels, visibleLinks])
    const appAgents = useMemo(() => (app ? data.agents.filter((item) => item.app === app.slug) : []), [app, data.agents])
    const appLinksOfApp = useMemo(() => {
        const ids = new Set(appAgents.map((item) => item.id))
        return networkLinks.filter((link) => ids.has(link.agent))
    }, [appAgents, networkLinks])
    const appChannelList = useMemo(() => {
        const slugs = new Set(appLinksOfApp.map((link) => link.channel))
        return networkChannels.filter((item) => slugs.has(item.slug))
    }, [appLinksOfApp, networkChannels])

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
    // Canais da rede em tela: os do app aberto ou todos os da visão de apps.
    const overviewChannels = app ? appChannelList : networkChannels
    const overviewMemories = useMemo(() => {
        const slugs = new Set(overviewChannels.map((item) => item.slug))
        return data.memories.filter((memory) => slugs.has(memory.channel))
    }, [data.memories, overviewChannels])

    // A busca cita os canais da visão atual (o Engramind só busca nos `manage` e arquivados citados).
    const viewChannels = useMemo(() => (channel ? [channel.slug] : agent ? agentChannels : overviewChannels.map((item) => item.slug)), [channel, agent, agentChannels, overviewChannels])
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
    const viewKey = current ? `${current.kind}:${current.id}` : app ? `app:${app.slug}` : "apps"
    const openIdentities = () => router.push(`${ENGRAMIND_INTEGRATION_HREF}?aba=identidades`)
    return (
        <div className="flex flex-col gap-3">
            <NetworkBreadcrumb
                app={app ? { label: app.name, onOpen: () => openApp(app.slug) } : null}
                current={current}
                onBack={() => back()}
                onHome={() => home()}
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
                    <motion.div key={viewKey} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.22 }}>
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
                        ) : app ? (
                            !appAgents.length ? (
                                <EmptyState icon={UserX} title="Este app não tem agentes ativos" description="Crie ou ative um agente deste app em Integrações › Engramind › Identidades." actionLabel="Voltar à rede" onAction={() => back()} />
                            ) : !appChannelList.length ? (
                                <EmptyState icon={Unplug} title="Os agentes deste app não assinam nenhum canal com memórias" description="Canais sem memórias ficam fora da rede. Assine um canal ou grave uma memória num canal assinado." actionLabel="Voltar à rede" onAction={() => back()} />
                            ) : (
                                <OverviewView
                                    agents={appAgents}
                                    channels={appChannelList}
                                    links={appLinksOfApp}
                                    memories={overviewMemories}
                                    allMemories={data.memories}
                                    title={app.name}
                                    layout={filters.overviewLayout}
                                    hitsByChannel={hitsByChannel}
                                    onOpenAgent={(id) => open({ kind: "agent", id })}
                                    onOpenChannel={(slug) => open({ kind: "channel", slug })}
                                    onChannelMenu={setPanel}
                                />
                            )
                        ) : !data.apps.length ? (
                            <EmptyState icon={AppWindow} title="Nenhum app no Engramind" description="Crie um app e os agentes dele na aba Identidades da integração para ver a rede." actionLabel="Configurar" onAction={openIdentities} />
                        ) : (
                            <AppsOverviewView
                                apps={data.apps}
                                agents={data.agents}
                                channels={networkChannels}
                                links={networkLinks}
                                memories={overviewMemories}
                                allMemories={data.memories}
                                layout={filters.overviewLayout}
                                hitsByChannel={hitsByChannel}
                                onOpenApp={openApp}
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
            {dialog === "channel" && <ChannelDialog key="new" channel={null} open onOpenChange={(next) => !next && setDialog(null)} onCreated={(slug) => open({ kind: "channel", slug })} />}
            {dialog === "import" && <ImportMemoriesDialog channels={data.rawChannels} maxBatch={data.maxBatch} onOpenChange={(next) => !next && setDialog(null)} />}
            {raw.dialogs}
        </div>
    )
}
