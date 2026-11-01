"use client"

import { memo, useState } from "react"
import { EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { PathTraveler } from "@/components/flow/path-traveler"
import type { ArchitectEdgeKind } from "../../constants"
import { enterDelay, useDiagramHighlight } from "./diagram-context"

/** Aresta do canvas: desenha-se na entrada (Framer Motion), destaca no foco e esmaece fora dele. */

export type DiagramEdge = Edge<{ kind: ArchitectEdgeKind; label: string | null; count: number; edgeIds: string[]; secondary: boolean; rank: number }, "architect">

const DASH: Partial<Record<ArchitectEdgeKind, string>> = { event: "6 4", contains: "2 4", data: "1 3" }

function ArchitectEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<DiagramEdge>) {
    const highlight = useDiagramHighlight()
    // Aresta que nasce ao vivo: um pulso de luz a percorre uma vez (sem pulsos contínuos depois).
    const [pulse, setPulse] = useState(() => highlight.live && !highlight.reducedMotion)
    const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
    const focused = highlight.relatedEdges.has(id)
    const dimmed = Boolean(highlight.focusedId) && !focused
    const kind = data?.kind ?? "uses"
    const label = data?.count && data.count > 1 ? `×${data.count}` : data?.label
    return (
        <>
            <motion.path
                d={path}
                fill="none"
                data-testid={`architect-edge-${id}`}
                data-dimmed={dimmed ? "true" : "false"}
                className={cn("react-flow__edge-path", focused ? "stroke-primary" : "stroke-muted-foreground")}
                strokeWidth={focused ? 2.25 : kind === "flow" ? 1.75 : 1.25}
                strokeDasharray={DASH[kind]}
                initial={highlight.reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: dimmed ? 0.12 : data?.secondary ? 0.35 : 0.8 }}
                transition={{ duration: highlight.live ? 0.45 : 0.3, delay: highlight.live ? 0 : enterDelay((data?.rank ?? 0) + 1, highlight.reducedMotion) }}
                markerEnd={kind === "contains" ? undefined : "url(#architect-arrow)"}
            />
            {pulse && <PathTraveler path={path} durationMs={700} radius={3.5} testId={`architect-edge-pulse-${id}`} onDone={() => setPulse(false)} />}
            {label && !dimmed && (
                <EdgeLabelRenderer>
                    <div
                        className="nodrag nopan pointer-events-none absolute rounded bg-background/90 px-1 text-[10px] text-muted-foreground"
                        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    )
}

export const ARCHITECT_EDGE_TYPES = { architect: memo(ArchitectEdgeView) }

/** Marcador de seta compartilhado pelas arestas (cor pelo token). */
export function ArchitectEdgeMarkers() {
    return (
        <svg className="absolute h-0 w-0" aria-hidden>
            <defs>
                <marker id="architect-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
                </marker>
            </defs>
        </svg>
    )
}
