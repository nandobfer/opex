"use client"

import { useMemo } from "react"
import { Background, Controls, MiniMap, ReactFlow, useNodesState } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { ViewGraph } from "../../filters"
import type { LayoutResult } from "../../layout"
import type { DiagramPositions } from "../../hooks/useDiagramLayout"
import { ARCHITECT_EDGE_TYPES, ArchitectEdgeMarkers, type DiagramEdge } from "./ArchitectEdge"
import { ARCHITECT_NODE_TYPES, type DiagramNode } from "./ArchitectNodes"

/**
 * Canvas do diagrama (React Flow): nós e arestas a partir do layout automático, com as posições
 * arrastadas por cima (só no navegador). Remonta (via `key`) a cada troca de versão, visão, filtro ou
 * grupo recolhido, o que recalcula o layout, refaz a entrada animada e ajusta a visão.
 */

export function buildNodes(layout: LayoutResult, view: ViewGraph, positions: DiagramPositions): DiagramNode[] {
    const byId = new Map(view.nodes.map((node) => [node.id, node]))
    const groups = new Map(view.groups.map((group) => [`cluster:${group.id}`, group]))
    return layout.items.flatMap((item): DiagramNode[] => {
        const position = positions[item.id] ?? { x: item.x, y: item.y }
        if (item.kind === "group") {
            const group = groups.get(item.id)
            if (!group) return []
            const count = view.nodes.filter((node) => node.node && node.groupId === group.id).length
            return [{ id: item.id, type: "group", position, data: { group, count, rank: item.rank }, width: item.width, height: item.height, style: { width: item.width, height: item.height }, selectable: false, zIndex: 0 }]
        }
        const viewNode = byId.get(item.id)
        if (!viewNode) return []
        const parent = item.parentId ? { parentId: item.parentId } : {}
        if (viewNode.collapsed) return [{ id: item.id, type: "collapsed", position, data: { ...viewNode.collapsed, rank: item.rank }, width: item.width, height: item.height, zIndex: 1, ...parent }]
        return [{ id: item.id, type: "item", position, data: { node: viewNode.node!, rank: item.rank }, width: item.width, height: item.height, zIndex: 1, ...parent }]
    })
}

export function buildEdges(layout: LayoutResult, view: ViewGraph): DiagramEdge[] {
    const laid = new Map(layout.edges.map((edge) => [edge.id, edge]))
    return view.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "architect",
        zIndex: 1,
        data: { kind: edge.kind, label: edge.label, count: edge.count, edgeIds: edge.edgeIds, secondary: laid.get(edge.id)?.secondary ?? false, rank: laid.get(edge.id)?.rank ?? 0 },
    }))
}

interface ArchitectCanvasProps {
    layout: LayoutResult
    view: ViewGraph
    positions: DiagramPositions
    onSavePosition: (id: string, position: { x: number; y: number }) => void
    onFocus: (id: string | null) => void
    onSelect: (id: string | null) => void
}

export function ArchitectCanvas({ layout, view, positions, onSavePosition, onFocus, onSelect }: ArchitectCanvasProps) {
    // As posições salvas entram só na montagem; depois o arrasto é do React Flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initial = useMemo(() => buildNodes(layout, view, positions), [layout, view])
    const [nodes, , onNodesChange] = useNodesState<DiagramNode>(initial)
    const edges = useMemo(() => buildEdges(layout, view), [layout, view])
    return (
        <div className="relative h-full w-full" data-testid="architect-canvas">
            <ArchitectEdgeMarkers />
            <ReactFlow<DiagramNode, DiagramEdge>
                className="architect-flow"
                colorMode="dark"
                nodes={nodes}
                edges={edges}
                nodeTypes={ARCHITECT_NODE_TYPES}
                edgeTypes={ARCHITECT_EDGE_TYPES}
                onNodesChange={onNodesChange}
                onNodeMouseEnter={(_, node) => node.type !== "group" && onFocus(node.id)}
                onNodeMouseLeave={() => onFocus(null)}
                onNodeClick={(_, node) => node.type === "item" && onSelect(node.id)}
                onNodeDragStop={(_, node) => onSavePosition(node.id, node.position)}
                onPaneClick={() => onSelect(null)}
                nodesConnectable={false}
                edgesFocusable={false}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.1}
                maxZoom={2}
            >
                <Background gap={20} size={1} />
                <Controls showFitView={false} showInteractive={false} position="bottom-left" />
                <MiniMap pannable zoomable position="bottom-right" nodeClassName={(node) => (node.type === "group" ? "fill-muted/40" : "fill-primary/60")} ariaLabel="Minimapa do diagrama" />
            </ReactFlow>
        </div>
    )
}
