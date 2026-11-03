"use client"

import { useCallback, useMemo } from "react"
import type { Edge, Node } from "@xyflow/react"
import { AppWindow } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { agentReach, type AgentWrite } from "../../network/network-math"
import { layoutOverview, OVERVIEW_LINK_BEND, overviewInitialBounds, type OverviewLayoutMode } from "../../network/overview-layout"
import type { ConsumptionEvent, NetworkAgent, NetworkChannel, NetworkLink, NetworkMemory } from "../../network/types"
import { useEngramindConsumption, useLiveEffects } from "../../hooks/useEngramindConsumption"
import { NetworkLiveProvider } from "./live"
import { NetworkCanvas } from "./NetworkCanvas"
import { AgentNode, ChannelNode, type AgentNodeData, type ChannelNodeData } from "./nodes"
import { RecenterButton } from "./RecenterButton"
import { StatList, StatsCard } from "./StatsCard"
import { useAgentWrites } from "./useAgentWrites"
import { ChannelDisplayName } from "./ChannelName"
import { useStable } from "./useStableNodes"
import { useAgentActivity } from "../../hooks/useAgentActivity"
import { OPEX_APP_SLUG } from "../../constants"

const NODE_TYPES = { agent: AgentNode, channel: ChannelNode }
const TRAVEL_MS = 900

export interface OverviewViewProps {
    agents: NetworkAgent[]
    channels: NetworkChannel[]
    links: NetworkLink[]
    memories: NetworkMemory[]
    /** Todas as memórias da rede (criações por agente: a partícula verde não depende dos filtros da visão). */
    allMemories?: NetworkMemory[]
    apps: { slug: string; name: string }[]
    /** Apps escolhidos no filtro (vazio = todos). */
    selectedApps: readonly string[]
    onSelectApps: (apps: string[]) => void
    /** Distribuição da visão inicial (escolhida no card "O que é o Engramind"; guardada no navegador). */
    layout: OverviewLayoutMode
    /** Busca/filtros: memórias que casam por canal (`null` = sem filtro). */
    hitsByChannel: Map<string, number> | null
    onOpenAgent: (agent: string) => void
    onOpenChannel: (slug: string) => void
    onChannelMenu: (slug: string) => void
}

/** Ids das arestas agente → canal (um link por canal casado). */
export const linkEdgeId = (agent: string, channel: string) => `${agent}→${channel}`

/**
 * Visão inicial da rede: agentes e canais ligados pelas assinaturas, na distribuição escolhida no
 * card "O que é o Engramind" (Órbita ou Radial), com os cards pelo tamanho. O consumo ao
 * vivo de um agente do Opex pulsa o agente, manda a partícula ao canal e, se ele entregou memórias,
 * de volta ao agente.
 */
