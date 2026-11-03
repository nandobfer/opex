"use client"

import { useCallback, useMemo } from "react"
import type { Edge, Node } from "@xyflow/react"
import { agentReach } from "../../network/network-math"
import { layoutOverview, OVERVIEW_LINK_BEND, overviewInitialBounds, type OverviewLayoutMode } from "../../network/overview-layout"
import type { NetworkAgent, NetworkChannel, NetworkLink, NetworkMemory } from "../../network/types"
import { NetworkLiveProvider } from "./live"
import { NetworkCanvas } from "./NetworkCanvas"
import { AgentNode, ChannelNode, type AgentNodeData, type ChannelNodeData } from "./nodes"
import { RecenterButton } from "./RecenterButton"
import { StatList, StatsCard } from "./StatsCard"
import { channelNodesOf, ChannelStatList, overviewStatRows, useChannelCounts, useHubLive } from "./overview-shared"
import { useStable } from "./useStableNodes"
import { useAgentActivity } from "../../hooks/useAgentActivity"
import { OPEX_APP_SLUG } from "../../constants"

const NODE_TYPES = { agent: AgentNode, channel: ChannelNode }

export interface OverviewViewProps {
    /** Agentes do app aberto (OPE-129: a visão é sempre de um app). */
    agents: NetworkAgent[]
    /** Canais ligados aos agentes do app, já sem os vazios. */
    channels: NetworkChannel[]
    /** Canais do app sem memórias: fora da rede, acessíveis pelo menu do card de estatísticas. */
    emptyChannels?: NetworkChannel[]
    links: NetworkLink[]
    memories: NetworkMemory[]
    /** Todas as memórias da rede (criações por agente: a partícula verde não depende dos filtros da visão). */
    allMemories?: NetworkMemory[]
    /** Título do card de estatísticas (o nome do app). */
    title?: string
    /** Distribuição da visão (escolhida no card "O que é o Engramind"; guardada no navegador). */
    layout: OverviewLayoutMode
    /** Busca/filtros: memórias que casam por canal (`null` = sem filtro). */
    hitsByChannel: Map<string, number> | null
    onOpenAgent: (agent: string) => void
    onOpenChannel: (slug: string) => void
    onChannelMenu: (slug: string) => void
}

/** Ids das arestas agente → canal (um link por canal casado). */
export const linkEdgeId = (agent: string, channel: string) => `${agent}→${channel}`
const agentNodeKey = (agent: string) => `agent:${agent}`

/**
 * Visão Agentes x canais de um app (aberta pela visão inicial Apps x canais, OPE-129): os agentes do
 * app e os canais que eles assinam, na distribuição escolhida no card "O que é o Engramind" (Órbita ou
 * Radial), com os cards pelo tamanho. O consumo ao vivo de um agente pulsa o agente, manda a
 * partícula ao canal e, se ele entregou memórias, de volta ao agente.
 */
export function OverviewView({ agents, channels, emptyChannels = [], links, memories, allMemories, title = "Rede", layout, hitsByChannel, onOpenAgent, onOpenChannel, onChannelMenu }: OverviewViewProps) {
    const agentIds = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents])
    const visibleLinks = useMemo(() => links.filter((link) => agentIds.has(link.agent)), [links, agentIds])
    const { countByChannel, totalByChannel } = useChannelCounts(memories)
    const reach = useMemo(() => agentReach(visibleLinks, countByChannel), [visibleLinks, countByChannel])
    const positions = useMemo(() => layoutOverview({ agents, channels, links: visibleLinks, agentCounts: reach, channelCounts: totalByChannel, mode: layout }), [agents, channels, visibleLinks, reach, totalByChannel, layout])
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

    const hubOf = useCallback((agent: string) => (agentIds.has(agent) ? agent : null), [agentIds])
    const hubLinks = useMemo(() => visibleLinks.map((link) => ({ hub: link.agent, channel: link.channel })), [visibleLinks])
    const live = useHubLive({ hubOf, links: hubLinks, edgeOf: linkEdgeId, nodeKey: agentNodeKey, channels, memories: allMemories ?? memories })

    const nodes = useMemo<Node[]>(() => {
        const list: Node[] = agents.map((agent) => {
            const point = positions.agents.get(agent.id) ?? { x: 0, y: 0 }
            const data: AgentNodeData = { id: agent.id, name: agent.name, app: agent.app, written: writtenOf(agent.id), reachable: reach.get(agent.id) ?? 0, scale: positions.scales.get(`agent:${agent.id}`), point }
            return { id: agentNodeKey(agent.id), type: "agent", position: point, data }
        })
        return [...list, ...channelNodesOf({ channels, positions, countByChannel, hitsByChannel, onChannelMenu })]
    }, [agents, channels, positions, hitsByChannel, countByChannel, onChannelMenu, writtenOf, reach])

    const edges = useMemo<Edge[]>(
        () =>
            // Links vizinhos do mesmo canal curvam para lados alternados (não se sobrepõem por inteiro).
            visibleLinks.map((link, index) => ({
                id: linkEdgeId(link.agent, link.channel),
                source: agentNodeKey(link.agent),
                target: `channel:${link.channel}`,
                type: "link",
                data: { mode: link.mode, dimmed: hitsByChannel ? !hitsByChannel.get(link.channel) : false, bend: index % 2 ? -OVERVIEW_LINK_BEND : OVERVIEW_LINK_BEND },
            })),
        [visibleLinks, hitsByChannel],
    )
    const stableNodes = useStable(nodes)
    const stableEdges = useStable(edges)

    return (
        <NetworkLiveProvider value={live.value}>
            <NetworkCanvas
                nodes={stableNodes}
                edges={stableEdges}
                nodeTypes={NODE_TYPES}
                fitKey={`overview:${agents.length}:${channels.length}:${layout}`}
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
                    title={title}
                    summary={`${agents.length} ${agents.length === 1 ? "agente" : "agentes"} · ${channels.length} ${channels.length === 1 ? "canal" : "canais"}`}
                    rows={overviewStatRows({ hub: { label: "Agentes", value: agents.length, testId: "stat-agents" }, channels: channels.length, memories, liveCount: live.liveCount })}
                >
                    <ChannelStatList channels={channels} countByChannel={countByChannel} emptyChannels={emptyChannels} onOpenChannel={onChannelMenu} />
                    <StatList title="Por agente (alcance)" testId="stats-by-agent" items={agents.map((agent) => ({ key: agent.id, label: agent.name, count: reach.get(agent.id) ?? 0 })).sort((a, b) => b.count - a.count)} />
                </StatsCard>
                <RecenterButton />
            </NetworkCanvas>
        </NetworkLiveProvider>
    )
}
