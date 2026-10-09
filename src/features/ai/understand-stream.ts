import type { AiUsage } from "@/lib/ai/stream"
import type { UnderstandTaskEvent } from "./types"

/** Estado do modal "Entender tarefa" (módulo puro: o hook só aplica os eventos do stream). */

export type UnderstandStatus = "idle" | "running" | "done" | "error" | "cancelled"

export interface UnderstandToolCall {
    id: string
    name: string
    state: "running" | "done" | "error"
}

export interface UnderstandState {
    status: UnderstandStatus
    text: string
    provider: string | null
    model: string | null
    agent: string | null
    /** O modelo está raciocinando (antes do primeiro texto). */
    reasoning: boolean
    tools: UnderstandToolCall[]
    notices: string[]
    usage: AiUsage | null
    durationMs: number | null
    error: string | null
}

export const INITIAL_UNDERSTAND_STATE: UnderstandState = {
    status: "idle",
    text: "",
    provider: null,
    model: null,
    agent: null,
    reasoning: false,
    tools: [],
    notices: [],
    usage: null,
    durationMs: null,
    error: null,
}

export function applyUnderstandEvent(state: UnderstandState, event: UnderstandTaskEvent): UnderstandState {
    switch (event.type) {
        case "start":
            return { ...INITIAL_UNDERSTAND_STATE, status: "running", provider: event.provider, model: event.model, agent: event.agent }
        case "delta":
            return { ...state, text: state.text + event.text, reasoning: false }
        case "reasoning":
            return state.text ? state : { ...state, reasoning: true }
        case "tool": {
            const exists = state.tools.some((tool) => tool.id === event.id)
            const tools = exists ? state.tools.map((tool) => (tool.id === event.id ? { ...tool, state: event.state } : tool)) : [...state.tools, { id: event.id, name: event.name, state: event.state }]
            return { ...state, tools }
        }
        case "notice":
            return { ...state, notices: [...state.notices, event.message] }
        case "done":
            return { ...state, status: "done", reasoning: false, usage: event.usage, durationMs: event.durationMs }
        case "error":
            return { ...state, status: "error", reasoning: false, error: event.message }
    }
}

/** Fim do stream sem `done`/`error` (conexão caiu): vira erro, preservando o texto parcial. */
export function finishUnderstandStream(state: UnderstandState): UnderstandState {
    return state.status === "running" ? { ...state, status: "error", reasoning: false, error: "A conexão com o servidor foi interrompida antes do fim da resposta" } : state
}
