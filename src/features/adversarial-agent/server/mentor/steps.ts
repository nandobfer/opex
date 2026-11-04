import { memoryChannelOf } from "@/features/ai/agents"
import { listAgentMemories } from "@/features/ai/server/agent-memory-service"
import type { AiProviderId } from "@/lib/ai/providers"
import { loggerFor } from "@/lib/logger"
import type { MentorTarget } from "../../mentor/constants"

/**
 * Etapas compartilhadas do pipeline do Mentor (execuções e reorganização do acervo): geração de texto
 * pelo provedor configurado, limites do canal e leitura das memórias de uma lista. Os imports pesados
 * (`streamAi`) continuam sob demanda.
 */

export const log = loggerFor({ module: "adversarial-agent", feature: "mentor" })

export interface StepUsage {
    costUsd: number
}

/** Central da lista: só `developer-central` tem (a da mesa). */
export const centralOf = (target: MentorTarget, centralId: string | null) => (target === "developer-central" ? centralId : null)

/**
 * Tamanho máximo do canal de destino (`memory.text_max` do Engramind, com a sobreposição do canal), para o
 * redator reescrever antes de o serviço recusar. Sem o Engramind, o padrão; o serviço ainda confere ao gravar.
 */
export async function targetTextMax(target: MentorTarget, centralId: string | null): Promise<number | undefined> {
    try {
        const { memoryLimitsFor } = await import("@/features/ai/server/memory-settings")
        return (await memoryLimitsFor(memoryChannelOf(target, { centralId }))).textMax
    } catch (error) {
        log.warn({ target, err: error instanceof Error ? error.message : String(error) }, "[mentor] limites das memórias indisponíveis: usando o padrão")
        return undefined
    }
}

/** Memórias de uma lista (Engramind), no formato que o redator lê. */
export async function listTargetMemories(target: MentorTarget, centralId: string | null): Promise<{ id: string; summary: string; text: string }[]> {
    return (await listAgentMemories(target, centralOf(target, centralId))).map((memory) => ({ id: memory.id, summary: memory.resumo, text: memory.texto }))
}

/** Gera texto pelo provedor configurado e devolve o texto e o custo (lança na falha). */
export async function generate(
    request: { provider: AiProviderId; model: string; variant: string | null; instructions: string; prompt: string; timeoutSeconds: number; origin: string; subject: string; signal?: AbortSignal },
    usage: StepUsage,
): Promise<string> {
    const { streamAi } = await import("@/lib/ai/stream")
    let text = ""
    for await (const event of streamAi({
        provider: request.provider,
        model: request.model,
        variant: request.variant,
        instructions: request.instructions,
        prompt: request.prompt,
        title: "Agente Mentor",
        signal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutSeconds * 1000)]) : AbortSignal.timeout(request.timeoutSeconds * 1000),
        consumption: { origin: request.origin, subject: request.subject },
    })) {
        if (event.type === "delta") text += event.text
        if (event.type === "error") throw new Error(event.message)
        if (event.type === "done") usage.costUsd += event.usage.costUsd ?? 0
    }
    return text
}
