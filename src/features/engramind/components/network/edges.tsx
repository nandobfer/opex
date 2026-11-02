"use client"

import { memo, useEffect, useRef, useState } from "react"
import { BaseEdge, EdgeLabelRenderer, getStraightPath, type Edge, type EdgeProps } from "@xyflow/react"
import { motion, useReducedMotion } from "framer-motion"
import { SUBSCRIPTION_MODE_LABEL } from "./network-labels"
import { TravelDots } from "./live"
import { OVERVIEW_LINK_BEND, overviewLinkMidpoint, overviewLinkPath } from "../../network/overview-layout"
import type { SubscriptionMode } from "../../network/types"

/** `bend`: curvatura do link (o sinal alterna entre links vizinhos, para não se sobreporem). */
export type LinkEdgeData = { mode: SubscriptionMode; dimmed?: boolean; bend?: number }
/** `color`: cor do canal (universo do agente); `authored`: memória escrita pelo agente do centro (link destacado). */
export type OrbitEdgeData = { color?: string; authored?: boolean; dimmed?: boolean; entering?: boolean }

/** Traço do link ao centro: normal e destacado (memória escrita pelo agente do centro). */
export const ORBIT_STROKE_WIDTH = { normal: 1, authored: 2.25 } as const

/** Tempo que o modo do link fica à mostra depois de um toque (no toque não há "passar o mouse"). */
export const LINK_TOUCH_LABEL_MS = 1500

/** Link agente ↔ canal (uma assinatura): o modo aparece ao passar o mouse ou, no toque, por um instante. */
export const LinkEdge = memo(function LinkEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<LinkEdgeData, "link">>) {
    const [hover, setHover] = useState(false)
    const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => void (touchTimer.current && clearTimeout(touchTimer.current)), [])
    const onPointerDown = (event: React.PointerEvent) => {
        if (event.pointerType !== "touch") return
        if (touchTimer.current) clearTimeout(touchTimer.current)
        setHover(true)
        touchTimer.current = setTimeout(() => setHover(false), LINK_TOUCH_LABEL_MS)
    }
    const bend = data?.bend ?? OVERVIEW_LINK_BEND
    const path = overviewLinkPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, bend)
    const { x: labelX, y: labelY } = overviewLinkMidpoint({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, bend)
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
    const authored = data?.authored === true
    const opacity = data?.dimmed ? 0.04 : authored ? 0.6 : data?.color ? 0.32 : 0.14
    const style = { stroke: data?.color ?? "var(--color-primary)", strokeOpacity: opacity, strokeWidth: authored ? ORBIT_STROKE_WIDTH.authored : ORBIT_STROKE_WIDTH.normal }
    const marks = { "data-authored": authored || undefined }
    return (
        <>
            {data?.entering && !reducedMotion ? (
                // Memória nova: o link se desenha entre a partícula e o centro enquanto ela nasce.
                <motion.path data-testid={`orbit-entering-${id}`} {...marks} d={path} fill="none" style={style} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} />
            ) : (
                <BaseEdge id={id} path={path} style={style} {...marks} />
            )}
            <TravelDots edgeId={id} path={path} />
        </>
    )
})

export const NETWORK_EDGE_TYPES = { link: LinkEdge, orbit: OrbitEdge }
