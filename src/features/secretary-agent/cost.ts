/**
 * Custo do Agente Secretário (puro). O OpenCode Go e o Command Code informam o custo de cada passo; para os
 * demais provedores o custo é ESTIMADO pela tabela de preços da aba Geral (US$ por 1M de tokens), decisão
 * do dono na OPE-192.
 */

/** Provedores que devolvem o custo real em US$ (não precisam de preço na tabela). */
export const COST_REPORTING_PROVIDERS: readonly string[] = ["opencode-go", "command-code"]

export interface TokenPrice {
    inputPerMTok: number
    outputPerMTok: number
}

export interface TokenUsage {
    inputTokens: number
    outputTokens: number
}

export const priceKey = (provider: string, model: string) => `${provider}/${model}`

export function needsPrice(provider: string | null | undefined): boolean {
    return Boolean(provider) && !COST_REPORTING_PROVIDERS.includes(provider!)
}

export function estimateCostUsd(usage: TokenUsage, price: TokenPrice | null | undefined): number | null {
    if (!price) return null
    const cost = (Math.max(0, usage.inputTokens) * price.inputPerMTok + Math.max(0, usage.outputTokens) * price.outputPerMTok) / 1_000_000
    return Math.round(cost * 1e6) / 1e6
}

/** Custo do passo: o informado pelo provedor; sem ele, a estimativa pela tabela; sem preço, zero. */
export function stepCostUsd(reported: number | null | undefined, usage: TokenUsage, price: TokenPrice | null | undefined): { costUsd: number; estimated: boolean } {
    if (typeof reported === "number" && Number.isFinite(reported)) return { costUsd: reported, estimated: false }
    const estimated = estimateCostUsd(usage, price)
    return { costUsd: estimated ?? 0, estimated: estimated !== null }
}
