"use client"

import { createContext, useContext, useEffect } from "react"
import { Background, BackgroundVariant, ReactFlow, useReactFlow, type Edge, type Node, type NodeMouseHandler, type NodeTypes, type ReactFlowInstance } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { NETWORK_EDGE_TYPES } from "./edges"
import type { Rect } from "../../network/network-math"
import { NETWORK_CANVAS_CLASS, NETWORK_FLOW_THEME } from "./layout-classes"

export const FIT_DURATION_MS = 300
const FIT_PADDING = 0.15

/** Enquadramento da visão atual (`null` = a rede inteira): o "Centralizar" volta a ele. */
const FitBoundsContext = createContext<Rect | null>(null)

function fitTo(flow: Pick<ReactFlowInstance, "fitView" | "fitBounds">, bounds: Rect | null, duration: number) {
    if (bounds) void flow.fitBounds(bounds, { padding: 0, duration })
    else void flow.fitView({ padding: FIT_PADDING, duration })
}

/**
 * Canvas da rede (React Flow): arrastar move a rede inteira, scroll/pinça dá zoom e nodes não são
 * arrastáveis (layout automático). `fitKey` reenquadra quando a visão muda (transição animada de zoom);
 * `initialBounds` troca o "enquadrar tudo" por um retângulo (visão inicial: a linha de agentes).
 * Os `children` ficam fora da camada com zoom (cards, painéis e a camada do card da memória).
 */
export function NetworkCanvas({
    nodes,
    edges,
    nodeTypes,
    fitKey,
    initialBounds = null,
    onNodeClick,
    onNodeContextMenu,
    onPaneClick,
    className,
    label,
    children,
}: {
    nodes: Node[]
    edges: Edge[]
    nodeTypes: NodeTypes
    fitKey: string
    initialBounds?: Rect | null
    onNodeClick?: NodeMouseHandler
    onNodeContextMenu?: NodeMouseHandler
    onPaneClick?: () => void
    className?: string
    label: string
    children?: React.ReactNode
}) {
    return (
        <div className={cn(NETWORK_CANVAS_CLASS, className)} aria-label={label} role="region" data-testid="network-canvas">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={NETWORK_EDGE_TYPES}
                colorMode="dark"
                style={NETWORK_FLOW_THEME}
                nodeOrigin={[0.5, 0.5]}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                zoomOnDoubleClick={false}
                onlyRenderVisibleElements
                minZoom={0.1}
                maxZoom={2.5}
                fitView={!initialBounds}
                fitViewOptions={{ padding: FIT_PADDING }}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={onPaneClick}
                proOptions={{ hideAttribution: true }}
                className="bg-transparent"
            >
                <Background variant={BackgroundVariant.Dots} gap={28} size={1} />
                <FitBoundsContext.Provider value={initialBounds}>
                    <FitOnChange fitKey={fitKey} />
                    {children}
                </FitBoundsContext.Provider>
            </ReactFlow>
        </div>
    )
}

/** Reenquadra a visão quando a chave muda (troca de universo ou nodes novos). */
function FitOnChange({ fitKey }: { fitKey: string }) {
    const flow = useReactFlow()
    const reducedMotion = useReducedMotion()
    const bounds = useContext(FitBoundsContext)
    const boundsKey = bounds ? `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}` : "all"
    useEffect(() => {
        const frame = requestAnimationFrame(() => fitTo(flow, bounds, reducedMotion ? 0 : FIT_DURATION_MS))
        return () => cancelAnimationFrame(frame)
        // `boundsKey` resume o retângulo (o objeto muda a cada render).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey, boundsKey, flow, reducedMotion])
    return null
}

/** Reenquadrar (botão "Centralizar"): volta ao enquadramento da visão (o inicial, na visão horizontal). */
export function useRecenter() {
    const flow = useReactFlow()
    const reducedMotion = useReducedMotion()
    const bounds = useContext(FitBoundsContext)
    return () => fitTo(flow, bounds, reducedMotion ? 0 : FIT_DURATION_MS)
}
