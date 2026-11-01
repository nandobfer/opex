"use client"

import { createContext, memo, useContext, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Node, NodeProps } from "@xyflow/react"
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { repelOffset, type Point } from "../../network/network-math"
import type { ParticleVisual } from "../../network/particles"
import type { NetworkMemory } from "../../network/types"
import { PulseRing } from "./live"
import type { MemoryCardActions } from "./MemoryCard"
import { CenterHandles, LABEL_MIN_ZOOM, useZoom } from "./nodes"

/** Zoom mínimo para o card abrir (visão afastada demais só destaca a partícula). */
export const CARD_MIN_ZOOM = 0.6

interface UniverseFocus {
    activeId: string | null
    activePoint: Point | null
    hover: (id: string | null) => void
    actions: MemoryCardActions
}

export const UniverseFocusContext = createContext<UniverseFocus | null>(null)

export type MemoryNodeData = {
    memory: NetworkMemory
    visual: ParticleVisual
    point: Point
    /** `false` = apagada pela busca/filtros; `null` = sem filtro. */
    matched: boolean | null
    channelColor?: string
    leaving?: boolean
    /** Memória que acabou de chegar: nasce do centro com o link se desenhando. */
    entering?: boolean
}

/** Partícula: nasce do centro do universo (memória nova), desliza quando a órbita muda e some (opacidade 0) enquanto vira o card. */
export const MemoryNode = memo(function MemoryNode({ data }: NodeProps<Node<MemoryNodeData, "memory">>) {
    const focus = useContext(UniverseFocusContext)
    const zoom = useZoom()
    const reducedMotion = useReducedMotion()
    const { memory, visual, point } = data
    const isActive = focus?.activeId === memory.id
    const expanded = isActive && zoom >= CARD_MIN_ZOOM
    const offset = !isActive && focus?.activePoint ? repelOffset(point, focus.activePoint) : { x: 0, y: 0 }
    const glow = visual.archived ? 0 : Math.round(4 + 14 * visual.brightness)
    const dimmed = data.matched === false
    const ready = useAfterMeasure()
    const slide = useOrbitSlide(point, reducedMotion === true)
    // Nascimento: começa no centro (0,0 da rede), invisível e sem tamanho, até a própria órbita.
    const born = data.entering && !reducedMotion
    const hidden = { scale: 0, opacity: 0, x: born ? -point.x : 0, y: born ? -point.y : 0 }
    const shown = { scale: data.leaving ? 0 : isActive && !expanded ? 1.35 : 1, opacity: data.leaving || expanded ? 0 : dimmed ? 0.18 : 1, x: offset.x, y: offset.y }
    return (
        <motion.div style={{ x: slide.x, y: slide.y }} className="relative">
            <motion.div
                data-testid={`memory-node-${memory.id}`}
                data-brightness={visual.brightness}
                data-pinned={visual.pinned || undefined}
                data-archived={visual.archived || undefined}
                data-expanded={expanded || undefined}
                data-entering={data.entering || undefined}
                data-matched={data.matched === null ? undefined : String(data.matched)}
                className="relative"
                initial={hidden}
                animate={ready ? shown : hidden}
                transition={born ? { type: "spring", stiffness: 140, damping: 18, mass: 0.9 } : { duration: expanded ? 0.12 : 0.22 }}
                onMouseEnter={() => focus?.hover(memory.id)}
                onMouseLeave={() => focus?.hover(null)}
            >
                <span
                    aria-label={memory.title}
                    className={cn("relative block cursor-pointer rounded-full", visual.pinned && "ring-2 ring-primary ring-offset-1 ring-offset-background", visual.archived && "border border-dashed border-muted-foreground bg-transparent")}
                    style={{ width: visual.size, height: visual.size, background: visual.archived ? "transparent" : visual.color, boxShadow: glow ? `0 0 ${glow}px ${visual.color}` : "none" }}
                >
                    <PulseRing nodeKey={`memory:${memory.id}`} />
                    <CenterHandles />
                </span>
                {zoom >= LABEL_MIN_ZOOM * 2 && !isActive && <span className="pointer-events-none absolute left-1/2 top-full mt-1 w-28 -translate-x-1/2 truncate text-center text-[9px] text-muted-foreground">{memory.title}</span>}
            </motion.div>
        </motion.div>
    )
})

/**
 * O React Flow monta o node invisível e só o mostra depois de medi-lo: a animação de entrada espera
 * dois quadros para não rodar escondida.
 */
function useAfterMeasure(): boolean {
    const [ready, setReady] = useState(false)
    useEffect(() => {
        let second = 0
        const first = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => setReady(true))
        })
        return () => {
            cancelAnimationFrame(first)
            cancelAnimationFrame(second)
        }
    }, [])
    return ready
}

/** Órbita recalculada (memória nova ou removida): a partícula desliza da posição antiga para a nova. */
function useOrbitSlide(point: Point, reduced: boolean) {
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const previous = useRef(point)
    useLayoutEffect(() => {
        const before = previous.current
        previous.current = point
        if (reduced || (before.x === point.x && before.y === point.y)) return
        x.set(before.x - point.x + x.get())
        y.set(before.y - point.y + y.get())
        const controls = [animate(x, 0, { duration: 0.45, ease: "easeInOut" }), animate(y, 0, { duration: 0.45, ease: "easeInOut" })]
        return () => controls.forEach((control) => control.stop())
    }, [point, reduced, x, y])
    return { x, y }
}
