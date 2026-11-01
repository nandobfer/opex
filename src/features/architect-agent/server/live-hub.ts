import type { ArchitectDiagramState } from "../constants"
import type { ArchitectGraph } from "../graph"
import { applyOps, type AppliedOp } from "../stream-parser"
import type { ArchitectLiveProgress, ArchitectStreamLine } from "../types"

/**
 * Diagramas sendo desenhados AGORA neste processo (SOMENTE servidor): o rascunho atual, a sequência
 * das operações e os assinantes do stream NDJSON. Quem conecta recebe primeiro o retrato (`snapshot`,
 * com o `seq` em que ele está) e depois as operações numeradas; reconectar recomeça pelo retrato.
 */

type Listener = (line: ArchitectStreamLine) => void

interface LiveEntry {
    seq: number
    draft: ArchitectGraph
    progress: ArchitectLiveProgress
    listeners: Set<Listener>
}

const globalHub = globalThis as unknown as { __architectLiveHub?: Map<string, LiveEntry> }
const hub = (globalHub.__architectLiveHub ??= new Map())

const countsOf = (graph: ArchitectGraph) => ({ nodes: graph.nodes.length, edges: graph.edges.length })

export function openLive(diagramId: string, draft: ArchitectGraph): void {
    hub.set(diagramId, { seq: 0, draft, progress: { phase: "starting", tools: 0, ...countsOf(draft) }, listeners: new Set() })
}

function snapshotOf(diagramId: string): ArchitectStreamLine | null {
    const entry = hub.get(diagramId)
    return entry ? { type: "snapshot", seq: entry.seq, live: true, graph: entry.draft, progress: entry.progress } : null
}

export function emitOps(diagramId: string, ops: readonly AppliedOp[]): void {
    const entry = hub.get(diagramId)
    if (!entry || !ops.length) return
    entry.draft = applyOps(entry.draft, ops)
    entry.seq += 1
    entry.progress = { ...entry.progress, ...countsOf(entry.draft) }
    const line: ArchitectStreamLine = { type: "ops", seq: entry.seq, ops: [...ops] }
    for (const listener of entry.listeners) listener(line)
}

export function emitProgress(diagramId: string, patch: Partial<Pick<ArchitectLiveProgress, "phase" | "tools">>): void {
    const entry = hub.get(diagramId)
    if (!entry) return
    entry.progress = { ...entry.progress, ...patch }
    for (const listener of entry.listeners) listener({ type: "progress", progress: entry.progress })
}

/** Fim da geração: avisa o estado final e solta os assinantes. */
export function closeLive(diagramId: string, state: ArchitectDiagramState): void {
    const entry = hub.get(diagramId)
    if (!entry) return
    hub.delete(diagramId)
    for (const listener of entry.listeners) listener({ type: "end", state })
}

export const liveDraftOf = (diagramId: string): ArchitectGraph | null => hub.get(diagramId)?.draft ?? null

/**
 * Assina o diagrama vivo: devolve o retrato atual e já fica inscrito, antes do retrato, para nenhuma
 * operação cair entre os dois. Sem geração viva neste processo: `null` (o stream usa o rascunho gravado).
 */
export function subscribeLive(diagramId: string, listener: Listener): { snapshot: ArchitectStreamLine; unsubscribe: () => void } | null {
    const entry = hub.get(diagramId)
    if (!entry) return null
    entry.listeners.add(listener)
    return { snapshot: snapshotOf(diagramId)!, unsubscribe: () => entry.listeners.delete(listener) }
}
