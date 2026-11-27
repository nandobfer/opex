import type { ModelPrice, PriceRates, PriceTier } from "./types"

/**
 * Preço do catálogo do Command Code (módulo PURO, OPE-203): `GET /provider/v1/models?view=client` traz em cada modelo
 * `pricing: { inputCost, outputCost, cacheReadCost?, cacheWriteCost?, cacheWrite1hCost?, contextTiers? }`, em US$ por
 * 1M de tokens; `contextTiers: [{ maxContext?, rates }]` (a última faixa sem `maxContext`). Conferido em 26/11/2026.
 * A escrita de cache usa `cacheWriteCost` (TTL padrão de 5 min; o de 1 h não é distinguível na resposta).
 */

export interface CommandCodePricingRates {
    inputCost?: number
    outputCost?: number
    cacheReadCost?: number
    cacheWriteCost?: number
    cacheWrite1hCost?: number
}

export interface CommandCodePricing extends CommandCodePricingRates {
    contextTiers?: { maxContext?: number | null; rates?: CommandCodePricingRates }[]
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0

function ratesOf(raw: CommandCodePricingRates | undefined): PriceRates | null {
    if (!raw || !finite(raw.inputCost) || !finite(raw.outputCost)) return null
    return {
        inputPerMTok: raw.inputCost,
        outputPerMTok: raw.outputCost,
        cacheReadPerMTok: finite(raw.cacheReadCost) ? raw.cacheReadCost : null,
        cacheWritePerMTok: finite(raw.cacheWriteCost) ? raw.cacheWriteCost : null,
    }
}

/** Preço do modelo pelo `pricing` do catálogo; `null` sem preço. */
export function commandCodePrice(pricing: CommandCodePricing | null | undefined, catalogAt: string | null): ModelPrice | null {
    if (!pricing) return null
    const tiers: PriceTier[] = []
    for (const tier of pricing.contextTiers ?? []) {
        const rates = ratesOf(tier?.rates)
        if (rates) tiers.push({ maxContext: finite(tier.maxContext) ? tier.maxContext : null, rates })
    }
    tiers.sort((a, b) => (a.maxContext ?? Infinity) - (b.maxContext ?? Infinity))
    if (!tiers.length) {
        const base = ratesOf(pricing)
        if (!base) return null
        tiers.push({ maxContext: null, rates: base })
    }
    return { source: "command-code-catalog", tiers, catalogAt }
}
