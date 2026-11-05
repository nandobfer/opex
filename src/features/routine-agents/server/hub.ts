import type { OpexTool } from "@/features/opex-agent/server/tools/define"
import type { HttpSecretVault } from "@/features/http-request/schemas"

/**
 * Turnos vivos das execuções (OPE-130), em memória do processo: o controle de cada ativação
 * (Executando/Esperando). Reinício do servidor perde o turno — o tick marca a execução como **Erro**
 * "O turno da execução foi perdido".
 */

export interface PendingActionDraft {
    summary: string
    kind: "request" | "tool"
    toolName: string | null
    toolLabel: string | null
    /** Entrada original da ferramenta interceptada (JSON), cifrada antes de gravar. */
    input: string | null
    displayInput: string | null
}

export type ActivationOutcome =
    | { kind: "finish"; report: string }
    | { kind: "hibernate"; at: Date; reason: string }
    | { kind: "confirmation"; action: PendingActionDraft }
    | { kind: "live-wait-exceeded" }

export type StopReason = "canceled" | "tokens" | "active" | "turn_timeout"

export interface ActivationUsage {
    tokens: number
    costUsd: number
    /** Algum passo não informou custo. */
    costPartial: boolean
    /** Algum passo informou custo. */
    costKnown: boolean
}

export interface Activation {
    runId: string
    agentId: string
    controller: AbortController
    /** O agente pediu para encerrar o turno (concluir, hibernar, confirmar) — o loop para no fim do passo. */
    outcome: ActivationOutcome | null
    stopReason: StopReason | null
    usage: ActivationUsage
    /** Espera viva acumulada nesta ativação (ms). */
    liveWaitMs: number
    /** Uso já gravado antes desta ativação (limites valem pela execução inteira). */
    baseTokens: number
    baseActiveMs: number
    startedAt: number
    /** Avisos para o relato (ferramenta/MCP removido etc.). */
    warnings: string[]
    /** Ferramentas internas do turno (o MCP da execução, motor OpenCode, expõe só estas). */
    tools: OpexTool[]
    /** Segredos do agente (Chamada HTTP), lidos na hora do turno; os valores só existem em memória. */
    secrets?: HttpSecretVault
}

const globalRegistry = globalThis as unknown as { __routineActivations?: Map<string, Activation> }
const activations = (globalRegistry.__routineActivations ??= new Map())

export function beginActivation(input: { runId: string; agentId: string; baseTokens: number; baseActiveMs: number; warnings?: string[] }): Activation {
    const activation: Activation = {
        runId: input.runId,
        agentId: input.agentId,
        controller: new AbortController(),
        outcome: null,
        stopReason: null,
        usage: { tokens: 0, costUsd: 0, costPartial: false, costKnown: false },
        liveWaitMs: 0,
        baseTokens: input.baseTokens,
        baseActiveMs: input.baseActiveMs,
        startedAt: Date.now(),
        warnings: input.warnings ?? [],
        tools: [],
    }
    activations.set(input.runId, activation)
    return activation
}

export const activationOf = (runId: string) => activations.get(runId) ?? null
export const isActivationAlive = (runId: string) => activations.has(runId)

export function endActivation(runId: string): void {
    activations.delete(runId)
}

/** Interrompe o turno vivo (cancelar, limite). Devolve se havia turno. */
export function stopActivation(runId: string, reason: StopReason): boolean {
    const activation = activations.get(runId)
    if (!activation) return false
    activation.stopReason ??= reason
    activation.controller.abort(reason)
    return true
}

/** Soma o uso de um passo. */
export function addUsage(activation: Activation, step: { tokens: number; costUsd: number | null }): void {
    activation.usage.tokens += Math.max(0, step.tokens)
    if (step.costUsd === null) activation.usage.costPartial = true
    else {
        activation.usage.costKnown = true
        activation.usage.costUsd += step.costUsd
    }
}

/** Testes: limpa os turnos vivos. */
export function resetActivationsForTests(): void {
    activations.clear()
}
