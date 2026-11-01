"use client"

import { useCallback, useMemo } from "react"
import type { Edge, Node } from "@xyflow/react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { agentReach, layoutOverview, overviewInitialBounds } from "../../network/network-math"
import type { ConsumptionEvent, NetworkAgent, NetworkChannel, NetworkLink, NetworkMemory } from "../../network/types"
import { useEngramindConsumption, useLiveEffects } from "../../hooks/useEngramindConsumption"
import { NetworkLiveProvider } from "./live"
import { NetworkCanvas } from "./NetworkCanvas"
import { AgentNode, ChannelNode, type AgentNodeData, type ChannelNodeData } from "./nodes"
import { RecenterButton } from "./RecenterButton"
import { StatList, StatsCard } from "./StatsCard"

const NODE_TYPES = { agent: AgentNode, channel: ChannelNode }
const TRAVEL_MS = 900

export interface OverviewViewProps {
    agents: NetworkAgent[]
    channels: NetworkChannel[]
    links: NetworkLink[]
    memories: NetworkMemory[]
    apps: { slug: string; name: string }[]
    hiddenApps: readonly string[]
    onToggleApp: (app: string, visible: boolean) => void
    /** Busca/filtros: memórias que casam por canal (`null` = sem filtro). */
    hitsByChannel: Map<string, number> | null
    onOpenAgent: (agent: string) => void
    onOpenChannel: (slug: string) => void
    onChannelMenu: (slug: string) => void
}

/** Ids das arestas agente → canal (um link por canal casado). */
export const linkEdgeId = (agent: string, channel: string) => `${agent}→${channel}`

/**
 * Visão inicial da rede: agentes de um lado e canais do outro, ligados pelas assinaturas. O consumo ao
 * vivo de um agente do Opex pulsa o agente, manda a partícula ao canal e, se ele entregou memórias,
 * de volta ao agente.
 */
export function OverviewView({ agents, channels, links, memories, apps, hiddenApps, onToggleApp, hitsByChannel, onOpenAgent, onOpenChannel, onChannelMenu }: OverviewViewProps) {
    const live = useLiveEffects(null)
    const visibleAgents = useMemo(() => agents.filter((agent) => !hiddenApps.includes(agent.app)), [agents, hiddenApps])
    const agentIds = useMemo(() => new Set(visibleAgents.map((agent) => agent.id)), [visibleAgents])
    const visibleLinks = useMemo(() => links.filter((link) => agentIds.has(link.agent)), [links, agentIds])
    const countByChannel = useMemo(() => {
        const counts = new Map<string, number>()
        for (const memory of memories) if (memory.status !== "archived") counts.set(memory.channel, (counts.get(memory.channel) ?? 0) + 1)
        return counts
    }, [memories])
    const positions = useMemo(() => layoutOverview(visibleAgents, channels), [visibleAgents, channels])
    const initialBounds = useMemo(() => overviewInitialBounds([...positions.agents.values()]), [positions])

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

    const nodes = useMemo<Node[]>(() => {
        const list: Node[] = []
        for (const agent of visibleAgents) {
            const data: AgentNodeData = { id: agent.id, name: agent.name, app: agent.app }
            list.push({ id: `agent:${agent.id}`, type: "agent", position: positions.agents.get(agent.id) ?? { x: 0, y: 0 }, data })
        }
        for (const channel of channels) {
            const hits = hitsByChannel ? (hitsByChannel.get(channel.slug) ?? 0) : null
            const data: ChannelNodeData = { slug: channel.slug, name: channel.name, count: countByChannel.get(channel.slug) ?? 0, archived: channel.archived, hits, dimmed: hits === 0, onMenu: onChannelMenu }
            list.push({ id: `channel:${channel.slug}`, type: "channel", position: positions.channels.get(channel.slug) ?? { x: 0, y: 0 }, data })
        }
        return list
    }, [visibleAgents, channels, positions, hitsByChannel, countByChannel, onChannelMenu])

    const edges = useMemo<Edge[]>(
        () => visibleLinks.map((link) => ({ id: linkEdgeId(link.agent, link.channel), source: `agent:${link.agent}`, target: `channel:${link.channel}`, type: "link", data: { mode: link.mode, dimmed: hitsByChannel ? !hitsByChannel.get(link.channel) : false } })),
        [visibleLinks, hitsByChannel],
    )

    const reach = agentReach(visibleLinks, countByChannel)
    const active = memories.filter((memory) => memory.status !== "archived").length
    const liveValue = useMemo(() => ({ pulses: live.pulses, travels: live.travels, finish: live.finish }), [live.pulses, live.travels, live.finish])

    return (
        <NetworkLiveProvider value={liveValue}>
            <NetworkCanvas
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                fitKey={`overview:${visibleAgents.length}:${channels.length}`}
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
                    rows={[
                        { label: "Agentes", value: visibleAgents.length, testId: "stat-agents" },
                        { label: "Canais", value: channels.length, testId: "stat-channels" },
                        { label: "Memórias ativas", value: active, testId: "stat-active" },
                        { label: "Memórias inativas", value: memories.length - active, testId: "stat-inactive" },
                        { label: "Consumos ao vivo", value: live.liveCount, testId: "stat-live" },
                    ]}
                >
                    {apps.length > 0 && (
                        <fieldset className="mt-3 border-t pt-2" data-testid="app-filter">
                            <legend className="mb-1 font-semibold text-foreground">Apps</legend>
                            <div className="flex flex-col gap-1">
                                {apps.map((app) => (
                                    <span key={app.slug} className="flex items-center gap-2">
                                        <Checkbox id={`app-${app.slug}`} checked={!hiddenApps.includes(app.slug)} onCheckedChange={(checked) => onToggleApp(app.slug, checked)} aria-label={`Mostrar agentes do app ${app.name}`} />
                                        <Label htmlFor={`app-${app.slug}`} className="text-xs font-normal">
                                            {app.name}
                                        </Label>
                                    </span>
                                ))}
                            </div>
                        </fieldset>
                    )}
                    <StatList title="Por canal" testId="stats-by-channel" items={channels.map((channel) => ({ key: channel.slug, label: channel.slug, count: countByChannel.get(channel.slug) ?? 0 })).sort((a, b) => b.count - a.count)} />
                    <StatList title="Por agente (alcance)" testId="stats-by-agent" items={visibleAgents.map((agent) => ({ key: agent.id, label: agent.name, count: reach.get(agent.id) ?? 0 })).sort((a, b) => b.count - a.count)} />
                </StatsCard>
                <RecenterButton />
            </NetworkCanvas>
        </NetworkLiveProvider>
    )
}
