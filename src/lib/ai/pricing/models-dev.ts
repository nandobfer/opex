import { MODELS_DEV_DEFAULT_CATALOG_URL } from "@/lib/integrations/catalog"
import type { ModelPrice, PriceRates, PriceTier } from "./types"

/**
 * Catálogo de preços do models.dev (módulo PURO, OPE-203): `GET https://models.dev/api.json` devolve
 * `{ [provedor]: { models: { [modelo]: { cost: { input, output, cache_read?, cache_write?, tiers?, context_over_200k? } } } } }`
 * (conferido em 26/11/2026). `tiers` traz as faixas de contexto longo (`tier: { type: "context", size }`: a base vale até
 * `size` tokens de entrada); sem `tiers`, `context_over_200k` é a faixa acima de 200 mil.
 */

export const MODELS_DEV_DEFAULT_URL = MODELS_DEV_DEFAULT_CATALOG_URL

/** Provedor do Opex → provedor no models.dev. */
export const MODELS_DEV_PROVIDERS = { anthropic: "anthropic", openai: "openai", gemini: "google" } as const
export type ModelsDevProvider = keyof typeof MODELS_DEV_PROVIDERS

export function isModelsDevProvider(provider: string): provider is ModelsDevProvider {
    return provider in MODELS_DEV_PROVIDERS
}

export interface ModelsDevCost {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
    tiers?: { input?: number; output?: number; cache_read?: number; cache_write?: number; tier?: { type?: string; size?: number } }[]
    context_over_200k?: { input?: number; output?: number; cache_read?: number; cache_write?: number }
}

/** Só os custos dos provedores usados, por modelo (é o que vai para o cache e o banco). */
export type ModelsDevCatalog = Partial<Record<ModelsDevProvider, Record<string, ModelsDevCost>>>

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0

/** Reduz o `api.json` aos custos dos provedores usados; formato inesperado vira catálogo vazio. */
export function parseModelsDevCatalog(body: unknown): ModelsDevCatalog {
    const catalog: ModelsDevCatalog = {}
    if (!body || typeof body !== "object") return catalog
    for (const [opex, remote] of Object.entries(MODELS_DEV_PROVIDERS) as [ModelsDevProvider, string][]) {
        const models = (body as Record<string, { models?: Record<string, { cost?: ModelsDevCost }> }>)[remote]?.models
        if (!models || typeof models !== "object") continue
        const costs: Record<string, ModelsDevCost> = {}
        for (const [id, model] of Object.entries(models)) if (model?.cost && finite(model.cost.input) && finite(model.cost.output)) costs[id] = model.cost
        catalog[opex] = costs
    }
    return catalog
}

function ratesOf(cost: { input?: number; output?: number; cache_read?: number; cache_write?: number }, base?: PriceRates): PriceRates | null {
    const input = finite(cost.input) ? cost.input : base?.inputPerMTok
    const output = finite(cost.output) ? cost.output : base?.outputPerMTok
    if (input === undefined || output === undefined) return null
    return {
        inputPerMTok: input,
        outputPerMTok: output,
        cacheReadPerMTok: finite(cost.cache_read) ? cost.cache_read : (base?.cacheReadPerMTok ?? null),
        cacheWritePerMTok: finite(cost.cache_write) ? cost.cache_write : (base?.cacheWritePerMTok ?? null),
    }
}

/** Id do modelo no catálogo: exato, sem o prefixo `models/` (Gemini) ou sem o sufixo de data. */
function lookup(models: Record<string, ModelsDevCost>, model: string): ModelsDevCost | null {
    const id = model.trim()
    const candidates = [id, id.replace(/^models\//, ""), id.replace(/-\d{8}$/, ""), id.replace(/-\d{4}-\d{2}-\d{2}$/, "")]
    for (const candidate of candidates) if (models[candidate]) return models[candidate]!
    return null
}

/** Preço do modelo no catálogo; `null` se o provedor ou o modelo não estão lá. */
export function modelsDevPrice(catalog: ModelsDevCatalog, provider: string, model: string, catalogAt: string | null): ModelPrice | null {
    if (!isModelsDevProvider(provider)) return null
    const models = catalog[provider]
    const cost = models ? lookup(models, model) : null
    if (!cost) return null
    const base = ratesOf(cost)
    if (!base) return null
    const tiers: PriceTier[] = []
    const extra = (cost.tiers ?? []).filter((tier) => tier.tier?.type === "context" && finite(tier.tier.size)).sort((a, b) => a.tier!.size! - b.tier!.size!)
    if (extra.length) {
        tiers.push({ maxContext: extra[0]!.tier!.size!, rates: base })
        extra.forEach((tier, index) => {
            const rates = ratesOf(tier, base)
            if (rates) tiers.push({ maxContext: extra[index + 1]?.tier?.size ?? null, rates })
        })
    } else if (cost.context_over_200k) {
        const long = ratesOf(cost.context_over_200k, base)
        tiers.push({ maxContext: long ? 200_000 : null, rates: base })
        if (long) tiers.push({ maxContext: null, rates: long })
    } else tiers.push({ maxContext: null, rates: base })
    return { source: "models.dev", tiers, catalogAt }
}
