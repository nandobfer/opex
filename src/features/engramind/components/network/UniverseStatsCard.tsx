"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { universeStats } from "../../network/network-math"
import type { ParticleVisual } from "../../network/particles"
import type { MemoryUsageMap, NetworkMemory } from "../../network/types"
import { ChannelName } from "./ChannelName"
import { StatList, StatsCard, type StatRow } from "./StatsCard"

/** Estatísticas do universo (canal ou agente); no do agente, a legenda "Por canal" com a cor de cada um. */
export function UniverseStatsCard({
    kind,
    memories,
    visuals,
    usage,
    subscribers,
    liveCount,
    channelColors,
}: {
    kind: "channel" | "agent"
    memories: NetworkMemory[]
    visuals: Map<string, ParticleVisual>
    usage?: MemoryUsageMap
    subscribers?: number
    liveCount: number
    channelColors?: Map<string, string>
}) {
    const brightness = useMemo(() => new Map([...visuals].map(([id, visual]) => [id, visual.brightness])), [visuals])
    const stats = universeStats(memories, brightness, usage)
    const rows: StatRow[] = [
        { label: "Ativas", value: stats.active, testId: "stat-active" },
        { label: "Inativas", value: stats.inactive, testId: "stat-inactive" },
        { label: "Fixadas", value: stats.pinned, testId: "stat-pinned" },
        { label: "Consultas + injeções", value: stats.uses, testId: "stat-uses" },
        { label: "Última consulta", value: stats.lastUse ? format(new Date(stats.lastUse), "dd/MM HH:mm", { locale: ptBR }) : "nunca", testId: "stat-last-use" },
        ...(typeof subscribers === "number" ? [{ label: "Assinantes", value: subscribers, testId: "stat-subscribers" }] : []),
        { label: "Esquecidas (cinza)", value: stats.forgotten, testId: "stat-forgotten" },
        ...(liveCount ? [{ label: "Consumos ao vivo", value: liveCount, testId: "stat-live" }] : []),
    ]
    return (
        <StatsCard title={kind === "agent" ? "Universo do agente" : "Universo do canal"} rows={rows} summary={`${memories.length} ${memories.length === 1 ? "memória" : "memórias"}`}>
            {kind === "agent" && (
                <StatList
                    title="Por canal"
                    testId="channel-legend"
                    colors={channelColors}
                    items={stats.byChannel.map((item) => ({ key: item.slug, label: item.slug, count: item.count, node: <ChannelName slug={item.slug} size="legend" className="flex-1" titleClassName="text-muted-foreground" /> }))}
                />
            )}
        </StatsCard>
    )
}
