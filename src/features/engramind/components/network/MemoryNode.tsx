"use client"

import { createContext, memo, useContext } from "react"
import type { Node, NodeProps } from "@xyflow/react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { repelOffset, type Point } from "../../network/network-math"
import type { ParticleVisual } from "../../network/particles"
import type { NetworkMemory } from "../../network/types"
import { PulseRing } from "./live"
import { MemoryCard, type MemoryCardActions } from "./MemoryCard"
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
}

export const MemoryNode = memo(function MemoryNode({ data }: NodeProps<Node<MemoryNodeData, "memory">>) {
    const focus = useContext(UniverseFocusContext)
    const zoom = useZoom()
    const { memory, visual } = data
    const isActive = focus?.activeId === memory.id
    const offset = !isActive && focus?.activePoint ? repelOffset(data.point, focus.activePoint) : { x: 0, y: 0 }
    const glow = visual.archived ? 0 : Math.round(4 + 14 * visual.brightness)
    const dimmed = data.matched === false
    return (
        <motion.div
            data-testid={`memory-node-${memory.id}`}
            data-brightness={visual.brightness}
            data-pinned={visual.pinned || undefined}
            data-archived={visual.archived || undefined}
            data-matched={data.matched === null ? undefined : String(data.matched)}
            className="relative"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: data.leaving ? 0 : isActive ? 1.35 : 1, opacity: data.leaving ? 0 : dimmed ? 0.18 : 1, x: offset.x, y: offset.y }}
            transition={{ duration: 0.22 }}
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
            {isActive && zoom >= CARD_MIN_ZOOM && focus && <MemoryCard memory={memory} visual={visual} actions={focus.actions} channelColor={data.channelColor} />}
        </motion.div>
    )
})
