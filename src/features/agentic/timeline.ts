import type { OpencodeFormDto, OpencodePermissionDto, PrWatchOutcome, PrWatchStep, WorkbenchStreamLine } from "./types"

/** Saída da mesa como a tela desenha (módulo puro: o hook só aplica as linhas do stream). */

export type TimelineItem =
    | { kind: "turn"; key: string; stage: string; title: string; agent: string | null; model: string | null; ts: string; end: { outcome: "succeeded" | "failed" | "interrupted"; message: string | null; durationMs: number; costUsd: number } | null }
    | { kind: "user"; key: string; text: string; ts: string }
    | { kind: "text"; key: string; text: string }
    | { kind: "tool"; key: string; id: string; name: string; state: "running" | "done" | "error"; input: string | null; output: string | null; error: string | null }
    | { kind: "notice"; key: string; level: "info" | "warn" | "error" | "success"; message: string }
    | { kind: "permission"; key: string; permission: OpencodePermissionDto; decision: string | null }
    | { kind: "form"; key: string; form: OpencodeFormDto; closed: boolean }
    /** Verificação do PR: `outcome: null` enquanto os passos chegam ao vivo. */
    | { kind: "pr-watch"; key: string; checkId: string; prNumber: number; startedAt: string; steps: PrWatchStep[]; outcome: PrWatchOutcome | null; summary: string | null; nextCheckAt: string | null }

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
        case "permission": {
            // Reconexão pode reenviar uma pendência: atualiza o item existente pelo id (não duplica).
            const index = findLastIndex(items, (item) => item.kind === "permission" && item.permission.id === line.permission.id)
            const item: TimelineItem = { kind: "permission", key: `perm-${line.permission.id}`, permission: line.permission, decision: null }
            return { ...state, items: index >= 0 ? replaceLast(items, index, item) : [...items, item] }
        }
        case "permission-replied": {
            const index = findLastIndex(items, (item) => item.kind === "permission" && item.permission.id === line.id)
            if (index < 0) return state
            const item = items[index] as Extract<TimelineItem, { kind: "permission" }>
            return { ...state, items: replaceLast(items, index, { ...item, decision: line.decision }) }
        }
        case "form": {
            // Reconexão pode reenviar uma pendência: atualiza o item existente pelo id (não duplica).
            const index = findLastIndex(items, (item) => item.kind === "form" && item.form.id === line.form.id)
            const item: TimelineItem = { kind: "form", key: `form-${line.form.id}`, form: line.form, closed: false }
            return { ...state, items: index >= 0 ? replaceLast(items, index, item) : [...items, item] }
        }
        case "form-closed": {
            const index = findLastIndex(items, (item) => item.kind === "form" && item.form.id === line.id)
            if (index < 0) return state
            const item = items[index] as Extract<TimelineItem, { kind: "form" }>
            return { ...state, items: replaceLast(items, index, { ...item, closed: true }) }
        }
        case "pr-watch-step": {
            const step: PrWatchStep = { ts: line.ts, level: line.level, text: line.text }
            const index = findLastIndex(items, (item) => item.kind === "pr-watch" && item.checkId === line.checkId)
            if (index >= 0) {
                const check = items[index] as Extract<TimelineItem, { kind: "pr-watch" }>
                if (check.outcome) return state
                return { ...state, items: replaceLast(items, index, { ...check, steps: [...check.steps, step] }) }
            }
            const item: TimelineItem = { kind: "pr-watch", key: `prw-${line.checkId}`, checkId: line.checkId, prNumber: line.prNumber, startedAt: line.ts, steps: [step], outcome: null, summary: null, nextCheckAt: null }
            return { ...state, items: [...items, item] }
        }
        case "pr-watch": {
            // Verificação sem novidade substitui as anteriores sem novidade (fica só a última, como no histórico gravado).
            const kept = line.outcome === "idle" ? items.filter((item) => item.kind !== "pr-watch" || item.outcome !== "idle" || item.checkId === line.checkId) : items
            const item: TimelineItem = { kind: "pr-watch", key: `prw-${line.checkId}`, checkId: line.checkId, prNumber: line.prNumber, startedAt: line.startedAt, steps: line.steps, outcome: line.outcome, summary: line.summary, nextCheckAt: line.nextCheckAt }
            const index = findLastIndex(kept, (candidate) => candidate.kind === "pr-watch" && candidate.checkId === line.checkId)
            return { ...state, items: index >= 0 ? replaceLast(kept, index, item) : [...kept, item] }
        }
    }
}

/** Última verificação do PR da saída (a que aparece aberta e alimenta a contagem). */
export function latestPrWatch(items: TimelineItem[]): Extract<TimelineItem, { kind: "pr-watch" }> | null {
    const index = findLastIndex(items, (item) => item.kind === "pr-watch")
    return index >= 0 ? (items[index] as Extract<TimelineItem, { kind: "pr-watch" }>) : null
}

/** Horário da próxima verificação: o mais recente entre o agendamento consultado e o informado pela última verificação. */
export function nextPrWatchAt(...candidates: (string | null | undefined)[]): string | null {
    const times = candidates.filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)))
    if (!times.length) return null
    return times.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest))
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
