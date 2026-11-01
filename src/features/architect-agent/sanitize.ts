import { ARCHITECT_NODE_DETAIL_MAX, ARCHITECT_DEPTH_DEFS, ARCHITECT_EDGE_KINDS, ARCHITECT_GROUP_LAYERS, ARCHITECT_NODE_FILES_MAX, ARCHITECT_NODE_KINDS, ARCHITECT_NODE_STATUSES, ARCHITECT_NOTE_KINDS, type ArchitectDepth } from "./constants"
import { architectGraphSchema, type ArchitectEdge, type ArchitectGraph, type ArchitectGroup, type ArchitectNode, type ArchitectNote, type RawGraph } from "./graph"

/**
 * Saneamento do grafo do modelo (módulo PURO): normaliza ids e textos, deduplica, descarta arestas com
 * ponta inexistente, garante o nó do objetivo e corta acima do teto do nível de profundidade. O
 * resultado sempre passa no `architectGraphSchema`.
 */

export interface SanitizedGraph {
    graph: ArchitectGraph
    /** Quantos nós/arestas foram cortados pelo teto do nível. */
    trimmed: { nodes: number; edges: number }
    warnings: string[]
}

export type Rec = Record<string, unknown>
export const isRec = (value: unknown): value is Rec => Boolean(value) && typeof value === "object" && !Array.isArray(value)
export const str = (value: unknown, max: number): string => (typeof value === "string" || typeof value === "number" ? String(value).replace(/\s+/g, " ").trim().slice(0, max) : "")
export const longStr = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "")
export const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => (typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback)

const OBJECTIVE_ID = "objective"
const STATUS_RANK = { new: 1, changed: 2, existing: 3 } as const

