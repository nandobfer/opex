import type { TurnResult } from "@/lib/ai/opencode-run"
import { modelChain } from "../logic"
import type { AgentConfig } from "../schemas"
import { describeModel } from "./models"

/**
 * Modelos de fallback de um turno da mesa ou do fork: roda o turno com o modelo principal e, se o
 * **modelo/provedor** falhar (`failure: "model"`), reenvia o turno na mesma sessão com o próximo
 * modelo da lista, pedindo para retomar de onde parou. Parar, conexão perdida, reconexão e erros da
 * etapa não trocam de modelo. O fallback vale só para este turno (o próximo começa pelo principal).
 */

export interface FallbackSwitch {
    from: AgentConfig
    to: AgentConfig
    /** Posição do fallback que assume (1 = primeiro fallback). */
    index: number
    total: number
    reason: string
}

export interface FallbackOptions {
    signal: AbortSignal
    /** Reconexão: acompanha a execução existente, sem trocar de modelo. */
    attach?: boolean
    /** Texto reenviado ao trocar de modelo (padrão: retomada da etapa). */
    resumeText?: (reason: string, text: string) => string
    onSwitch?: (change: FallbackSwitch) => void | Promise<void>
}

/** Texto da retomada com o modelo seguinte (mesmo do "Tentar novamente" da mesa). */
export function fallbackResumeText(reason: string, text: string): string {
    return `A execução anterior desta etapa não terminou (${reason}). Retome de onde parou e conclua a etapa conforme as instruções abaixo.\n\n${text}`
}

/** Aviso da troca na saída: "X falhou (motivo): continuando com Y — fallback 1 de 2." */
export function fallbackNotice(change: FallbackSwitch): string {
    return `${describeModel(change.from)} falhou (${change.reason}): continuando com ${describeModel(change.to)} — fallback ${change.index} de ${change.total}.`
}

export async function runWithFallback(agent: AgentConfig, text: string, run: (agent: AgentConfig, text: string) => Promise<TurnResult>, options: FallbackOptions): Promise<TurnResult> {
    const chain = modelChain(agent)
    const attempts = options.attach ? chain.slice(0, 1) : chain
    const resume = options.resumeText ?? fallbackResumeText
    let costUsd = 0
    let durationMs = 0
    let prompt = text
    for (let index = 0; ; index++) {
        const result = await run(attempts[index], prompt)
        costUsd += result.costUsd
        durationMs += result.durationMs
        const next = attempts[index + 1]
        if (result.outcome !== "failed" || result.failure !== "model" || !next || options.signal.aborted) return { ...result, costUsd, durationMs }
        const reason = result.message ?? "erro do provedor"
        await options.onSwitch?.({ from: attempts[index], to: next, index: index + 1, total: attempts.length - 1, reason })
        prompt = resume(reason, text)
    }
}
