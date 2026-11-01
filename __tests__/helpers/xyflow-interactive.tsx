import React from 'react'
import { vi } from 'vitest'

/**
 * Mock de `@xyflow/react` para os testes de UI: o canvas real mede o DOM (ResizeObserver, matrizes)
 * que o happy-dom não tem. Este `ReactFlow` renderiza os nós e as arestas com os MESMOS componentes
 * de `nodeTypes`/`edgeTypes` e repassa hover, clique, arrasto (botão `rf-drag-<id>`), clique no fundo e o
 * movimento da visão pelo usuário (botão `rf-user-move`); expõe `nodesDraggable` e o `style` do tema.
 *
 * Uso: `vi.mock('@xyflow/react', async () => (await import('../../helpers/xyflow-interactive')).xyflowMock())` (a rede do Engramind usa o mock leve de `xyflow.tsx`)
 */

type AnyNode = { id: string; type?: string; position: { x: number; y: number }; data: Record<string, unknown>; parentId?: string; width?: number; height?: number }
type AnyEdge = { id: string; source: string; target: string; type?: string; data?: Record<string, unknown> }
type NodeComp = React.ComponentType<Record<string, unknown>>

export const flowSpies = { fitView: vi.fn(), getNodes: vi.fn(() => [] as AnyNode[]) }

export function xyflowMock() {
  function ReactFlow(props: {
    nodes: AnyNode[]
    edges: AnyEdge[]
    nodeTypes: Record<string, NodeComp>
    edgeTypes: Record<string, NodeComp>
    onNodeMouseEnter?: (event: unknown, node: AnyNode) => void
    onNodeMouseLeave?: (event: unknown, node: AnyNode) => void
    onNodeClick?: (event: unknown, node: AnyNode) => void
    onNodeDragStop?: (event: unknown, node: AnyNode) => void
    onPaneClick?: () => void
    onMoveStart?: (event: unknown) => void
    nodesDraggable?: boolean
    style?: React.CSSProperties
    children?: React.ReactNode
    className?: string
  }) {
    return (
      <div data-testid="rf" className={props.className} data-draggable={String(props.nodesDraggable ?? true)} data-style={JSON.stringify(props.style ?? {})}>
        <button type="button" data-testid="rf-pane" onClick={() => props.onPaneClick?.()} />
        <button type="button" data-testid="rf-user-move" onClick={(event) => props.onMoveStart?.(event)} />
        {props.nodes.map((node) => {
          const Comp = props.nodeTypes[node.type ?? 'default']!
          return (
            <div
              key={node.id}
              data-testid={`rf-node-${node.id}`}
              data-type={node.type}
              data-parent={node.parentId ?? ''}
              data-x={node.position.x}
              data-y={node.position.y}
              onMouseEnter={(event) => props.onNodeMouseEnter?.(event, node)}
              onMouseLeave={(event) => props.onNodeMouseLeave?.(event, node)}
              onClick={(event) => props.onNodeClick?.(event, node)}
            >
              <Comp id={node.id} data={node.data} type={node.type} />
              <button type="button" data-testid={`rf-drag-${node.id}`} onClick={(event) => (event.stopPropagation(), props.onNodeDragStop?.(event, { ...node, position: { x: node.position.x + 40, y: node.position.y + 10 } }))} />
            </div>
          )
        })}
        <svg>
          {props.edges.map((edge) => {
            const Comp = props.edgeTypes[edge.type ?? 'default']!
            return <Comp key={edge.id} id={edge.id} source={edge.source} target={edge.target} sourceX={0} sourceY={0} targetX={10} targetY={10} data={edge.data} />
          })}
        </svg>
        {props.children}
      </div>
    )
  }
  return {
    ReactFlow,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReactFlow: () => flowSpies,
    useNodesState: <T,>(initial: T[]) => {
      const [nodes, setNodes] = React.useState(initial)
      return [nodes, setNodes, () => undefined] as const
    },
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    getBezierPath: () => ['M0 0 L10 10', 5, 5, 0, 0],
    getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    getViewportForBounds: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  }
}
