"use client"

import { useEffect } from "react"
import { useReactFlow } from "@xyflow/react"
import { AnimatePresence, useReducedMotion } from "framer-motion"
import type { Point } from "../../network/network-math"
import type { ParticleVisual } from "../../network/particles"
import type { NetworkMemory } from "../../network/types"
import type { MemoryCardActions } from "./MemoryCard"
import { MemoryCardLayer } from "./MemoryCardLayer"
import { FIT_DURATION_MS } from "./NetworkCanvas"
import { CARD_MIN_ZOOM } from "./MemoryNode"
import { useZoom } from "./nodes"

/**
 * Card da memória ativa na camada sem zoom (filho do React Flow): a partícula vira o card a partir
 * do zoom `CARD_MIN_ZOOM`; afastada demais, só a partícula se destaca. Clique/toque (`pinned`) com o
 * zoom afastado aproxima até `CARD_MIN_ZOOM`, centralizado na partícula, e o card abre.
 */
export function ActiveMemoryCard({
    memory,
    visual,
    point,
    channelColors,
    actions,
    hoverCard,
    pinned = false,
}: {
    memory: NetworkMemory | null
    visual?: ParticleVisual
    point?: Point
    channelColors?: Map<string, string>
    actions: MemoryCardActions
    hoverCard: (id: string | null) => void
    /** A memória ativa foi fixada por clique/toque (não só o hover). */
    pinned?: boolean
}) {
    const zoom = useZoom()
    const flow = useReactFlow()
    const reducedMotion = useReducedMotion()
    const pinnedId = pinned && memory ? memory.id : null
    useEffect(() => {
        if (!pinnedId || !point || zoom >= CARD_MIN_ZOOM) return
        void flow.setCenter(point.x, point.y, { zoom: CARD_MIN_ZOOM, duration: reducedMotion ? 0 : FIT_DURATION_MS })
        // Só ao fixar (o zoom que o usuário muda depois não puxa a rede de volta).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pinnedId])
    const open = memory && visual && point && zoom >= CARD_MIN_ZOOM
    return (
        <AnimatePresence>
            {open && (
                <MemoryCardLayer key={memory.id} memory={memory} visual={visual} point={point} actions={actions} channelColor={channelColors?.get(memory.channel)} onPointerEnter={() => hoverCard(memory.id)} onPointerLeave={() => hoverCard(null)} />
            )}
        </AnimatePresence>
    )
}
