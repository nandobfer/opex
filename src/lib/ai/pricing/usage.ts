import type { TokenBreakdown, TokenDetails } from "./types"

/**
 * Tokens separados de um passo a partir do `usage` da SDK `ai` v7 (módulo PURO, OPE-203; fonte única de todo o
 * consumo desde a OPE-205, com `tokensFromOpencode` para o OpenCode de sessão):
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

/** Tokens de um passo do OpenCode de sessão (`session.step.ended`, OPE-205). */
export interface OpencodeStepTokens {
    /** Entrada SEM cache (o OpenCode 2.x separa o cache em `cache.read/write`). */
    input: number
    /** Saída visível (sem o raciocínio). */
    output: number
    reasoning: number
    /** `null`/ausente = o evento não trouxe `tokens.cache` (não informado). */
    cacheRead?: number | null
    cacheWrite?: number | null
}

/**
 * Tokens separados de um passo do OpenCode de sessão, no mesmo formato da SDK (OPE-205): a entrada total só é
 * conhecida quando o cache vem informado; a saída total soma o raciocínio (convenção do `TokenDetails`).
 */
export function tokensFromOpencode(tokens: OpencodeStepTokens): TokenBreakdown {
    const noCache = num(tokens.input)
    const cacheRead = num(tokens.cacheRead)
    const cacheWrite = num(tokens.cacheWrite)
    const output = num(tokens.output)
    const reasoning = num(tokens.reasoning)
    return {
        input: noCache !== null && cacheRead !== null && cacheWrite !== null ? noCache + cacheRead + cacheWrite : null,
        noCache,
        cacheRead,
        cacheWrite,
        output: output !== null ? output + (reasoning ?? 0) : null,
        reasoning,
    }
}

export function tokenDetailsOf(tokens: TokenBreakdown): TokenDetails {
    return { noCache: tokens.noCache, cacheRead: tokens.cacheRead, cacheWrite: tokens.cacheWrite, output: tokens.output, reasoning: tokens.reasoning }
}
