"use client"

import { memo, useEffect, useRef, useState } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getStraightPath, type Edge, type EdgeProps } from "@xyflow/react"
import { motion, useReducedMotion } from "framer-motion"
import { SUBSCRIPTION_MODE_LABEL } from "./network-labels"
import { TravelDots } from "./live"
import type { SubscriptionMode } from "../../network/types"

export type LinkEdgeData = { mode: SubscriptionMode; dimmed?: boolean }
export type OrbitEdgeData = { color?: string; dimmed?: boolean; entering?: boolean }

/** Tempo que o modo do link fica à mostra depois de um toque (no toque não há "passar o mouse"). */
export const LINK_TOUCH_LABEL_MS = 1500

/** Link agente ↔ canal (uma assinatura): o modo aparece ao passar o mouse ou, no toque, por um instante. */
export const LinkEdge = memo(function LinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<LinkEdgeData, "link">>) {
    const [hover, setHover] = useState(false)
    const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => void (touchTimer.current && clearTimeout(touchTimer.current)), [])
    const onPointerDown = (event: React.PointerEvent) => {
        if (event.pointerType !== "touch") return
        if (touchTimer.current) clearTimeout(touchTimer.current)
        setHover(true)
        touchTimer.current = setTimeout(() => setHover(false), LINK_TOUCH_LABEL_MS)
    }
    const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
    return (
        <>
            <BaseEdge id={id} path={path} style={{ stroke: "var(--color-primary)", strokeOpacity: data?.dimmed ? 0.12 : hover ? 0.9 : 0.4, strokeWidth: hover ? 2 : 1.25 }} />
            <path d={path} fill="none" stroke="transparent" strokeWidth={14} data-testid={`link-${id}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onPointerDown={onPointerDown} />
            <TravelDots edgeId={id} path={path} />
            {hover && data && (
                <EdgeLabelRenderer>
                    <div
                        role="tooltip"
                        className="pointer-events-none absolute rounded-md border bg-popover px-2 py-0.5 text-xs text-popover-foreground shadow"
                        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                    >
                        {SUBSCRIPTION_MODE_LABEL[data.mode]}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    )
})

/** Link fraco e sem significado entre a partícula e o centro (cor do canal no universo do agente). */
export const OrbitEdge = memo(function OrbitEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<OrbitEdgeData, "orbit">>) {
    const reducedMotion = useReducedMotion()
    const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
    const style = { stroke: data?.color ?? "var(--color-primary)", strokeOpacity: data?.dimmed ? 0.04 : data?.color ? 0.32 : 0.14, strokeWidth: 1 }
    return (
        <>
            {data?.entering && !reducedMotion ? (
                // Memória nova: o link se desenha entre a partícula e o centro enquanto ela nasce.
                <motion.path data-testid={`orbit-entering-${id}`} d={path} fill="none" style={style} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} />
            ) : (
                <BaseEdge id={id} path={path} style={style} />
            )}
            <TravelDots edgeId={id} path={path} />
        </>
    )
})

export const NETWORK_EDGE_TYPES = { link: LinkEdge, orbit: OrbitEdge }
