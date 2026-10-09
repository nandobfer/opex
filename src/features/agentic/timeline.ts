import type { WorkbenchStage } from "./constants"
import type { OpencodeFormDto, OpencodePermissionDto, WorkbenchStreamLine } from "./types"

/** Saída da mesa como a tela desenha (módulo puro: o hook só aplica as linhas do stream). */

export type TimelineItem =
    | { kind: "turn"; key: string; stage: WorkbenchStage; title: string; agent: string | null; model: string | null; ts: string; end: { outcome: "succeeded" | "failed" | "interrupted"; message: string | null; durationMs: number; costUsd: number } | null }
    | { kind: "user"; key: string; text: string; ts: string }
    | { kind: "text"; key: string; text: string }
    | { kind: "tool"; key: string; id: string; name: string; state: "running" | "done" | "error"; input: string | null; output: string | null; error: string | null }
    | { kind: "notice"; key: string; level: "info" | "warn" | "error" | "success"; message: string }
    | { kind: "permission"; key: string; permission: OpencodePermissionDto; decision: string | null }
    | { kind: "form"; key: string; form: OpencodeFormDto; closed: boolean }

export interface TimelineState {
    items: TimelineItem[]
    /** O modelo está raciocinando (some quando chega texto ou ferramenta). */
    reasoning: boolean
    /** Já recebeu a carga inicial (o `reset` do stream). */
    loaded: boolean
}

export const INITIAL_TIMELINE: TimelineState = { items: [], reasoning: false, loaded: false }

const keyOf = (prefix: string, seq: number | undefined, fallback: number) => `${prefix}-${seq ?? `x${fallback}`}`

function replaceLast<T extends TimelineItem>(items: TimelineItem[], index: number, item: T): TimelineItem[] {
    const next = items.slice()
    next[index] = item
    return next
}

function findLastIndex(items: TimelineItem[], test: (item: TimelineItem) => boolean): number {
    for (let index = items.length - 1; index >= 0; index--) if (test(items[index]!)) return index
    return -1
}

export function applyTimelineLine(state: TimelineState, line: WorkbenchStreamLine): TimelineState {
    const items = state.items
    switch (line.type) {
        case "reset":
            return { ...INITIAL_TIMELINE, loaded: true }
        case "ping":
            return state
        case "reasoning":
            return state.reasoning ? state : { ...state, reasoning: true }
        case "text": {
            const last = items.at(-1)
            if (last?.kind === "text") return { ...state, reasoning: false, items: replaceLast(items, items.length - 1, { ...last, text: last.text + line.text }) }
            return { ...state, reasoning: false, items: [...items, { kind: "text", key: keyOf("text", line.seq, items.length), text: line.text }] }
        }
        case "tool": {
            const index = findLastIndex(items, (item) => item.kind === "tool" && item.id === line.id)
            const previous = index >= 0 ? (items[index] as Extract<TimelineItem, { kind: "tool" }>) : null
            const item: TimelineItem = {
                kind: "tool",
                key: previous?.key ?? `tool-${line.id}`,
                id: line.id,
                name: line.name,
                state: line.state,
                input: line.input ?? previous?.input ?? null,
                output: line.output ?? previous?.output ?? null,
                error: line.error ?? null,
            }
            return { ...state, reasoning: false, items: index >= 0 ? replaceLast(items, index, item) : [...items, item] }
        }
        case "tool-progress": {
            const index = findLastIndex(items, (item) => item.kind === "tool" && item.id === line.id)
            if (index < 0) return state
            const tool = items[index] as Extract<TimelineItem, { kind: "tool" }>
            return { ...state, items: replaceLast(items, index, { ...tool, output: line.output }) }
        }
        case "turn":
            return { ...state, reasoning: false, items: [...items, { kind: "turn", key: keyOf("turn", line.seq, items.length), stage: line.stage, title: line.title, agent: line.agent, model: line.model, ts: line.ts, end: null }] }
        case "turn-end": {
            const index = findLastIndex(items, (item) => item.kind === "turn")
            if (index < 0) return { ...state, reasoning: false }
            const turn = items[index] as Extract<TimelineItem, { kind: "turn" }>
            return { ...state, reasoning: false, items: replaceLast(items, index, { ...turn, end: { outcome: line.outcome, message: line.message, durationMs: line.durationMs, costUsd: line.costUsd } }) }
        }
        case "user":
            return { ...state, items: [...items, { kind: "user", key: keyOf("user", line.seq, items.length), text: line.text, ts: line.ts }] }
        case "notice":
            return { ...state, items: [...items, { kind: "notice", key: keyOf("notice", line.seq, items.length), level: line.level, message: line.message }] }
        case "permission":
            return { ...state, items: [...items, { kind: "permission", key: `perm-${line.permission.id}`, permission: line.permission, decision: null }] }
        case "permission-replied": {
            const index = findLastIndex(items, (item) => item.kind === "permission" && item.permission.id === line.id)
            if (index < 0) return state
            const item = items[index] as Extract<TimelineItem, { kind: "permission" }>
            return { ...state, items: replaceLast(items, index, { ...item, decision: line.decision }) }
        }
        case "form":
            return { ...state, items: [...items, { kind: "form", key: `form-${line.form.id}`, form: line.form, closed: false }] }
        case "form-closed": {
            const index = findLastIndex(items, (item) => item.kind === "form" && item.form.id === line.id)
            if (index < 0) return state
            const item = items[index] as Extract<TimelineItem, { kind: "form" }>
            return { ...state, items: replaceLast(items, index, { ...item, closed: true }) }
        }
    }
}

/** Divide um pedaço NDJSON em linhas completas e o resto. */
export function splitNdjson(buffer: string): { lines: WorkbenchStreamLine[]; rest: string } {
    const parts = buffer.split("\n")
    const rest = parts.pop() ?? ""
    const lines: WorkbenchStreamLine[] = []
    for (const part of parts) {
        if (!part.trim()) continue
        try {
            lines.push(JSON.parse(part) as WorkbenchStreamLine)
        } catch {
            // linha corrompida: ignora
        }
    }
    return { lines, rest }
}

export const DECISION_LABELS: Record<string, string> = { once: "Aprovado uma vez", always: "Aprovado sempre", reject: "Recusado" }
