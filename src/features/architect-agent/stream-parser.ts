import { ARCHITECT_DEPTH_DEFS, ARCHITECT_EDGE_KINDS, ARCHITECT_LIVE_CAP_FACTOR, ARCHITECT_STREAM_FENCE, type ArchitectDepth } from "./constants"
import type { ArchitectEdge, ArchitectGraph, ArchitectGroup, ArchitectNode, ArchitectNote } from "./graph"
import { detailTooLong, isRec, oneOf, str, longStr, toGroup, toNode, toNote, type Rec } from "./sanitize"

/**
 * Diagrama ao vivo (módulo PURO, servidor e tela). O agente escreve o grafo como operações, uma linha
 * JSON por operação, dentro de blocos ` ```architect ` — pode escrever vários ao longo do turno:
 *
 *   {"op":"meta","title":…,"summary":…}
 *   {"op":"group","id":…,"label":…,"layer":…}
 *   {"op":"node","id":…,"label":…,"groupId":…,"kind":…,"status":…,"detail":…,"files":[…]}
 *   {"op":"edge","source":…,"target":…,"kind":…,"label":…}
 *   {"op":"note","kind":…,"text":…}
 *   {"op":"remove","id":…}
 *   {"op":"done"}
 *
 * O montador (`createGraphAssembler`) recebe o texto em pedaços e só aplica LINHAS COMPLETAS; cada
 * linha é validada e normalizada ao chegar (inválida: descartada com aviso); aresta cuja ponta ainda
 * não chegou fica pendente; nó repetido mescla os campos (o mais recente vence). Devolve as operações
 * APLICADAS (já normalizadas), que a tela aplica com `applyOps` — a mesma função do servidor.
 */

export type AppliedOp =
    | { op: "meta"; title: string; summary: string }
    | { op: "group"; group: ArchitectGroup }
    | { op: "node"; node: ArchitectNode }
    | { op: "edge"; edge: ArchitectEdge }
    | { op: "note"; note: ArchitectNote }
    | { op: "remove"; id: string }
    /** Recomeço do rascunho (pedido de correção): o grafo de partida inteiro. */
    | { op: "reset"; graph: ArchitectGraph }

export const emptyDraft = (): ArchitectGraph => ({ title: "", summary: "", groups: [], nodes: [], edges: [], notes: [] })

const cloneGraph = (graph: ArchitectGraph): ArchitectGraph => ({ ...graph, groups: [...graph.groups], nodes: [...graph.nodes], edges: [...graph.edges], notes: [...graph.notes] })

/** Aplica operações a um rascunho (imutável). Remover um nó tira as arestas dele; remover um grupo solta os nós. */
export function applyOps(draft: ArchitectGraph, ops: readonly AppliedOp[]): ArchitectGraph {
    if (!ops.length) return draft
    let next = cloneGraph(draft)
    for (const op of ops) {
        if (op.op === "reset") next = cloneGraph(op.graph)
        else if (op.op === "meta") next = { ...next, title: op.title || next.title, summary: op.summary || next.summary }
        else if (op.op === "group") next.groups = upsert(next.groups, op.group)
        else if (op.op === "node") next.nodes = upsert(next.nodes, op.node)
        else if (op.op === "edge") next.edges = upsert(next.edges, op.edge)
        else if (op.op === "note") {
            if (!next.notes.some((note) => note.text === op.note.text)) next.notes = [...next.notes, op.note]
        } else if (op.op === "remove") {
            if (next.nodes.some((node) => node.id === op.id)) {
                next.nodes = next.nodes.filter((node) => node.id !== op.id)
                next.edges = next.edges.filter((edge) => edge.source !== op.id && edge.target !== op.id)
            } else if (next.edges.some((edge) => edge.id === op.id)) {
                next.edges = next.edges.filter((edge) => edge.id !== op.id)
            } else if (next.groups.some((group) => group.id === op.id)) {
                next.groups = next.groups.filter((group) => group.id !== op.id)
                next.nodes = next.nodes.map((node) => (node.groupId === op.id ? { ...node, groupId: null } : node))
            }
        }
    }
    return next
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
    const index = list.findIndex((current) => current.id === item.id)
    if (index === -1) return [...list, item]
    const copy = [...list]
    copy[index] = item
    return copy
}

export interface GraphAssembler {
    /** Recebe um pedaço do texto do modelo; devolve as operações aplicadas por ele. */
    push(delta: string): AppliedOp[]
    /** Fim do texto: processa a última linha (sem quebra final) e solta as arestas pendentes. */
    finish(): AppliedOp[]
    /** Recomeça do grafo de partida (pedido de correção). */
    reset(): AppliedOp[]
    readonly draft: ArchitectGraph
    readonly warnings: string[]
    /** Houve ao menos um bloco ` ```architect ` (senão vale o formato antigo, JSON único). */
    readonly sawBlock: boolean
    /** Nós ignorados acima do teto com folga. */
    readonly overflow: number
}

const FENCE_OPEN = new RegExp(`^\`\`\`\\s*${ARCHITECT_STREAM_FENCE}\\b`)

