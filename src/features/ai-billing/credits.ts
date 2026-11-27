import type { CreditsBilling } from "./schemas"

/**
 * Créditos de uma chave (módulo PURO, OPE-203). Valem do início (ou da data em que o plano foi gravado) até a
 * validade, inclusive, e até se esgotarem: pela data manual "esgotado em" ou quando o custo de tabela somado do
 * Opex dentro da validade passa do valor de face (`autoExhaustedAt`, calculado no servidor). Fora disso, a chamada é
 * paga por uso (custo de tabela) e a tela avisa.
 */

export type CreditsStatus = "valid" | "not-started" | "expired" | "exhausted"

export interface CreditsState {
    status: CreditsStatus
    /** Fração paga (`pago em US$ ÷ valor de face`); `null` quando o pago em R$ não tem cotação. */
    ratio: number | null
}

/** Início efetivo dos créditos (`AAAA-MM-DD`). */
export function creditsStartOf(billing: CreditsBilling & { setAt?: string }): string | null {
    return billing.startsAt ?? (billing.setAt ? billing.setAt.slice(0, 10) : null)
}

/**
 * Estado dos créditos num instante. `dateKey` é o dia do passo (Brasília); `paidUsdRate` é a PTAX do início, usada
 * quando o valor pago está em R$.
 */
export function creditsStateAt(
    billing: CreditsBilling & { setAt?: string },
    at: Date,
    dateKey: string,
    options: { autoExhaustedAt?: Date | null; paidUsdRate?: number | null } = {},
): CreditsState {
    const start = creditsStartOf(billing)
    const paidUsd = billing.paidCurrency === "USD" ? billing.paidAmount : billing.paidAmount === 0 ? 0 : options.paidUsdRate ? billing.paidAmount / options.paidUsdRate : null
    const ratio = paidUsd === null ? null : Math.min(1, paidUsd / billing.faceValueUsd)
    if (start && dateKey < start) return { status: "not-started", ratio }
    if (billing.expiresAt && dateKey > billing.expiresAt) return { status: "expired", ratio }
    if (billing.exhaustedAt && dateKey >= billing.exhaustedAt) return { status: "exhausted", ratio }
    if (options.autoExhaustedAt && at.getTime() >= options.autoExhaustedAt.getTime()) return { status: "exhausted", ratio }
    return { status: "valid", ratio }
}

/**
 * Instante em que o custo de tabela acumulado (passos em ordem cronológica) passa do valor de face; `null` se não
 * passou. O passo que cruza ainda é coberto pelos créditos; os seguintes não.
 */
export function autoExhaustionAt(steps: readonly { at: Date; listUsd: number }[], faceValueUsd: number): Date | null {
    let total = 0
    const sorted = [...steps].sort((a, b) => a.at.getTime() - b.at.getTime())
    for (let index = 0; index < sorted.length; index++) {
        total += Math.max(0, sorted[index]!.listUsd)
        if (total >= faceValueUsd) return sorted[index + 1]?.at ?? new Date(sorted[index]!.at.getTime() + 1)
    }
    return null
}
