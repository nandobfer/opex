import type { ArchitectNodeKind } from "./constants"
import type { ArchitectEdge, ArchitectGraph, ArchitectNode } from "./graph"

/**
 * Filtros e recolhimento de grupos da aba Arquitetura (módulo PURO). O filtro age sobre o grafo; o
 * recolhimento troca os nós de um grupo por um nó só e agrega as arestas que cruzam a fronteira.
 */

export interface GraphFilter {
    kinds: readonly ArchitectNodeKind[]
    /** Só o que o plano cria/altera (o objetivo continua, como raiz). */
    onlyChanges: boolean
}

export function filterGraph(graph: ArchitectGraph, filter: GraphFilter): ArchitectGraph {
    const kinds = new Set(filter.kinds)
    const nodes = graph.nodes.filter((node) => node.kind === "objective" || (kinds.has(node.kind) && (!filter.onlyChanges || node.status !== "existing")))
    const ids = new Set(nodes.map((node) => node.id))
    const used = new Set(nodes.map((node) => node.groupId))
    return { ...graph, nodes, edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)), groups: graph.groups.filter((group) => used.has(group.id)) }
}

/** Nó da visão: um nó do grafo ou um grupo recolhido (`collapsed`). */
export interface ViewNode {
    id: string
    node: ArchitectNode | null
    groupId: string | null
    collapsed: { groupId: string; label: string; count: number } | null
}

export interface ViewEdge {
    id: string
    source: string
    target: string
    kind: ArchitectEdge["kind"]
    label: string | null
    /** Arestas agregadas (grupo recolhido). */
    count: number
    /** Ids originais (destaque no hover). */
    edgeIds: string[]
}

export interface ViewGraph {
    nodes: ViewNode[]
    edges: ViewEdge[]
    groups: ArchitectGraph["groups"]
}

export const collapsedId = (groupId: string) => `group:${groupId}`

export function toViewGraph(graph: ArchitectGraph, collapsed: ReadonlySet<string> = new Set()): ViewGraph {
    const target = (node: ArchitectNode) => (node.groupId && collapsed.has(node.groupId) ? collapsedId(node.groupId) : node.id)
    const where = new Map(graph.nodes.map((node) => [node.id, target(node)]))
    const nodes: ViewNode[] = []
    const seen = new Set<string>()
    for (const node of graph.nodes) {
        const id = target(node)
        if (seen.has(id)) continue
        seen.add(id)
        if (id === node.id) {
            nodes.push({ id, node, groupId: node.groupId, collapsed: null })
            continue
        }
        const group = graph.groups.find((item) => item.id === node.groupId)!
        nodes.push({ id, node: null, groupId: group.id, collapsed: { groupId: group.id, label: group.label, count: graph.nodes.filter((item) => item.groupId === group.id).length } })
    }
    const edges = new Map<string, ViewEdge>()
    for (const edge of graph.edges) {
        const source = where.get(edge.source)!
        const targetId = where.get(edge.target)!
        if (source === targetId) continue
        const key = `${source}->${targetId}`
        const current = edges.get(key)
        if (current) {
            current.count++
            current.edgeIds.push(edge.id)
            current.label = null
            continue
        }
        edges.set(key, { id: source === edge.source && targetId === edge.target ? edge.id : `agg:${key}`, source, target: targetId, kind: edge.kind, label: edge.label, count: 1, edgeIds: [edge.id] })
    }
    return { nodes, edges: [...edges.values()], groups: graph.groups.filter((group) => !collapsed.has(group.id)) }
}

/** Vizinhos de um nó (painel lateral e destaque do hover). */
export interface Neighbor {
    node: ArchitectNode
    edge: ArchitectEdge
    direction: "in" | "out"
}

export function neighborsOf(graph: ArchitectGraph, nodeId: string): Neighbor[] {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    return graph.edges.flatMap((edge): Neighbor[] => {
        if (edge.source === nodeId) {
            const node = byId.get(edge.target)
            return node ? [{ node, edge, direction: "out" }] : []
        }
        if (edge.target === nodeId) {
            const node = byId.get(edge.source)
            return node ? [{ node, edge, direction: "in" }] : []
        }
        return []
    })
}