export function OverviewView({ agents, channels, links, memories, allMemories, apps, selectedApps, onSelectApps, layout, hitsByChannel, onOpenAgent, onOpenChannel, onChannelMenu }: OverviewViewProps) {
    const live = useLiveEffects(null)
    // App escolhido que não existe mais não conta (sem nenhum válido, todos).
    const chosenApps = useMemo(() => selectedApps.filter((slug) => apps.some((app) => app.slug === slug)), [selectedApps, apps])
    const visibleAgents = useMemo(() => (chosenApps.length ? agents.filter((agent) => chosenApps.includes(agent.app)) : agents), [agents, chosenApps])
    const agentIds = useMemo(() => new Set(visibleAgents.map((agent) => agent.id)), [visibleAgents])
    const visibleLinks = useMemo(() => links.filter((link) => agentIds.has(link.agent)), [links, agentIds])
    const countByChannel = useMemo(() => {
        const counts = new Map<string, number>()
        for (const memory of memories) if (memory.status !== "archived") counts.set(memory.channel, (counts.get(memory.channel) ?? 0) + 1)
        return counts
    }, [memories])
    // Tamanho do canal: todas as memórias dele (inclusive inativas); do agente: o alcance.
    const totalByChannel = useMemo(() => {
        const counts = new Map<string, number>()
        for (const memory of memories) counts.set(memory.channel, (counts.get(memory.channel) ?? 0) + 1)
        return counts
    }, [memories])
    const reach = useMemo(() => agentReach(visibleLinks, countByChannel), [visibleLinks, countByChannel])
    const positions = useMemo(
        () => layoutOverview({ agents: visibleAgents, channels, links: visibleLinks, agentCounts: reach, channelCounts: totalByChannel, mode: layout }),
        [visibleAgents, channels, visibleLinks, reach, totalByChannel, layout],
    )
    const initialBounds = useMemo(() => overviewInitialBounds(positions), [positions])
    // Gravadas (auditoria do Opex): só os agentes do app do Opex (`opex/<identidade>`); os demais mostram só as acessíveis.
    const activity = useAgentActivity()
    const writtenOf = useCallback(
        (id: string) => {
            const [app, slug] = id.split("/")
            if (app !== OPEX_APP_SLUG || !slug) return null
            const row = activity.byAgent.get(slug as never)
            return { total: row?.total ?? 0, last7d: row?.last7d ?? 0 }
        },
        [activity.byAgent],
    )

    const onConsumption = useCallback(
        (event: ConsumptionEvent) => {
            if (!agentIds.has(event.agent)) return
            live.countEvent()
            const reached = event.channels.filter((slug) => visibleLinks.some((link) => link.agent === event.agent && link.channel === slug))
            const delivered = (event.delivered ?? []).filter((slug) => reached.includes(slug))
            live.pulse([`agent:${event.agent}`])
            live.travel(reached.map((slug) => ({ edge: linkEdgeId(event.agent, slug), reverse: false, tone: "primary" as const, delayMs: 0 })))
            live.pulse(
                reached.map((slug) => `channel:${slug}`),
                TRAVEL_MS,
            )
            live.travel(delivered.map((slug) => ({ edge: linkEdgeId(event.agent, slug), reverse: true, tone: "primary" as const, delayMs: TRAVEL_MS + 150 })))
            if (delivered.length) live.pulse([`agent:${event.agent}`], 2 * TRAVEL_MS + 150)
        },
        [agentIds, visibleLinks, live],
    )
    useEngramindConsumption(onConsumption)

    // Memória criada por um agente: pulso no agente, partícula verde até o canal e pulso no canal.
    const channelSlugs = useMemo(() => new Set(channels.map((channel) => channel.slug)), [channels])
    const onWrite = useCallback(
        (writes: AgentWrite[]) => {
            const mine = writes.filter((write) => agentIds.has(write.agent) && channelSlugs.has(write.channel))
            if (!mine.length) return
            live.pulse([...new Set(mine.map((write) => `agent:${write.agent}`))])
            const linked = mine.filter((write) => visibleLinks.some((link) => link.agent === write.agent && link.channel === write.channel))
            live.travel(linked.map((write) => ({ edge: linkEdgeId(write.agent, write.channel), reverse: false, tone: "success" as const, delayMs: 0 })))
            live.pulse([...new Set(mine.map((write) => `channel:${write.channel}`))], linked.length ? TRAVEL_MS : 0)
        },
        [agentIds, channelSlugs, visibleLinks, live],
    )
    useAgentWrites(allMemories ?? memories, onWrite)

    const nodes = useMemo<Node[]>(() => {
        const list: Node[] = []
        for (const agent of visibleAgents) {
            const point = positions.agents.get(agent.id) ?? { x: 0, y: 0 }
            const data: AgentNodeData = { id: agent.id, name: agent.name, app: agent.app, written: writtenOf(agent.id), reachable: reach.get(agent.id) ?? 0, scale: positions.scales.get(`agent:${agent.id}`), point }
            list.push({ id: `agent:${agent.id}`, type: "agent", position: point, data })
        }
        for (const channel of channels) {
            const hits = hitsByChannel ? (hitsByChannel.get(channel.slug) ?? 0) : null
            const point = positions.channels.get(channel.slug) ?? { x: 0, y: 0 }
            const data: ChannelNodeData = { slug: channel.slug, name: channel.name, count: countByChannel.get(channel.slug) ?? 0, archived: channel.archived, hits, dimmed: hits === 0, onMenu: onChannelMenu, scale: positions.scales.get(`channel:${channel.slug}`), point }
            list.push({ id: `channel:${channel.slug}`, type: "channel", position: point, data })
        }
        return list
    }, [visibleAgents, channels, positions, hitsByChannel, countByChannel, onChannelMenu, writtenOf, reach])

    const edges = useMemo<Edge[]>(
        () =>
            // Links vizinhos do mesmo canal curvam para lados alternados (não se sobrepõem por inteiro).
            visibleLinks.map((link, index) => ({
                id: linkEdgeId(link.agent, link.channel),
                source: `agent:${link.agent}`,
                target: `channel:${link.channel}`,
                type: "link",
                data: { mode: link.mode, dimmed: hitsByChannel ? !hitsByChannel.get(link.channel) : false, bend: index % 2 ? -OVERVIEW_LINK_BEND : OVERVIEW_LINK_BEND },
            })),
        [visibleLinks, hitsByChannel],
    )
    const stableNodes = useStable(nodes)
    const stableEdges = useStable(edges)

    const active = memories.filter((memory) => memory.status !== "archived").length
    const liveValue = useMemo(() => ({ pulses: live.pulses, travels: live.travels, finish: live.finish }), [live.pulses, live.travels, live.finish])

    return (
        <NetworkLiveProvider value={liveValue}>
            <NetworkCanvas
                nodes={stableNodes}
                edges={stableEdges}
                nodeTypes={NODE_TYPES}
                fitKey={`overview:${visibleAgents.length}:${channels.length}:${layout}`}
                initialBounds={initialBounds}
                label="Rede de agentes e canais"
                onNodeClick={(_event, node) => (node.type === "agent" ? onOpenAgent((node.data as AgentNodeData).id) : node.type === "channel" && onOpenChannel((node.data as ChannelNodeData).slug))}
                onNodeContextMenu={(event, node) => {
                    if (node.type !== "channel") return
                    event.preventDefault()
                    onChannelMenu((node.data as ChannelNodeData).slug)
                }}
            >
                <StatsCard
                    title="Rede"
                    summary={`${visibleAgents.length} ${visibleAgents.length === 1 ? "agente" : "agentes"} · ${channels.length} ${channels.length === 1 ? "canal" : "canais"}`}
                    rows={[
                        { label: "Agentes", value: visibleAgents.length, testId: "stat-agents" },
                        { label: "Canais", value: channels.length, testId: "stat-channels" },
                        { label: "Memórias ativas", value: active, testId: "stat-active" },
                        { label: "Memórias inativas", value: memories.length - active, testId: "stat-inactive" },
                        { label: "Consumos ao vivo", value: live.liveCount, testId: "stat-live" },
                    ]}
                >
                    {apps.length > 0 && (
                        <div className="mt-3 border-t pt-2" data-testid="app-filter">
                            <p className="mb-1 font-semibold text-foreground">Apps</p>
                            <CadastroMultiSelect
                                icon={AppWindow}
                                aria-label="Filtrar agentes por app"
                                placeholder="Todos os apps"
                                options={apps.map((app) => ({ value: app.slug, label: app.name }))}
                                selected={chosenApps}
                                onSelect={onSelectApps}
                                searchable
                                searchPlaceholder="Buscar app..."
                                className="h-8 text-xs"
                            />
                        </div>
                    )}
                    <StatList title="Por canal" testId="stats-by-channel" items={channels.map((channel) => ({ key: channel.slug, label: channel.slug, node: <ChannelDisplayName slug={channel.slug} className="min-w-0 flex-1 text-muted-foreground" />, count: countByChannel.get(channel.slug) ?? 0 })).sort((a, b) => b.count - a.count)} />
                    <StatList title="Por agente (alcance)" testId="stats-by-agent" items={visibleAgents.map((agent) => ({ key: agent.id, label: agent.name, count: reach.get(agent.id) ?? 0 })).sort((a, b) => b.count - a.count)} />
                </StatsCard>
                <RecenterButton />
            </NetworkCanvas>
        </NetworkLiveProvider>
    )
}
