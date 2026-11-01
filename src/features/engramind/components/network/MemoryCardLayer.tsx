"use client"

import { useEffect, useRef, useState } from "react"
import { useStore } from "@xyflow/react"
import { motion, useReducedMotion } from "framer-motion"
import { clampCardRect, memoryCardSize, type Point } from "../../network/network-math"
import type { ParticleVisual } from "../../network/particles"
import type { NetworkMemory } from "../../network/types"
import { MemoryCard, type MemoryCardActions } from "./MemoryCard"

/** Largura fixa do card (`w-72`): não depende do zoom da rede. */
export const MEMORY_CARD_WIDTH = 288
/** Altura estimada até a primeira medição. */
const MEMORY_CARD_ESTIMATED_HEIGHT = 300
export const MEMORY_CARD_MORPH_S = 0.22

/**
 * Card da memória numa camada FORA da área com zoom (filho do React Flow, irmão do viewport): tem
 * sempre o mesmo tamanho e fonte, fica inteiro dentro do quadro (`clampCardRect`) e acompanha o
 * arrastar e o zoom. Abre se transformando a partir da partícula (mesmo lugar, tamanho e cor na
 * tela) e fecha encolhendo de volta para ela; com movimento reduzido, a troca é instantânea.
 */
export function MemoryCardLayer({
    memory,
    visual,
    point,
    actions,
    channelColor,
    onPointerEnter,
    onPointerLeave,
}: {
    memory: NetworkMemory
    visual: ParticleVisual
    /** Posição da partícula na rede (coordenadas do React Flow). */
    point: Point
    actions: MemoryCardActions
    channelColor?: string
    onPointerEnter: () => void
    onPointerLeave: () => void
}) {
    const reducedMotion = useReducedMotion()
    const tx = useStore((state) => state.transform[0])
    const ty = useStore((state) => state.transform[1])
    const zoom = useStore((state) => state.transform[2])
    const canvasWidth = useStore((state) => state.width)
    const canvasHeight = useStore((state) => state.height)
    const ref = useRef<HTMLDivElement>(null)
    // Card que sai sem o cursor ter saído dele (fechado por clique fora, memória removida): a
    // presença do card é desligada para não segurar o próximo hover.
    const leaveRef = useRef(onPointerLeave)
    useEffect(() => {
        leaveRef.current = onPointerLeave
    })
    useEffect(() => () => leaveRef.current(), [])
    const [height, setHeight] = useState(MEMORY_CARD_ESTIMATED_HEIGHT)
    const [settled, setSettled] = useState(false)

    // A altura real do conteúdo (texto, selos) entra assim que é medida.
    useEffect(() => {
        const element = ref.current
        if (!element || typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(() => {
            const measured = element.scrollHeight
            if (measured > 0) setHeight((current) => (Math.abs(current - measured) > 1 ? measured : current))
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const anchor = { x: point.x * zoom + tx, y: point.y * zoom + ty }
    // Limitado ao quadro (8 px de cada lado): texto longo rola dentro do card, quadro estreito encolhe a largura.
    const { width, height: visibleHeight } = memoryCardSize({ width: MEMORY_CARD_WIDTH, height }, { width: canvasWidth, height: canvasHeight })
    const target = clampCardRect(anchor, { width, height: visibleHeight }, { width: canvasWidth || width + 16, height: canvasHeight || visibleHeight + 16 })
    const particle = Math.max(visual.size * zoom, 6)
    const asParticle = { left: anchor.x - particle / 2, top: anchor.y - particle / 2, width: particle, height: particle, borderRadius: particle / 2 }
    const asCard = { left: target.x, top: target.y, width, height: visibleHeight, borderRadius: 12 }
    const morph = { duration: reducedMotion ? 0 : MEMORY_CARD_MORPH_S, ease: "easeOut" as const }
    // Depois de aberto, a posição segue o arrastar/zoom na hora (sem transição atrasada).
    const follow = settled || reducedMotion ? { duration: 0 } : morph

    return (
        <motion.div
            role="dialog"
            aria-label={`Memória ${memory.title}`}
            data-testid={`memory-card-${memory.id}`}
            data-card-width={width}
            data-card-height={visibleHeight}
            data-network-card=""
            className="nodrag nopan nowheel pointer-events-auto absolute z-30 cursor-default overflow-hidden border bg-popover text-popover-foreground shadow-xl"
            initial={reducedMotion ? { ...asCard, opacity: 0 } : { ...asParticle, opacity: 1 }}
            animate={{ ...asCard, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { ...asParticle, opacity: 0, transition: morph }}
            transition={{ ...morph, left: follow, top: follow, height: settled ? { duration: 0.12 } : morph }}
            onAnimationComplete={() => setSettled(true)}
            onPointerEnter={(event) => event.pointerType !== "touch" && onPointerEnter()}
            onPointerLeave={(event) => event.pointerType !== "touch" && onPointerLeave()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            {/* A cor da partícula some enquanto a forma cresce: a partícula "vira" o card. */}
            <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: visual.archived ? "transparent" : visual.color }}
                initial={{ opacity: reducedMotion ? 0 : 1 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 1 }}
                transition={morph}
            />
            <div className="relative h-full overflow-y-auto overscroll-contain" data-testid="memory-card-scroll">
                <div ref={ref} style={{ width }}>
                    <MemoryCard memory={memory} visual={visual} actions={actions} channelColor={channelColor} contentDelay={reducedMotion ? 0 : MEMORY_CARD_MORPH_S * 0.7} />
                </div>
            </div>
        </motion.div>
    )
}
