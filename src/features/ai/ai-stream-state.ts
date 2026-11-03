import type { AiUsage } from "@/lib/ai/stream"
import type { AiStreamEvent } from "./types"

/** Estado de um stream de texto de IA (módulo puro: o hook só aplica os eventos do stream). */

export type AiStreamPhase = "idle" | "running" | "done" | "error" | "cancelled"

export interface AiStreamToolCall {
    id: string
    name: string
    state: "running" | "done" | "error"
}

export interface AiStreamState {
    status: AiStreamPhase
    text: string
    provider: string | null
    model: string | null
    agent: string | null
    /** O modelo está raciocinando (antes do primeiro texto). */
    reasoning: boolean
    tools: AiStreamToolCall[]
    notices: string[]
    usage: AiUsage | null
    durationMs: number | null
    error: string | null
}

export const INITIAL_AI_STREAM_STATE: AiStreamState = {
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

export function applyAiStreamEvent(state: AiStreamState, event: AiStreamEvent): AiStreamState {
    switch (event.type) {
        case "start":
            return { ...INITIAL_AI_STREAM_STATE, status: "running", provider: event.provider, model: event.model, agent: event.agent }
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
export function finishAiStream(state: AiStreamState): AiStreamState {
    return state.status === "running" ? { ...state, status: "error", reasoning: false, error: "A conexão com o servidor foi interrompida antes do fim da resposta" } : state
}
