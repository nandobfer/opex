"use client"

import { useCallback, useMemo } from "react"
import type { Node } from "@xyflow/react"
import type { AgentWrite } from "../../network/network-math"
import type { OverviewLayout } from "../../network/overview-layout"
import type { ConsumptionEvent, NetworkChannel, NetworkMemory } from "../../network/types"
import { useEngramindConsumption, useLiveEffects } from "../../hooks/useEngramindConsumption"
import { ChannelDisplayName } from "./ChannelName"
import type { ChannelNodeData } from "./nodes"
import { StatList, type StatRow } from "./StatsCard"
import { useAgentWrites } from "./useAgentWrites"

/**
 * Peças comuns das duas visões de rede (OPE-129): Agentes x canais (`OverviewView`) e Apps x canais
 * (`AppsOverviewView`). O "hub" é o card ligado aos canais: o agente numa, o app na outra.
 */

const TRAVEL_MS = 900

/** Memórias por canal: ativas (rótulo do card e alcance) e todas, inclusive inativas (tamanho do card). */
export function useChannelCounts(memories: readonly NetworkMemory[]) {
    return useMemo(() => {
        const active = new Map<string, number>()
        const total = new Map<string, number>()
        for (const memory of memories) {
            total.set(memory.channel, (total.get(memory.channel) ?? 0) + 1)
            if (memory.status !== "archived") active.set(memory.channel, (active.get(memory.channel) ?? 0) + 1)
        }
        return { countByChannel: active, totalByChannel: total }
    }, [memories])
}

/** Nodes dos canais da visão (posição e escala do layout; "N na busca" com filtro). */
export function channelNodesOf(input: { channels: readonly NetworkChannel[]; positions: OverviewLayout; countByChannel: ReadonlyMap<string, number>; hitsByChannel: Map<string, number> | null; onChannelMenu: (slug: string) => void }): Node[] {
    const { channels, positions, countByChannel, hitsByChannel, onChannelMenu } = input
    return channels.map((channel) => {
        const hits = hitsByChannel ? (hitsByChannel.get(channel.slug) ?? 0) : null
        const point = positions.channels.get(channel.slug) ?? { x: 0, y: 0 }
        const data: ChannelNodeData = { slug: channel.slug, name: channel.name, count: countByChannel.get(channel.slug) ?? 0, archived: channel.archived, hits, dimmed: hits === 0, onMenu: onChannelMenu, scale: positions.scales.get(`channel:${channel.slug}`), point }
        return { id: `channel:${channel.slug}`, type: "channel", position: point, data }
    })
}

/** Linhas do card de estatísticas: o hub (agentes ou apps), canais, memórias e consumos ao vivo. */
export function overviewStatRows(input: { hub: StatRow; channels: number; memories: readonly NetworkMemory[]; liveCount: number }): StatRow[] {
    const active = input.memories.filter((memory) => memory.status !== "archived").length
    return [
        input.hub,
        { label: "Canais", value: input.channels, testId: "stat-channels" },
        { label: "Memórias ativas", value: active, testId: "stat-active" },
        { label: "Memórias inativas", value: input.memories.length - active, testId: "stat-inactive" },
        { label: "Consumos ao vivo", value: input.liveCount, testId: "stat-live" },
    ]
}

/** Lista "Por canal" do card de estatísticas (nome legível, maior primeiro). */
export function ChannelStatList({ channels, countByChannel }: { channels: readonly NetworkChannel[]; countByChannel: ReadonlyMap<string, number> }) {
    const items = channels.map((channel) => ({ key: channel.slug, label: channel.slug, node: <ChannelDisplayName slug={channel.slug} className="min-w-0 flex-1 text-muted-foreground" />, count: countByChannel.get(channel.slug) ?? 0 })).sort((a, b) => b.count - a.count)
    return <StatList title="Por canal" testId="stats-by-channel" items={items} />
}

export interface HubLinkRef {
    hub: string
    channel: string
}

/**
 * Tempo real da visão: o consumo ao vivo de um agente pulsa o hub dele, manda a partícula pelo link
 * hub → canal e, se entregou memórias, de volta; a memória criada por um agente manda a partícula
 * verde. `hubOf` devolve o hub do agente na visão (`null` = fora da tela: ignorado).
 */
export function useHubLive(input: { hubOf: (agent: string) => string | null; links: readonly HubLinkRef[]; edgeOf: (hub: string, channel: string) => string; nodeKey: (hub: string) => string; channels: readonly NetworkChannel[]; memories: readonly NetworkMemory[] }) {
    const { hubOf, links, edgeOf, nodeKey, channels, memories } = input
    const live = useLiveEffects(null)
    const linked = useCallback((hub: string, channel: string) => links.some((link) => link.hub === hub && link.channel === channel), [links])

    const onConsumption = useCallback(
        (event: ConsumptionEvent) => {
            const hub = hubOf(event.agent)
            if (!hub) return
            live.countEvent()
            const reached = event.channels.filter((slug) => linked(hub, slug))
            const delivered = (event.delivered ?? []).filter((slug) => reached.includes(slug))
            live.pulse([nodeKey(hub)])
            live.travel(reached.map((slug) => ({ edge: edgeOf(hub, slug), reverse: false, tone: "primary" as const, delayMs: 0 })))
            live.pulse(
                reached.map((slug) => `channel:${slug}`),
                TRAVEL_MS,
            )
            live.travel(delivered.map((slug) => ({ edge: edgeOf(hub, slug), reverse: true, tone: "primary" as const, delayMs: TRAVEL_MS + 150 })))
            if (delivered.length) live.pulse([nodeKey(hub)], 2 * TRAVEL_MS + 150)
        },
        [hubOf, linked, nodeKey, edgeOf, live],
    )
    useEngramindConsumption(onConsumption)

    // Memória criada por um agente: pulso no hub, partícula verde até o canal e pulso no canal.
    const channelSlugs = useMemo(() => new Set(channels.map((channel) => channel.slug)), [channels])
    const onWrite = useCallback(
        (writes: AgentWrite[]) => {
            const mine = writes.flatMap((write) => {
                const hub = hubOf(write.agent)
                return hub && channelSlugs.has(write.channel) ? [{ hub, channel: write.channel }] : []
            })
            if (!mine.length) return
            live.pulse([...new Set(mine.map((write) => nodeKey(write.hub)))])
            const withLink = mine.filter((write) => linked(write.hub, write.channel))
            live.travel(withLink.map((write) => ({ edge: edgeOf(write.hub, write.channel), reverse: false, tone: "success" as const, delayMs: 0 })))
            live.pulse([...new Set(mine.map((write) => `channel:${write.channel}`))], withLink.length ? TRAVEL_MS : 0)
        },
        [hubOf, channelSlugs, linked, nodeKey, edgeOf, live],
    )
    useAgentWrites(memories, onWrite)

    const value = useMemo(() => ({ pulses: live.pulses, travels: live.travels, finish: live.finish }), [live.pulses, live.travels, live.finish])
    return { value, liveCount: live.liveCount }
}
