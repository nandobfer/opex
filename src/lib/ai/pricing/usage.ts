import type { TokenBreakdown, TokenDetails } from "./types"

/**
 * Tokens separados de um passo a partir do `usage` da SDK `ai` v7 (módulo PURO, OPE-203):
 * `inputTokenDetails.{noCacheTokens, cacheReadTokens, cacheWriteTokens}` e `outputTokenDetails.{textTokens, reasoningTokens}`.
 * Campo que o provedor não informa fica `null` (nunca zero).
 */

export interface SdkStepUsage {
    inputTokens?: number | undefined
    outputTokens?: number | undefined
    inputTokenDetails?: { noCacheTokens?: number | undefined; cacheReadTokens?: number | undefined; cacheWriteTokens?: number | undefined }
    outputTokenDetails?: { textTokens?: number | undefined; reasoningTokens?: number | undefined }
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null)

export function tokensFromUsage(usage: SdkStepUsage | null | undefined): TokenBreakdown {
    return {
        input: num(usage?.inputTokens),
        noCache: num(usage?.inputTokenDetails?.noCacheTokens),
        cacheRead: num(usage?.inputTokenDetails?.cacheReadTokens),
        cacheWrite: num(usage?.inputTokenDetails?.cacheWriteTokens),
        output: num(usage?.outputTokens),
        reasoning: num(usage?.outputTokenDetails?.reasoningTokens),
    }
}

export function tokenDetailsOf(tokens: TokenBreakdown): TokenDetails {
    return { noCache: tokens.noCache, cacheRead: tokens.cacheRead, cacheWrite: tokens.cacheWrite, output: tokens.output, reasoning: tokens.reasoning }
}
