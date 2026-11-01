"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Edge, Node } from "@xyflow/react"
import { Hash, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { layoutUniverse } from "../../network/network-math"
import { buildParticles } from "../../network/particles"
import type { ConsumptionEvent, MemoryUsageMap, NetworkMemory } from "../../network/types"
import { useEngramindConsumption, useLiveEffects } from "../../hooks/useEngramindConsumption"
import { ActiveMemoryCard } from "./ActiveMemoryCard"
import { agentIcon } from "./agent-icons"
import { NetworkLiveProvider } from "./live"
import type { MemoryCardActions } from "./MemoryCard"
import { MemoryNode, UniverseFocusContext, type MemoryNodeData } from "./MemoryNode"
import { NetworkCanvas } from "./NetworkCanvas"
import { CenterNode, type CenterNodeData } from "./nodes"
import { RecenterButton } from "./RecenterButton"
import { UniversePanels } from "./UniversePanels"
import { UniverseStatsCard } from "./UniverseStatsCard"
import { useEnteringIds } from "./useEnteringIds"
import { useHoverPresence } from "./useHoverPresence"
import { useLeavingItems } from "./useLeavingItems"

const NODE_TYPES = { center: CenterNode, memory: MemoryNode }
const CENTER_ID = "center"
export { HOVER_CLOSE_DELAY_MS } from "./useHoverPresence"

export interface UniverseCenter {
    kind: "channel" | "agent"
    /** Slug do canal ou `app/agente`. */
    id: string
    label: string
    archived?: boolean
}

export interface MemoryUniverseProps {
    center: UniverseCenter
    memories: NetworkMemory[]
    usage?: MemoryUsageMap
    staleAfterDays: number
    /** Cor de cada canal (universo do agente: links e legenda). */
    channelColors?: Map<string, string>
    /** Destaque da busca/filtros (`null` = sem filtro). */
    isMatch?: ((memory: NetworkMemory) => boolean) | null
    actions: MemoryCardActions
    /** Assinantes do canal (universo do canal). */
    subscribers?: number
    /** Releitura dos dados: zera o crescimento local do consumo ao vivo. */
    dataVersion?: number
    onCreate?: (() => void) | null
    /** Botão de criar no canto (universo com memórias); vazio mostra a ação no estado vazio. */
    createLabel?: string
    emptyTitle?: string
    className?: string
    /** Memória provisória da lista otimista (`pendente-…`): a definitiva que a substitui não nasce de novo. */
    isProvisional?: (id: string) => boolean
}

/**
 * Universo de um canal ou de um agente (OPE-109): o node central e uma partícula por memória, em
 * órbitas (mais usadas mais perto), com cor pela idade, tamanho pelo uso e brilho pelo último uso.
 * Hover ou toque abre o card; o consumo ao vivo pulsa a memória e manda uma partícula ao centro.
 */
export function MemoryUniverse({
    center,
    memories,
    usage,
    staleAfterDays,
    channelColors,
    isMatch = null,
    actions,
    subscribers,
    dataVersion,
    onCreate,
    createLabel,
    emptyTitle = "Nenhuma memória neste universo",
    className,
    isProvisional,
}: MemoryUniverseProps) {
    const live = useLiveEffects(dataVersion)
    const { hovered, hover, hoverCard } = useHoverPresence()
    const [pinned, setPinned] = useState<string | null>(null)
    const localRemovals = useRef(new Set<string>())
    const ids = useMemo(() => new Set(memories.map((memory) => memory.id)), [memories])
    const openRef = useRef<(string | null)[]>([])
    const items = useLeavingItems(memories, (removed) => {
        // Memória aberta que sumiu por outra origem (excluída ou movida): o card fecha com aviso.
        if (removed.some((id) => openRef.current.includes(id) && !localRemovals.current.has(id))) toast.info("A memória aberta foi excluída ou movida por outra origem.")
    })

    const memoryIds = useMemo(() => memories.map((memory) => memory.id), [memories])
    const pulse = live.pulse
    const entering = useEnteringIds(memoryIds, { isProvisional, onEnter: (fresh) => pulse(fresh.map((id) => `memory:${id}`)) })

    const visuals = useMemo(() => buildParticles(memories, { usage, staleAfterDays, bumps: live.bumps }), [memories, usage, staleAfterDays, live.bumps])
    const positions = useMemo(() => layoutUniverse(items), [items])
    // Só vale o que ainda está no universo: a memória que saiu fecha o card sozinha.
    const activeId = [pinned, hovered].find((id) => id !== null && ids.has(id)) ?? null
    useEffect(() => {
        openRef.current = [pinned, hovered]
    }, [pinned, hovered])

    const onConsumption = useCallback(
        (event: ConsumptionEvent) => {
            const mine = event.memoryIds.filter((id) => ids.has(id))
            if (!mine.length) return
            live.countEvent()
            live.bump(mine)
            live.pulse(mine.map((id) => `memory:${id}`))
            live.travel(mine.slice(0, 20).map((id) => ({ edge: `orbit:${id}`, reverse: false, tone: "white" as const, delayMs: 150 })))
            live.pulse([`${center.kind}:${center.id}`], 1000)
        },
        [ids, live, center.kind, center.id],
    )
    useEngramindConsumption(onConsumption)

    const wrapped = useMemo<MemoryCardActions>(
        () => ({
            ...actions,
            onDelete: (memory) => {
                localRemovals.current.add(memory.id)
                actions.onDelete(memory)
            },
            onMove: actions.onMove
                ? (memory) => {
                      localRemovals.current.add(memory.id)
                      actions.onMove?.(memory)
                  }
                : undefined,
        }),
        [actions],
    )

    const nodes = useMemo<Node[]>(() => {
        const centerData: CenterNodeData = {
            label: center.label,
            detail: `${memories.length} ${memories.length === 1 ? "memória" : "memórias"}`,
            icon: center.kind === "agent" ? agentIcon(center.id) : (Hash as LucideIcon),
            pulseKey: `${center.kind}:${center.id}`,
            archived: center.archived,
            channelSlug: center.kind === "channel" ? center.id : undefined,
        }
        const list: Node[] = [{ id: CENTER_ID, type: "center", position: { x: 0, y: 0 }, data: centerData, zIndex: 5 }]
        for (const memory of items) {
            const visual = visuals.get(memory.id) ?? buildParticles([memory], { usage, staleAfterDays }).get(memory.id)
            const point = positions.get(memory.id) ?? { x: 0, y: 0 }
            if (!visual) continue
            const data: MemoryNodeData = { memory, visual, point, matched: isMatch ? isMatch(memory) : null, channelColor: channelColors?.get(memory.channel), leaving: memory.leaving, entering: entering.has(memory.id) }
            list.push({ id: memory.id, type: "memory", position: point, data, zIndex: activeId === memory.id ? 20 : 1 })
        }
        return list
    }, [items, visuals, positions, isMatch, channelColors, activeId, center, memories.length, usage, staleAfterDays, entering])

    const edges = useMemo<Edge[]>(
        () =>
            items.map((memory) => ({
                id: `orbit:${memory.id}`,
                source: memory.id,
                target: CENTER_ID,
                type: "orbit",
                data: { color: channelColors?.get(memory.channel), dimmed: isMatch ? !isMatch(memory) : false, entering: entering.has(memory.id) },
            })),
        [items, channelColors, isMatch, entering],
    )


    const focus = useMemo(() => ({ activeId, activePoint: activeId ? (positions.get(activeId) ?? null) : null, hover, actions: wrapped }), [activeId, positions, hover, wrapped])
    const liveValue = useMemo(() => ({ pulses: live.pulses, travels: live.travels, finish: live.finish }), [live.pulses, live.travels, live.finish])

    return (
        <NetworkLiveProvider value={liveValue}>
            <UniverseFocusContext.Provider value={focus}>
                <NetworkCanvas
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    fitKey={`${center.kind}:${center.id}:${memories.length === 0 ? "empty" : "full"}`}
                    label={center.kind === "agent" ? `Universo do agente ${center.label}` : `Universo do canal ${center.label}`}
                    onNodeClick={(_event, node) => node.type === "memory" && setPinned((current) => (current === node.id ? null : node.id))}
                    onPaneClick={() => setPinned(null)}
                    className={className}
                >
                    <UniverseStatsCard kind={center.kind} memories={memories} visuals={visuals} usage={usage} subscribers={subscribers} liveCount={live.liveCount} channelColors={channelColors} />
                    <ActiveMemoryCard
                        memory={activeId ? (memories.find((memory) => memory.id === activeId) ?? null) : null}
                        visual={activeId ? visuals.get(activeId) : undefined}
                        point={activeId ? positions.get(activeId) : undefined}
                        channelColors={channelColors}
                        actions={wrapped}
                        hoverCard={hoverCard}
                    />
                    <RecenterButton />
                    <UniversePanels count={memories.length} onCreate={onCreate} createLabel={createLabel} emptyTitle={emptyTitle} />
                </NetworkCanvas>
            </UniverseFocusContext.Provider>
        </NetworkLiveProvider>
    )
}
