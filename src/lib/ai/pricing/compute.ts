import type { ListCost, ModelPrice, PriceTier, PriceTierLabel, TokenBreakdown } from "./types"

/**
 * Custo de tabela a partir dos tokens e do preço (módulo PURO, OPE-203). A faixa é escolhida pela entrada do
 * passo (contexto); cache sem preço próprio é cobrado pelo preço de entrada; a saída é cobrada pelo total (o
 * raciocínio já está dentro dela). Sem tokens de entrada ou saída, o custo é desconhecido (`null`), nunca zero.
 */

const PER = 1_000_000
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const nonNegative = (value: number | null | undefined): number | null => (finite(value) ? Math.max(0, value) : null)

export const roundUsd = (value: number) => Math.round(value * 1e6) / 1e6

/** Entrada total do passo: a informada ou a soma das partes. */
export function totalInputOf(tokens: TokenBreakdown): number | null {
    const input = nonNegative(tokens.input)
    if (input !== null) return input
    const parts = [tokens.noCache, tokens.cacheRead, tokens.cacheWrite].map(nonNegative)
    return parts.every((part) => part === null) ? null : parts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
}

/** Faixa do contexto: a primeira cujo teto comporta a entrada (sem teto = última). */
export function tierFor(tiers: readonly PriceTier[], contextTokens: number): { tier: PriceTier; index: number } | null {
    if (!tiers.length) return null
    const index = tiers.findIndex((tier) => tier.maxContext === null || contextTokens <= tier.maxContext)
    const found = index >= 0 ? index : tiers.length - 1
    return { tier: tiers[found]!, index: found }
}

export function missingCost(reason: string, source: ListCost["source"] = null): ListCost {
    return { usd: null, source, price: null, estimated: false, missingReason: reason }
}

/** Custo de tabela de um passo pelo preço do modelo. */
export function listCostOf(tokens: TokenBreakdown, price: ModelPrice): ListCost {
    const input = totalInputOf(tokens)
    const output = nonNegative(tokens.output)
    if (input === null || output === null) return missingCost("O provedor não informou os tokens do passo", price.source)
    const picked = tierFor(price.tiers, input)
    if (!picked) return missingCost("Preço sem faixas", price.source)
    const { rates } = picked.tier
    const cacheRead = nonNegative(tokens.cacheRead) ?? 0
    const cacheWrite = nonNegative(tokens.cacheWrite) ?? 0
    const noCache = nonNegative(tokens.noCache) ?? Math.max(0, input - cacheRead - cacheWrite)
    const usd = (noCache * rates.inputPerMTok + cacheRead * (rates.cacheReadPerMTok ?? rates.inputPerMTok) + cacheWrite * (rates.cacheWritePerMTok ?? rates.inputPerMTok) + output * rates.outputPerMTok) / PER
    const label: PriceTierLabel | null = price.label ?? (picked.index > 0 ? "long-context" : null)
    return {
        usd: roundUsd(usd),
        source: price.source,
        price: { inputPerMTok: rates.inputPerMTok, cacheReadPerMTok: rates.cacheReadPerMTok, cacheWritePerMTok: rates.cacheWritePerMTok, outputPerMTok: rates.outputPerMTok, tier: label, catalogAt: price.catalogAt },
        estimated: false,
        missingReason: null,
    }
}

/** Custo de tabela informado pela própria resposta (OpenCode Go: `list_cost`). */
export function reportedListCost(listCostUsd: number | null | undefined, source: ListCost["source"]): ListCost {
    if (!finite(listCostUsd)) return missingCost("A resposta não informou o custo de tabela", source)
    return { usd: roundUsd(Math.max(0, listCostUsd)), source, price: null, estimated: false, missingReason: null }
}
