import dagre from "@dagrejs/dagre"
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy"
import type { ViewGraph, ViewNode } from "./filters"

/**
 * Layout automático das duas visões (módulo PURO, calculado no cliente): **arquitetura** com dagre
 * (camadas da esquerda para a direita, grupos como clusters) e **mapa mental** com `d3-hierarchy`
 * (árvore radial a partir do objetivo). Devolve posições de canto superior esquerdo, como o React Flow.
 */

export const NODE_WIDTH = 220
export const NODE_HEIGHT = 68
const GROUP_PADDING = 24
const GROUP_HEADER = 32
const RANK_GAP = 90
const RING_GAP = 280

export interface LayoutItem {
    id: string
    kind: "node" | "group" | "collapsed"
    x: number
    y: number
    width: number
    height: number
    /** Grupo pai (posição relativa a ele). */
    parentId: string | null
    /** Camada (arquitetura) ou anel (mapa mental): atraso da animação de entrada. */
    rank: number
}

export interface LayoutEdge {
    id: string
    source: string
    target: string
    /** Mapa mental: aresta fora da árvore (desenhada mais apagada). */
    secondary: boolean
    rank: number
}

export interface LayoutResult {
    items: LayoutItem[]
    edges: LayoutEdge[]
}

const groupKey = (groupId: string) => `cluster:${groupId}`

export function layoutArchitecture(view: ViewGraph): LayoutResult {
    const graph = new dagre.graphlib.Graph({ compound: true, multigraph: false })
    graph.setGraph({ rankdir: "LR", nodesep: 28, ranksep: RANK_GAP, marginx: 16, marginy: 16 })
    graph.setDefaultEdgeLabel(() => ({}))
    const groupIds = new Set(view.groups.map((group) => group.id))
    for (const group of view.groups) graph.setNode(groupKey(group.id), { paddingTop: GROUP_HEADER })
    for (const node of view.nodes) {
        graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
        if (!node.collapsed && node.groupId && groupIds.has(node.groupId)) graph.setParent(node.id, groupKey(node.groupId))
    }
    for (const edge of view.edges) graph.setEdge(edge.source, edge.target)
    dagre.layout(graph)

    const ranks = new Map<string, number>()
    const centers = view.nodes.map((node) => graph.node(node.id).x)
    const columns = [...new Set(centers.map((x) => Math.round(x)))].sort((a, b) => a - b)
    view.nodes.forEach((node, index) => ranks.set(node.id, columns.indexOf(Math.round(centers[index]!))))

    const boxes = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const group of view.groups) {
        const members = view.nodes.filter((node) => !node.collapsed && node.groupId === group.id).map((node) => graph.node(node.id))
        if (!members.length) continue
        const left = Math.min(...members.map((item) => item.x - NODE_WIDTH / 2)) - GROUP_PADDING
        const top = Math.min(...members.map((item) => item.y - NODE_HEIGHT / 2)) - GROUP_PADDING - GROUP_HEADER
        const right = Math.max(...members.map((item) => item.x + NODE_WIDTH / 2)) + GROUP_PADDING
        const bottom = Math.max(...members.map((item) => item.y + NODE_HEIGHT / 2)) + GROUP_PADDING
        boxes.set(group.id, { x: left, y: top, width: right - left, height: bottom - top })
    }
    const items: LayoutItem[] = []
    for (const [groupId, box] of boxes) {
        const rank = Math.min(...view.nodes.filter((node) => node.groupId === groupId && !node.collapsed).map((node) => ranks.get(node.id) ?? 0))
        items.push({ id: groupKey(groupId), kind: "group", ...box, parentId: null, rank })
    }
    for (const node of view.nodes) {
        const point = graph.node(node.id)
        const box = !node.collapsed && node.groupId ? boxes.get(node.groupId) : undefined
        const x = point.x - NODE_WIDTH / 2
        const y = point.y - NODE_HEIGHT / 2
        items.push({ id: node.id, kind: node.collapsed ? "collapsed" : "node", x: box ? x - box.x : x, y: box ? y - box.y : y, width: NODE_WIDTH, height: NODE_HEIGHT, parentId: box ? groupKey(node.groupId!) : null, rank: ranks.get(node.id) ?? 0 })
    }
    const edges = view.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, secondary: false, rank: Math.max(ranks.get(edge.source) ?? 0, ranks.get(edge.target) ?? 0) }))
    return { items, edges }
}

interface TreeDatum {
    id: string
    children: TreeDatum[]
}

function rootOf(view: ViewGraph): ViewNode | undefined {
    return view.nodes.find((node) => node.node?.kind === "objective") ?? view.nodes[0]
}

export function layoutMindMap(view: ViewGraph): LayoutResult {
    const root = rootOf(view)
    if (!root) return { items: [], edges: [] }
    const adjacency = new Map<string, string[]>(view.nodes.map((node) => [node.id, []]))
    for (const edge of view.edges) {
        adjacency.get(edge.source)?.push(edge.target)
        adjacency.get(edge.target)?.push(edge.source)
    }
    // Árvore geradora por BFS (sem direção) a partir do objetivo; nós soltos entram como filhos da raiz.
    const data = new Map<string, TreeDatum>(view.nodes.map((node) => [node.id, { id: node.id, children: [] }]))
    const visited = new Set([root.id])
    const treeEdges = new Set<string>()
    const queue = [root.id]
    const visit = () => {
        while (queue.length) {
            const current = queue.shift()!
            for (const next of adjacency.get(current) ?? []) {
                if (visited.has(next)) continue
                visited.add(next)
                data.get(current)!.children.push(data.get(next)!)
                treeEdges.add(`${current}|${next}`)
                queue.push(next)
            }
        }
    }
    visit()
    for (const node of view.nodes) {
        if (visited.has(node.id)) continue
        visited.add(node.id)
        data.get(root.id)!.children.push(data.get(node.id)!)
        queue.push(node.id)
        visit()
    }
    const hier = hierarchy(data.get(root.id)!, (datum) => datum.children)
    const radius = Math.max(1, hier.height) * RING_GAP
    const laid = tree<TreeDatum>()
        .size([2 * Math.PI, radius])
        .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(hier)
    const depths = new Map<string, number>()
    const items: LayoutItem[] = laid.descendants().map((point: HierarchyPointNode<TreeDatum>) => {
        depths.set(point.data.id, point.depth)
        const angle = point.x - Math.PI / 2
        const cx = point.depth === 0 ? 0 : point.y * Math.cos(angle)
        const cy = point.depth === 0 ? 0 : point.y * Math.sin(angle)
        const viewNode = view.nodes.find((node) => node.id === point.data.id)!
        return { id: point.data.id, kind: viewNode.collapsed ? "collapsed" : "node", x: cx - NODE_WIDTH / 2, y: cy - NODE_HEIGHT / 2, width: NODE_WIDTH, height: NODE_HEIGHT, parentId: null, rank: point.depth }
    })
    const edges = view.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        secondary: !treeEdges.has(`${edge.source}|${edge.target}`) && !treeEdges.has(`${edge.target}|${edge.source}`),
        rank: Math.max(depths.get(edge.source) ?? 0, depths.get(edge.target) ?? 0),
    }))
    return { items, edges }
}
