/**
 * Custo de tabela das chamadas de IA (OPE-203, módulo PURO): tipos comuns às fontes de preço (tabela oficial do
 * DeepSeek, catálogo do models.dev, catálogo do Command Code e o custo informado pela resposta do OpenCode Go).
 * Preços sempre em US$ por 1M de tokens; custo desconhecido é `null` (nunca zero).
 */

export const PRICE_SOURCES = ["deepseek-table", "models.dev", "command-code-catalog", "opencode-go-response"] as const
export type PriceSource = (typeof PRICE_SOURCES)[number]

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
    "deepseek-table": "Tabela oficial do DeepSeek",
    "models.dev": "Catálogo do models.dev",
    "command-code-catalog": "Catálogo do Command Code",
    "opencode-go-response": "Resposta do OpenCode Go",
}

/** Tokens de um passo, separados como a SDK `ai` v7 informa (`inputTokenDetails`/`outputTokenDetails`). */
export interface TokenBreakdown {
    /** Entrada total (sem cache + cache lido + cache escrito). */
    input: number | null
    noCache: number | null
    cacheRead: number | null
    cacheWrite: number | null
    /** Saída total (texto + raciocínio): é o que se cobra pelo preço de saída. */
    output: number | null
    /** Raciocínio (parte da saída; aparece separado, sem cobrança dupla). */
    reasoning: number | null
}

export interface PriceRates {
    inputPerMTok: number
    outputPerMTok: number
    /** `null` = a fonte não informa (o cache lido é cobrado pelo preço de entrada). */
    cacheReadPerMTok: number | null
    cacheWritePerMTok: number | null
}

/** Faixa de preço por tamanho do contexto (entrada do passo). `maxContext` nulo = sem teto (última faixa). */
export interface PriceTier {
    maxContext: number | null
    rates: PriceRates
}

export type PriceTierLabel = "peak" | "off-peak" | "long-context"

/** Preço de um modelo numa fonte, com as faixas em ordem crescente de contexto. */
export interface ModelPrice {
    source: PriceSource
    tiers: PriceTier[]
    /** Rótulo fixo do preço (DeepSeek: pico/fora de pico). */
    label?: PriceTierLabel | null
    /** Quando o catálogo foi lido (ISO); `null` na tabela fixa do código. */
    catalogAt: string | null
}

/** Preço vigente congelado no passo. */
export interface PriceSnapshot {
    inputPerMTok: number | null
    cacheReadPerMTok: number | null
    cacheWritePerMTok: number | null
    outputPerMTok: number | null
    tier: PriceTierLabel | null
    catalogAt: string | null
}

/** Custo de tabela de um passo, como é gravado em `ai_consumption_logs.listCost`. */
export interface ListCost {
    usd: number | null
    source: PriceSource | null
    price: PriceSnapshot | null
    /** Estimado depois (histórico, sem a separação do cache). */
    estimated: boolean
    /** Por que não há preço (`usd` nulo). */
    missingReason: string | null
}

/** Tokens gravados por passo (`ai_consumption_logs.tokenDetails`). */
export type TokenDetails = Omit<TokenBreakdown, "input">
