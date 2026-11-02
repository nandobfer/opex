import type { TurnEvent, TurnResult } from "@/lib/ai/opencode-run"
import type { AiTextProviderId } from "@/lib/ai/providers"
import { streamAi } from "@/lib/ai/stream"

/** Pedido de um turno do arquiteto num provedor direto (Gemini, Anthropic, OpenAI, DeepSeek). */
export interface DirectTurnRequest {
    provider: Exclude<AiTextProviderId, "opencode">
    model: string
    variant: string | null
    instructions: string
    prompt: string
    timeoutMs: number
    signal: AbortSignal
    consumption: { origin: string; subject: string }
}

export interface DirectTurnUsage {
    inputTokens: number
    outputTokens: number
}

/**
 * Um turno do arquiteto por `streamAi` (sem sessão nem ferramentas: o provedor não lê o repositório),
 * no mesmo formato de resultado do turno do OpenCode. Cada pedaço de texto vai para `onEvent`, que
 * alimenta o montador ao vivo; o consumo é registrado pela própria `streamAi`.
 */
export async function runDirectTurn(request: DirectTurnRequest, hooks: { onEvent: (event: TurnEvent) => void; onUsage: (usage: DirectTurnUsage) => Promise<void> | void }): Promise<TurnResult> {
    const startedAt = Date.now()
    const timeout = AbortSignal.timeout(request.timeoutMs)
    const signal = AbortSignal.any([request.signal, timeout])
    let text = ""
    let error: string | null = null
    let done = false
    try {
        for await (const event of streamAi({
            provider: request.provider,
            model: request.model,
            variant: request.variant,
            instructions: request.instructions,
            prompt: request.prompt,
            signal,
            consumption: request.consumption,
        })) {
            if (event.type === "delta") {
                text += event.text
                hooks.onEvent({ type: "text", text: event.text })
            } else if (event.type === "error") {
                error = event.message
            } else if (event.type === "done") {
                done = true
                await hooks.onUsage({ inputTokens: event.usage.inputTokens ?? 0, outputTokens: event.usage.outputTokens ?? 0 })
            }
        }
    } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught)
    }
    const durationMs = Date.now() - startedAt
    if (request.signal.aborted) return { outcome: "interrupted", text, message: "geração cancelada", costUsd: 0, durationMs, failure: "other" }
    if (timeout.aborted) return { outcome: "failed", text, message: `o modelo não terminou em ${Math.round(request.timeoutMs / 60_000)} min (tempo máximo da configuração)`, costUsd: 0, durationMs, failure: "other" }
    if (error || !done) return { outcome: "failed", text, message: error ?? "o provedor encerrou a resposta sem concluir", costUsd: 0, durationMs, failure: "model" }
    return { outcome: "succeeded", text, message: null, costUsd: 0, durationMs }
}
