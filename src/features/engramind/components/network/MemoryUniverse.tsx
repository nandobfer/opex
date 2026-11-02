"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Edge, Node } from "@xyflow/react"
import { Hash, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { agentWritesOf, layoutUniverse, orbitLinkTone, universeChannelColors } from "../../network/network-math"
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
import { useLeavingItems } from "./useLeavingItems"
import type { LocalRemovals } from "./useLocalRemovals"

const NODE_TYPES = { center: CenterNode, memory: MemoryNode }
const CENTER_ID = "center"
/** Atraso entre o nascimento da memória criada pelo agente do centro e a partícula verde. */
const AUTHORED_TRAVEL_DELAY_MS = 300

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
    /** Cor estável de cada canal (universo do agente); o universo marca o maior canal com o roxo primário. */
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
    /** Remoções confirmadas nesta tela (sem o aviso de "outra origem" quando a memória aberta sai). */
    localRemovals?: LocalRemovals
}

/**
 * Universo de um canal ou de um agente (OPE-109): o node central e uma partícula por memória, em
 * órbitas (mais novas mais perto), com a cor do canal (o com mais memórias no roxo primário), tamanho pelo
 * uso e brilho pelo último uso. Clique ou toque abre o card (passar o mouse só afasta as vizinhas); o
 * consumo ao vivo pulsa a memória e manda uma partícula ao centro. Links ao centro em roxo; no universo
 * do agente, verdes nas memórias que ele escreveu (OPE-113).
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
    localRemovals,
}: MemoryUniverseProps) {
    const live = useLiveEffects(dataVersion)
    // O card abre só por clique/toque (`opened`); o cursor (`hovered`) só afasta as vizinhas.
    const [hovered, setHovered] = useState<string | null>(null)
    const [opened, setOpened] = useState<string | null>(null)
    const ids = useMemo(() => new Set(memories.map((memory) => memory.id)), [memories])
    const openRef = useRef<(string | null)[]>([])
    const items = useLeavingItems(memories, (removed) => {
        // Memória aberta que sumiu por outra origem (excluída ou movida): o card fecha com aviso.
        if (removed.some((id) => openRef.current.includes(id) && !localRemovals?.has(id))) toast.info("A memória aberta foi excluída ou movida por outra origem.")
        for (const id of removed) localRemovals?.forget(id)
    })

    const memoryIds = useMemo(() => memories.map((memory) => memory.id), [memories])
    const { pulse, travel } = live
    const authoredBy = center.kind === "agent" ? center.id : null
    const byIdRef = useRef(new Map<string, NetworkMemory>())
    useEffect(() => {
        byIdRef.current = new Map(memories.map((memory) => [memory.id, memory]))
    })
    const entering = useEnteringIds(memoryIds, {
        isProvisional,
        onEnter: (fresh) => {
            pulse(fresh.map((id) => `memory:${id}`))
            // Universo do agente: a memória que ele acabou de criar recebe a partícula verde do centro.
            if (!authoredBy) return
            const writes = agentWritesOf(fresh, [...byIdRef.current.values()]).filter((write) => write.agent === authoredBy)
            travel(writes.map((write) => ({ edge: `orbit:${write.id}`, reverse: true, tone: "success" as const, delayMs: AUTHORED_TRAVEL_DELAY_MS })))
        },
    })

    const particleColors = useMemo(() => universeChannelColors(channelColors, memories), [channelColors, memories])
    // Legenda e selo do card com a cor do canal: só no universo do agente. Os links ao centro não usam a
    // cor do canal (OPE-113): roxo primário, verde nas memórias que o agente do centro escreveu.
    const legendColors = center.kind === "agent" ? particleColors : undefined
    const visuals = useMemo(() => buildParticles(memories, { channelColors: particleColors, usage, staleAfterDays, bumps: live.bumps }), [memories, particleColors, usage, staleAfterDays, live.bumps])
    const positions = useMemo(() => layoutUniverse(items), [items])
    // Só vale o que ainda está no universo: a memória que saiu fecha o card sozinha.
    const openId = opened !== null && ids.has(opened) ? opened : null
    const focusId = openId ?? (hovered !== null && ids.has(hovered) ? hovered : null)
    useEffect(() => {
        openRef.current = [opened]
    }, [opened])

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

    const wrapped = actions

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
            const visual = visuals.get(memory.id) ?? buildParticles([memory], { channelColors: particleColors, usage, staleAfterDays }).get(memory.id)
            const point = positions.get(memory.id) ?? { x: 0, y: 0 }
            if (!visual) continue
            const data: MemoryNodeData = { memory, visual, point, matched: isMatch ? isMatch(memory) : null, leaving: memory.leaving, entering: entering.has(memory.id) }
            list.push({ id: memory.id, type: "memory", position: point, data, zIndex: focusId === memory.id ? 20 : 1 })
        }
        return list
    }, [items, visuals, positions, isMatch, particleColors, focusId, center, memories.length, usage, staleAfterDays, entering])

    const edges = useMemo<Edge[]>(
        () =>
            items.map((memory) => ({
                id: `orbit:${memory.id}`,
                source: memory.id,
                target: CENTER_ID,
                type: "orbit",
                data: { tone: orbitLinkTone(memory, { kind: center.kind, id: center.id }), dimmed: isMatch ? !isMatch(memory) : false, entering: entering.has(memory.id) },
            })),
        [items, center.kind, center.id, isMatch, entering],
    )


    const hover = useCallback((id: string | null) => setHovered(id), [])
    const focus = useMemo(() => ({ openId, focusId, focusPoint: focusId ? (positions.get(focusId) ?? null) : null, hover, actions: wrapped }), [openId, focusId, positions, hover, wrapped])
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
                    onNodeClick={(_event, node) => node.type === "memory" && setOpened((current) => (current === node.id ? null : node.id))}
                    onPaneClick={() => setOpened(null)}
                    className={className}
                >
                    <UniverseStatsCard kind={center.kind} memories={memories} visuals={visuals} usage={usage} subscribers={subscribers} liveCount={live.liveCount} channelColors={legendColors} />
                    <ActiveMemoryCard
                        memory={openId ? (memories.find((memory) => memory.id === openId) ?? null) : null}
                        visual={openId ? visuals.get(openId) : undefined}
                        point={openId ? positions.get(openId) : undefined}
                        channelColors={legendColors}
                        actions={wrapped}
                        pinned={openId !== null}
                    />
                    <RecenterButton />
                    <UniversePanels count={memories.length} onCreate={onCreate} createLabel={createLabel} emptyTitle={emptyTitle} />
                </NetworkCanvas>
            </UniverseFocusContext.Provider>
        </NetworkLiveProvider>
    )
}
