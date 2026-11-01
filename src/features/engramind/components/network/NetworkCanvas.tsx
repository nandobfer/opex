"use client"

import { useEffect } from "react"
import { Background, BackgroundVariant, ReactFlow, useReactFlow, type Edge, type Node, type NodeMouseHandler, type NodeTypes } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { NETWORK_EDGE_TYPES } from "./edges"
import { NETWORK_CANVAS_CLASS } from "./layout-classes"

export const FIT_DURATION_MS = 300

/**
 * Canvas da rede (React Flow): arrastar move a rede inteira, scroll/pinça dá zoom e nodes não são
 * arrastáveis (layout automático). `fitKey` reenquadra quando a visão muda (transição animada de zoom).
 */
export function NetworkCanvas({
    nodes,
    edges,
    nodeTypes,
    fitKey,
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
                fitView
                fitViewOptions={{ padding: 0.15 }}
                onNodeClick={onNodeClick}
                onNodeContextMenu={onNodeContextMenu}
                onPaneClick={onPaneClick}
                proOptions={{ hideAttribution: true }}
                className="bg-transparent"
            >
                <Background variant={BackgroundVariant.Dots} gap={28} size={1} className="opacity-40" />
                <FitOnChange fitKey={fitKey} />
                {children}
            </ReactFlow>
        </div>
    )
}

/** Reenquadra a visão quando a chave muda (troca de universo ou nodes novos). */
function FitOnChange({ fitKey }: { fitKey: string }) {
    const flow = useReactFlow()
    const reducedMotion = useReducedMotion()
    useEffect(() => {
        const frame = requestAnimationFrame(() => void flow.fitView({ padding: 0.15, duration: reducedMotion ? 0 : FIT_DURATION_MS }))
        return () => cancelAnimationFrame(frame)
    }, [fitKey, flow, reducedMotion])
    return null
}

/** Reenquadrar (botão "Centralizar"). */
export function useRecenter() {
    const flow = useReactFlow()
    const reducedMotion = useReducedMotion()
    return () => void flow.fitView({ padding: 0.15, duration: reducedMotion ? 0 : FIT_DURATION_MS })
}
