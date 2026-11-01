"use client"

import { useMemo } from "react"
import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react"
import { FLOW_BACKGROUND_PROPS, FLOW_THEME_STYLE } from "@/components/flow/flow-theme"
import { useAnimatedLayout } from "../../hooks/useAnimatedLayout"
import "@xyflow/react/dist/style.css"
import type { ViewGraph } from "../../filters"
import type { LayoutResult } from "../../layout"
import type { DiagramPositions } from "../../hooks/useDiagramLayout"
import { ARCHITECT_EDGE_TYPES, ArchitectEdgeMarkers, type DiagramEdge } from "./ArchitectEdge"
import { ARCHITECT_NODE_TYPES, type DiagramNode } from "./ArchitectNodes"

/**
 * Canvas do diagrama (React Flow): nós e arestas a partir do layout automático, com as posições
 * arrastadas por cima (só no navegador). Remonta (via `key`) a cada troca de visão, filtro ou grupo
 * recolhido; quando só o grafo muda (diagrama ao vivo e a chegada do grafo final), NÃO remonta: os
 * nós deslizam para o layout novo, os novos nascem do nó de onde vieram e os que saem somem.
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

/** Nó novo nasce no nó de onde veio (a origem da primeira aresta que chega nele, no mesmo grupo). */
export function originFor(view: ViewGraph, id: string, current: ReadonlyMap<string, DiagramNode>, parentOf: (id: string) => string | undefined): { x: number; y: number } | null {
    for (const edge of view.edges) {
        if (edge.target !== id) continue
        const source = current.get(edge.source)
        if (source && source.parentId === parentOf(id)) return source.position
    }
    return null
}

interface ArchitectCanvasProps {
    layout: LayoutResult
    view: ViewGraph
    positions: DiagramPositions
    /** Geração ao vivo: sem arrasto (o layout ainda muda). */
    live: boolean
    reducedMotion: boolean
    onSavePosition: (id: string, position: { x: number; y: number }) => void
    onFocus: (id: string | null) => void
    onSelect: (id: string | null) => void
    /** O usuário moveu a visão (zoom/pan): o "acompanhar" do ao vivo para. */
    onUserMove?: () => void
}

export function ArchitectCanvas({ layout, view, positions, live, reducedMotion, onSavePosition, onFocus, onSelect, onUserMove }: ArchitectCanvasProps) {
    // As posições salvas valem a cada layout novo; durante o arrasto, a posição é do React Flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const target = useMemo(() => buildNodes(layout, view, live ? {} : positions), [layout, view, live])
    const parents = useMemo(() => new Map(target.map((node) => [node.id, node.parentId])), [target])
    const { nodes, onNodesChange } = useAnimatedLayout<DiagramNode>(target, { animate: !reducedMotion, originOf: (id, current) => originFor(view, id, current, (nodeId) => parents.get(nodeId)) })
    const edges = useMemo(() => buildEdges(layout, view), [layout, view])
    return (
        <div className="relative h-full w-full" data-testid="architect-canvas">
            <ArchitectEdgeMarkers />
            <ReactFlow<DiagramNode, DiagramEdge>
                className="bg-transparent"
                colorMode="dark"
                style={FLOW_THEME_STYLE}
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
                onMoveStart={(event) => event && onUserMove?.()}
                nodesDraggable={!live}
                nodesConnectable={false}
                edgesFocusable={false}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                proOptions={{ hideAttribution: true }}
                minZoom={0.1}
                maxZoom={2}
            >
                <Background {...FLOW_BACKGROUND_PROPS} />
                <Controls showFitView={false} showInteractive={false} position="bottom-left" />
                <MiniMap pannable zoomable position="bottom-right" nodeClassName={(node) => (node.type === "group" ? "fill-primary/15" : "fill-primary/60")} ariaLabel="Minimapa do diagrama" />
            </ReactFlow>
        </div>
    )
}
