"use client"

import { AnimatePresence } from "framer-motion"
import type { Point } from "../../network/network-math"
import type { ParticleVisual } from "../../network/particles"
import type { NetworkMemory } from "../../network/types"
import type { MemoryCardActions } from "./MemoryCard"
import { MemoryCardLayer } from "./MemoryCardLayer"
import { CARD_MIN_ZOOM } from "./MemoryNode"
import { useZoom } from "./nodes"

/**
 * Card da memória ativa na camada sem zoom (filho do React Flow): a partícula vira o card a partir
 * do zoom `CARD_MIN_ZOOM`; afastada demais, só a partícula se destaca.
 */
export function ActiveMemoryCard({
    memory,
    visual,
    point,
    channelColors,
    actions,
    hoverCard,
}: {
    memory: NetworkMemory | null
    visual?: ParticleVisual
    point?: Point
    channelColors?: Map<string, string>
    actions: MemoryCardActions
    hoverCard: (id: string | null) => void
}) {
    const zoom = useZoom()
    const open = memory && visual && point && zoom >= CARD_MIN_ZOOM
    return (
        <AnimatePresence>
            {open && (
                <MemoryCardLayer key={memory.id} memory={memory} visual={visual} point={point} actions={actions} channelColor={channelColors?.get(memory.channel)} onPointerEnter={() => hoverCard(memory.id)} onPointerLeave={() => hoverCard(null)} />
            )}
        </AnimatePresence>
    )
}