export function createGraphAssembler({ depth, base = null }: { depth: ArchitectDepth; base?: ArchitectGraph | null }): GraphAssembler {
    const limits = ARCHITECT_DEPTH_DEFS[depth]
    const maxNodes = Math.ceil(limits.maxNodes * ARCHITECT_LIVE_CAP_FACTOR)
    const maxEdges = Math.ceil(limits.maxEdges * ARCHITECT_LIVE_CAP_FACTOR)
    const start = () => (base ? cloneGraph(base) : emptyDraft())
    let draft = start()
    let buffer = ""
    let inBlock = false
    let sawBlock = false
    let overflow = 0
    let edgeSeq = 0
    const warnings: string[] = []
    let invalid = 0
    let longDetails = 0
    /** Campos brutos acumulados por nó (o mesmo id mescla). */
    let rawNodes = new Map<string, Rec>()
    /** Nós que pediram um grupo que ainda não chegou. */
    let wantsGroup = new Map<string, string>()
    let pendingEdges: Rec[] = []

    const seedRaw = () => {
        rawNodes = new Map(draft.nodes.map((node) => [node.id, { ...node } as Rec]))
        wantsGroup = new Map()
        pendingEdges = []
    }
    seedRaw()

    const groupIds = () => new Set(draft.groups.map((group) => group.id))
    const apply = (ops: AppliedOp[], op: AppliedOp) => {
        draft = applyOps(draft, [op])
        ops.push(op)
    }

    const tryEdge = (item: Rec, ops: AppliedOp[]): "added" | "pending" | "skip" => {
        const source = str(item.source ?? item.from, 80)
        const target = str(item.target ?? item.to, 80)
        if (!source || !target || source === target) return "skip"
        const nodeIds = new Set(draft.nodes.map((node) => node.id))
        if (!nodeIds.has(source) || !nodeIds.has(target)) return "pending"
        const kind = oneOf(item.kind, ARCHITECT_EDGE_KINDS, "uses")
        if (draft.edges.some((edge) => edge.source === source && edge.target === target && edge.kind === kind)) return "skip"
        if (draft.edges.length >= maxEdges) return "skip"
        const ids = new Set(draft.edges.map((edge) => edge.id))
        let id = str(item.id, 80) || `e${++edgeSeq}`
        while (ids.has(id)) id = `${id}_`
        apply(ops, { op: "edge", edge: { id, source, target, label: str(item.label, 80) || null, kind } })
        return "added"
    }

    const flushPending = (ops: AppliedOp[]) => {
        const still: Rec[] = []
        for (const item of pendingEdges) if (tryEdge(item, ops) === "pending") still.push(item)
        pendingEdges = still
    }

    const handle = (item: Rec, ops: AppliedOp[]) => {
        const op = item.op
        if (op === "done") return
        if (op === "meta") return apply(ops, { op: "meta", title: str(item.title, 160), summary: longStr(item.summary, 2000) })
        if (op === "group") {
            const id = str(item.id, 80) || str(item.label, 80)
            if (!id) return void invalid++
            apply(ops, { op: "group", group: toGroup(item, id) })
            for (const [nodeId, groupId] of wantsGroup) {
                if (groupId !== id) continue
                wantsGroup.delete(nodeId)
                const current = draft.nodes.find((node) => node.id === nodeId)
                if (current) apply(ops, { op: "node", node: { ...current, groupId: id } })
            }
            return
        }
        if (op === "node") {
            const id = str(item.id, 80)
            const previous = id ? rawNodes.get(id) : undefined
            const merged: Rec = { ...(previous ?? {}), ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== null)) }
            const label = str(merged.label, 120) || id
            if (!id || !label) return void invalid++
            if (!previous && draft.nodes.length >= maxNodes) return void overflow++
            if (detailTooLong(merged)) longDetails++
            rawNodes.set(id, merged)
            const groupId = str(merged.groupId, 80)
            const node = toNode(merged, id, label, groupIds())
            if (groupId && !node.groupId) wantsGroup.set(id, groupId)
            else wantsGroup.delete(id)
            apply(ops, { op: "node", node })
            if (!previous) flushPending(ops)
            return
        }
        if (op === "edge") {
            if (tryEdge(item, ops) === "pending") pendingEdges.push(item)
            return
        }
        if (op === "note") {
            const note = toNote(item)
            if (!note) return void invalid++
            return apply(ops, { op: "note", note })
        }
        if (op === "remove") {
            const id = str(item.id, 80)
            if (!id) return void invalid++
            rawNodes.delete(id)
            wantsGroup.delete(id)
            return apply(ops, { op: "remove", id })
        }
        invalid++
    }

    const line = (raw: string, ops: AppliedOp[]) => {
        const text = raw.trim()
        if (!inBlock) {
            if (FENCE_OPEN.test(text)) {
                inBlock = true
                sawBlock = true
            }
            return
        }
        if (text.startsWith("```")) {
            inBlock = false
            return
        }
        if (!text) return
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch {
            invalid++
            return
        }
        if (!isRec(parsed)) return void invalid++
        handle(parsed, ops)
    }

    return {
        push(delta) {
            const ops: AppliedOp[] = []
            buffer += delta
            const parts = buffer.split("\n")
            buffer = parts.pop() ?? ""
            for (const part of parts) line(part, ops)
            return ops
        },
        finish() {
            const ops: AppliedOp[] = []
            if (buffer) line(buffer, ops)
            buffer = ""
            inBlock = false
            if (pendingEdges.length) warnings.push(`${pendingEdges.length} aresta(s) com nó inexistente descartada(s)`)
            pendingEdges = []
            if (invalid) warnings.push(`${invalid} linha(s) inválida(s) do diagrama ao vivo descartada(s)`)
            if (longDetails) warnings.push(`${longDetails} descrição(ões) de nó cortada(s) no limite`)
            if (overflow) warnings.push(`${overflow} nó(s) acima do teto ignorado(s) durante a geração`)
            invalid = 0
            longDetails = 0
            return ops
        },
        reset() {
            draft = start()
            buffer = ""
            inBlock = false
            overflow = 0
            invalid = 0
            seedRaw()
            return [{ op: "reset", graph: cloneGraph(draft) }]
        },
        get draft() {
            return draft
        },
        get warnings() {
            return warnings
        },
        get sawBlock() {
            return sawBlock
        },
        get overflow() {
            return overflow
        },
    }
}
