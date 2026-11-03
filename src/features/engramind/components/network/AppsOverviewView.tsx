"use client"

import { useCallback, useMemo } from "react"
import type { Edge, Node } from "@xyflow/react"
import { appLinkEdgeId, appLinks, appOfAgent, appReach } from "../../network/app-network"
import { layoutOverview, OVERVIEW_LINK_BEND, overviewInitialBounds, type OverviewLayoutMode } from "../../network/overview-layout"
import type { NetworkAgent, NetworkChannel, NetworkLink, NetworkMemory } from "../../network/types"
import { NetworkLiveProvider } from "./live"
import { NetworkCanvas } from "./NetworkCanvas"
import { AppNode, ChannelNode, type AppNodeData, type ChannelNodeData } from "./nodes"
import { RecenterButton } from "./RecenterButton"
import { StatList, StatsCard } from "./StatsCard"
import { channelNodesOf, ChannelStatList, overviewStatRows, useChannelCounts, useHubLive } from "./overview-shared"
import { useStable } from "./useStableNodes"
import type { LinkEdgeData } from "./edges"

const NODE_TYPES = { app: AppNode, channel: ChannelNode }
const appNodeKey = (app: string) => `app:${app}`
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export interface AppsOverviewViewProps {
    /** Apps ativos do Engramind. */
    apps: { slug: string; name: string }[]
    /** Agentes ativos (contagem por app). */
    agents: NetworkAgent[]
    /** Canais da rede, já sem os vazios. */
    channels: NetworkChannel[]
    /** Assinaturas por agente (agregadas aqui por app). */
    links: NetworkLink[]
    memories: NetworkMemory[]
    /** Todas as memórias da rede (partícula verde de criação). */
    allMemories?: NetworkMemory[]
    layout: OverviewLayoutMode
    hitsByChannel: Map<string, number> | null
    onOpenApp: (app: string) => void
    onOpenChannel: (slug: string) => void
    onChannelMenu: (slug: string) => void
}

/**
 * Visão inicial de `/engramind` (OPE-129): os apps do Engramind e os canais, ligados pelas assinaturas
 * dos agentes de cada app (um link por app e canal). Mesmo canvas, distribuições e escala da visão
 * Agentes x canais; clicar no app abre essa visão restrita a ele.
 */
export function AppsOverviewView({ apps, agents, channels, links, memories, allMemories, layout, hitsByChannel, onOpenApp, onOpenChannel, onChannelMenu }: AppsOverviewViewProps) {
    const appSlugs = useMemo(() => new Set(apps.map((app) => app.slug)), [apps])
    const agentsByApp = useMemo(() => {
        const counts = new Map<string, number>()
        for (const agent of agents) counts.set(agent.app, (counts.get(agent.app) ?? 0) + 1)
        return counts
    }, [agents])
    const activeAgents = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents])
    const aggregated = useMemo(() => appLinks(links.filter((link) => activeAgents.has(link.agent) && appSlugs.has(appOfAgent(link.agent)))), [links, activeAgents, appSlugs])
    const { countByChannel, totalByChannel } = useChannelCounts(memories)
    const reach = useMemo(() => appReach(aggregated, countByChannel), [aggregated, countByChannel])
    // O layout trata os apps como os "agentes" da visão: as distribuições valem iguais.
    const hubs = useMemo(() => apps.map((app) => ({ id: app.slug, app: app.slug })), [apps])
    const layoutLinks = useMemo(() => aggregated.map((link) => ({ agent: link.app, channel: link.channel })), [aggregated])
    const positions = useMemo(() => layoutOverview({ agents: hubs, channels, links: layoutLinks, agentCounts: reach, channelCounts: totalByChannel, mode: layout }), [hubs, channels, layoutLinks, reach, totalByChannel, layout])
    const initialBounds = useMemo(() => overviewInitialBounds(positions), [positions])

    const hubOf = useCallback((agent: string) => (activeAgents.has(agent) && appSlugs.has(appOfAgent(agent)) ? appOfAgent(agent) : null), [activeAgents, appSlugs])
    const hubLinks = useMemo(() => aggregated.map((link) => ({ hub: link.app, channel: link.channel })), [aggregated])
    const live = useHubLive({ hubOf, links: hubLinks, edgeOf: appLinkEdgeId, nodeKey: appNodeKey, channels, memories: allMemories ?? memories })

    const nodes = useMemo<Node[]>(() => {
        const list: Node[] = apps.map((app) => {
            const point = positions.agents.get(app.slug) ?? { x: 0, y: 0 }
            const data: AppNodeData = { slug: app.slug, name: app.name, agents: agentsByApp.get(app.slug) ?? 0, reachable: reach.get(app.slug) ?? 0, scale: positions.scales.get(`agent:${app.slug}`), point }
            return { id: appNodeKey(app.slug), type: "app", position: point, data }
        })
        return [...list, ...channelNodesOf({ channels, positions, countByChannel, hitsByChannel, onChannelMenu })]
    }, [apps, channels, positions, agentsByApp, reach, countByChannel, hitsByChannel, onChannelMenu])

    const edges = useMemo<Edge[]>(
        () =>
            aggregated.map((link, index) => {
                const data: LinkEdgeData = {
                    mode: link.modes[0] ?? "inject",
                    label: `${plural(link.agents.length, "agente", "agentes")} · ${link.modes.join(", ")}`,
                    dimmed: hitsByChannel ? !hitsByChannel.get(link.channel) : false,
                    bend: index % 2 ? -OVERVIEW_LINK_BEND : OVERVIEW_LINK_BEND,
                }
                return { id: link.id, source: appNodeKey(link.app), target: `channel:${link.channel}`, type: "link", data }
            }),
        [aggregated, hitsByChannel],
    )
    const stableNodes = useStable(nodes)
    const stableEdges = useStable(edges)

    return (
        <NetworkLiveProvider value={live.value}>
            <NetworkCanvas
                nodes={stableNodes}
                edges={stableEdges}
                nodeTypes={NODE_TYPES}
                fitKey={`apps:${apps.length}:${channels.length}:${layout}`}
                initialBounds={initialBounds}
                label="Rede de apps e canais"
                onNodeClick={(_event, node) => (node.type === "app" ? onOpenApp((node.data as AppNodeData).slug) : node.type === "channel" && onOpenChannel((node.data as ChannelNodeData).slug))}
                onNodeContextMenu={(event, node) => {
                    if (node.type !== "channel") return
                    event.preventDefault()
                    onChannelMenu((node.data as ChannelNodeData).slug)
                }}
            >
                <StatsCard
                    title="Rede"
                    summary={`${plural(apps.length, "app", "apps")} · ${plural(channels.length, "canal", "canais")}`}
                    rows={overviewStatRows({ hub: { label: "Apps", value: apps.length, testId: "stat-apps" }, channels: channels.length, memories, liveCount: live.liveCount })}
                >
                    <ChannelStatList channels={channels} countByChannel={countByChannel} />
                    <StatList title="Por app (alcance)" testId="stats-by-app" items={apps.map((app) => ({ key: app.slug, label: app.name, count: reach.get(app.slug) ?? 0 })).sort((a, b) => b.count - a.count)} />
                </StatsCard>
                <RecenterButton />
            </NetworkCanvas>
        </NetworkLiveProvider>
    )
}
