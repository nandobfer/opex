import { ARCHITECT_TEXT_LIMITS, type ArchitectTextField, ARCHITECT_DEPTH_DEFS, ARCHITECT_EDGE_KINDS, ARCHITECT_GROUP_LAYERS, ARCHITECT_NODE_FILES_MAX, ARCHITECT_NODE_KINDS, ARCHITECT_NODE_STATUSES, ARCHITECT_NOTE_KINDS, type ArchitectDepth } from "./constants"
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
/** Cortes de texto acima do teto de proteção, por campo (viram avisos da versão). */
export type TextCuts = Map<ArchitectTextField, number>

/** Texto do modelo no teto de proteção do campo; o corte é contado em `cuts`. `oneLine` junta os espaços. */
export function clip(value: unknown, field: ArchitectTextField, cuts?: TextCuts, oneLine = false): string {
    if (typeof value !== "string" && !(oneLine && typeof value === "number")) return ""
    const text = oneLine ? String(value).replace(/\s+/g, " ").trim() : String(value).trim()
    const max = ARCHITECT_TEXT_LIMITS[field].max
    if (text.length <= max) return text
    cuts?.set(field, (cuts.get(field) ?? 0) + 1)
    return text.slice(0, max)
}

/** Avisos dos cortes: "nota: 2 corte(s) no teto de proteção de 1.000 caracteres". */
export function cutWarnings(cuts: TextCuts): string[] {
    return [...cuts].map(([field, count]) => `${ARCHITECT_TEXT_LIMITS[field].label}: ${count} corte(s) no teto de proteção de ${ARCHITECT_TEXT_LIMITS[field].max.toLocaleString("pt-BR")} caracteres`)
}

export const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => (typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback)

const OBJECTIVE_ID = "objective"
const STATUS_RANK = { new: 1, changed: 2, existing: 3 } as const

function cleanFiles(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const files = value.map((item) => str(item, 300).replace(/^\.\//, "")).filter(Boolean)
    return [...new Set(files)].slice(0, ARCHITECT_NODE_FILES_MAX)
}

/** Normaliza um grupo do modelo (o id já resolvido). */
export function toGroup(item: Rec, id: string, cuts?: TextCuts): ArchitectGroup {
    return { id, label: clip(item.label, "groupLabel", cuts, true) || id, layer: oneOf(item.layer, ARCHITECT_GROUP_LAYERS, "other"), detail: clip(item.detail, "groupDetail", cuts) }
}

/** Normaliza um nó do modelo (id e rótulo já resolvidos); grupo inexistente vira nenhum. */
export function toNode(item: Rec, id: string, label: string, groupIds: ReadonlySet<string>, cuts?: TextCuts): ArchitectNode {
    const groupId = str(item.groupId, 80)
    return {
        id,
        label,
        groupId: groupId && groupIds.has(groupId) ? groupId : null,
        kind: oneOf(item.kind, ARCHITECT_NODE_KINDS, "module"),
        detail: clip(item.detail, "detail", cuts),
        files: cleanFiles(item.files),
        status: oneOf(item.status, ARCHITECT_NODE_STATUSES, "existing"),
    }
}

/** Rótulo do nó (o do modelo ou, sem ele, o id). */
export const nodeLabelOf = (item: Rec, fallback: string, cuts?: TextCuts) => clip(item.label, "nodeLabel", cuts, true) || str(fallback, ARCHITECT_TEXT_LIMITS.nodeLabel.max)

/** Normaliza uma nota do modelo (`null` sem texto). */
export function toNote(item: Rec, cuts?: TextCuts): ArchitectNote | null {
    const text = clip(item.text, "note", cuts)
    return text ? { kind: oneOf(item.kind, ARCHITECT_NOTE_KINDS, "decision"), text } : null
}

function cleanGroups(raw: readonly unknown[], cuts: TextCuts): ArchitectGroup[] {
    const seen = new Set<string>()
    const groups: ArchitectGroup[] = []
    for (const item of raw) {
        if (!isRec(item)) continue
        const id = str(item.id, 80) || str(item.label, 80)
        if (!id || seen.has(id)) continue
        seen.add(id)
        groups.push(toGroup(item, id, cuts))
    }
    return groups
}

function cleanNodes(raw: readonly unknown[], groupIds: ReadonlySet<string>, warnings: string[], cuts: TextCuts): ArchitectNode[] {
    const seen = new Set<string>()
    const nodes: ArchitectNode[] = []
    let duplicates = 0
    raw.forEach((item, index) => {
        if (!isRec(item)) return
        const label = nodeLabelOf(item, str(item.id, 80), cuts)
        if (!label) return
        const id = str(item.id, 80) || `n${index + 1}`
        if (seen.has(id)) {
            duplicates++
            return
        }
        seen.add(id)
        nodes.push(toNode(item, id, label, groupIds, cuts))
    })
    if (duplicates) warnings.push(`${duplicates} nó(s) com id repetido descartado(s)`)
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

function cleanEdges(raw: readonly unknown[], nodeIds: ReadonlySet<string>, warnings: string[], cuts: TextCuts): ArchitectEdge[] {
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
        edges.push({ id, source, target, label: clip(item.label, "edgeLabel", cuts, true) || null, kind })
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

function cleanNotes(raw: readonly unknown[], cuts: TextCuts): ArchitectNote[] {
    return raw
        .filter(isRec)
        .map((item) => toNote(item, cuts))
        .filter((note): note is ArchitectNote => note !== null)
        .slice(0, 40)
}

export function sanitizeGraph(raw: RawGraph, depth: ArchitectDepth): SanitizedGraph {
    const warnings: string[] = []
    const cuts: TextCuts = new Map()
    const limits = ARCHITECT_DEPTH_DEFS[depth]
    const title = clip(raw.title, "title", cuts, true)
    const summary = clip(raw.summary, "summary", cuts)
    let groups = cleanGroups(raw.groups ?? [], cuts)
    let nodes = cleanNodes(raw.nodes, new Set(groups.map((group) => group.id)), warnings, cuts)
    if (!nodes.some((node) => node.kind === "objective")) {
        let id = OBJECTIVE_ID
        while (nodes.some((node) => node.id === id)) id = `${id}_`
        nodes.unshift({ id, label: title || "Objetivo do plano", groupId: null, kind: "objective", detail: summary, files: [], status: "new" })
        warnings.push("o nó do objetivo foi criado a partir do título")
    }
    const nodeCap = capNodes(nodes, limits.maxNodes)
    nodes = nodeCap.kept
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edgeCap = capEdges(cleanEdges(raw.edges ?? [], nodeIds, warnings, cuts), limits.maxEdges)
    const used = new Set(nodes.map((node) => node.groupId).filter(Boolean))
    groups = groups.filter((group) => used.has(group.id))
    const graph = architectGraphSchema.parse({
        title: title || nodes.find((node) => node.kind === "objective")?.label || "Arquitetura do plano",
        summary,
        groups,
        nodes,
        edges: edgeCap.kept,
        notes: cleanNotes(raw.notes ?? [], cuts),
    })
    warnings.push(...cutWarnings(cuts))
    if (nodeCap.cut) warnings.push(`${nodeCap.cut} nó(s) acima do teto de ${limits.maxNodes} do nível "${limits.label}" cortado(s)`)
    if (edgeCap.cut) warnings.push(`${edgeCap.cut} aresta(s) acima do teto de ${limits.maxEdges} cortada(s)`)
    return { graph, trimmed: { nodes: nodeCap.cut, edges: edgeCap.cut }, warnings }
}