function cleanFiles(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const files = value.map((item) => str(item, 300).replace(/^\.\//, "")).filter(Boolean)
    return [...new Set(files)].slice(0, ARCHITECT_NODE_FILES_MAX)
}

/** Normaliza um grupo do modelo (o id já resolvido). */
export function toGroup(item: Rec, id: string): ArchitectGroup {
    return { id, label: str(item.label, 80) || id, layer: oneOf(item.layer, ARCHITECT_GROUP_LAYERS, "other"), detail: longStr(item.detail, 600) }
}

/** Normaliza um nó do modelo (id e rótulo já resolvidos); grupo inexistente vira nenhum. */
export function toNode(item: Rec, id: string, label: string, groupIds: ReadonlySet<string>): ArchitectNode {
    const groupId = str(item.groupId, 80)
    return {
        id,
        label,
        groupId: groupId && groupIds.has(groupId) ? groupId : null,
        kind: oneOf(item.kind, ARCHITECT_NODE_KINDS, "module"),
        detail: longStr(item.detail, ARCHITECT_NODE_DETAIL_MAX),
        files: cleanFiles(item.files),
        status: oneOf(item.status, ARCHITECT_NODE_STATUSES, "existing"),
    }
}

/** O detalhe do nó passa do limite (o saneamento corta e avisa). */
export const detailTooLong = (item: Rec) => typeof item.detail === "string" && item.detail.trim().length > ARCHITECT_NODE_DETAIL_MAX

/** Normaliza uma nota do modelo (`null` sem texto). */
export function toNote(item: Rec): ArchitectNote | null {
    const text = longStr(item.text, 1000)
    return text ? { kind: oneOf(item.kind, ARCHITECT_NOTE_KINDS, "decision"), text } : null
}

function cleanGroups(raw: readonly unknown[]): ArchitectGroup[] {
    const seen = new Set<string>()
    const groups: ArchitectGroup[] = []
    for (const item of raw) {
        if (!isRec(item)) continue
        const id = str(item.id, 80) || str(item.label, 80)
        if (!id || seen.has(id)) continue
        seen.add(id)
        groups.push(toGroup(item, id))
    }
    return groups
}

function cleanNodes(raw: readonly unknown[], groupIds: ReadonlySet<string>, warnings: string[]): ArchitectNode[] {
    const seen = new Set<string>()
    const nodes: ArchitectNode[] = []
    let duplicates = 0
    let longDetails = 0
    raw.forEach((item, index) => {
        if (!isRec(item)) return
        const label = str(item.label, 120) || str(item.id, 120)
        if (!label) return
        const id = str(item.id, 80) || `n${index + 1}`
        if (seen.has(id)) {
            duplicates++
            return
        }
        seen.add(id)
        if (detailTooLong(item)) longDetails++
        nodes.push(toNode(item, id, label, groupIds))
    })
    if (duplicates) warnings.push(`${duplicates} nó(s) com id repetido descartado(s)`)
    if (longDetails) warnings.push(`${longDetails} descrição(ões) de nó cortada(s) no limite de ${ARCHITECT_NODE_DETAIL_MAX} caracteres`)
    return nodes
}

/** Ordem de corte: objetivo, depois o que o plano cria, altera e o contexto existente; depois o tipo. */
function priority(node: ArchitectNode): number {
    if (node.kind === "objective") return 0
    return STATUS_RANK[node.status] * 100 + ARCHITECT_NODE_KINDS.indexOf(node.kind)
}

function capNodes(nodes: ArchitectNode[], max: number): { kept: ArchitectNode[]; cut: number } {
    if (nodes.length <= max) return { kept: nodes, cut: 0 }
    const ranked = nodes.map((node, index) => ({ node, index })).sort((a, b) => priority(a.node) - priority(b.node) || a.index - b.index)
    const keep = new Set(ranked.slice(0, max).map((item) => item.node.id))
    return { kept: nodes.filter((node) => keep.has(node.id)), cut: nodes.length - max }
}

function cleanEdges(raw: readonly unknown[], nodeIds: ReadonlySet<string>, warnings: string[]): ArchitectEdge[] {
    const ids = new Set<string>()
    const pairs = new Set<string>()
    const edges: ArchitectEdge[] = []
    let dangling = 0
    raw.forEach((item, index) => {
        if (!isRec(item)) return
        const source = str(item.source ?? item.from, 80)
        const target = str(item.target ?? item.to, 80)
        if (!nodeIds.has(source) || !nodeIds.has(target)) {
            dangling++
            return
        }
        if (source === target) return
        const kind = oneOf(item.kind, ARCHITECT_EDGE_KINDS, "uses")
        const pair = `${source}->${target}:${kind}`
        if (pairs.has(pair)) return
        pairs.add(pair)
        let id = str(item.id, 80) || `e${index + 1}`
        while (ids.has(id)) id = `${id}_`
        ids.add(id)
        edges.push({ id, source, target, label: str(item.label, 80) || null, kind })
    })
    if (dangling) warnings.push(`${dangling} aresta(s) com nó inexistente descartada(s)`)
    return edges
}

function capEdges(edges: ArchitectEdge[], max: number): { kept: ArchitectEdge[]; cut: number } {
    if (edges.length <= max) return { kept: edges, cut: 0 }
    // As relações semânticas ficam antes do "contém" (o agrupamento já mostra a hierarquia).
    const ranked = edges.map((edge, index) => ({ edge, index })).sort((a, b) => Number(a.edge.kind === "contains") - Number(b.edge.kind === "contains") || a.index - b.index)
    const keep = new Set(ranked.slice(0, max).map((item) => item.edge.id))
    return { kept: edges.filter((edge) => keep.has(edge.id)), cut: edges.length - max }
}

function cleanNotes(raw: readonly unknown[]): ArchitectNote[] {
    return raw
        .filter(isRec)
        .map(toNote)
        .filter((note): note is ArchitectNote => note !== null)
        .slice(0, 40)
}

export function sanitizeGraph(raw: RawGraph, depth: ArchitectDepth): SanitizedGraph {
    const warnings: string[] = []
    const limits = ARCHITECT_DEPTH_DEFS[depth]
    const title = str(raw.title, 160)
    let groups = cleanGroups(raw.groups ?? [])
    let nodes = cleanNodes(raw.nodes, new Set(groups.map((group) => group.id)), warnings)
    if (!nodes.some((node) => node.kind === "objective")) {
        let id = OBJECTIVE_ID
        while (nodes.some((node) => node.id === id)) id = `${id}_`
        nodes.unshift({ id, label: title || "Objetivo do plano", groupId: null, kind: "objective", detail: str(raw.summary, 2000), files: [], status: "new" })
        warnings.push("o nó do objetivo foi criado a partir do título")
    }
    const nodeCap = capNodes(nodes, limits.maxNodes)
    nodes = nodeCap.kept
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edgeCap = capEdges(cleanEdges(raw.edges ?? [], nodeIds, warnings), limits.maxEdges)
    const used = new Set(nodes.map((node) => node.groupId).filter(Boolean))
    groups = groups.filter((group) => used.has(group.id))
    const graph = architectGraphSchema.parse({
        title: title || nodes.find((node) => node.kind === "objective")?.label || "Arquitetura do plano",
        summary: longStr(raw.summary, 2000),
        groups,
        nodes,
        edges: edgeCap.kept,
        notes: cleanNotes(raw.notes ?? []),
    })
    if (nodeCap.cut) warnings.push(`${nodeCap.cut} nó(s) acima do teto de ${limits.maxNodes} do nível "${limits.label}" cortado(s)`)
    if (edgeCap.cut) warnings.push(`${edgeCap.cut} aresta(s) acima do teto de ${limits.maxEdges} cortada(s)`)
    return { graph, trimmed: { nodes: nodeCap.cut, edges: edgeCap.cut }, warnings }
}
