import type { SubscriptionBilling } from "./schemas"

/**
 * Ciclo da assinatura pelo dia de renovação (módulo PURO, OPE-203). O ciclo vai do dia de renovação ao mesmo dia
 * do mês seguinte (28 a 31 dias); renovação num dia que o mês não tem (ex.: 31 em abril) cai no último dia do mês.
 * A cota do dia é `mensalidade × (1 + IOF/spread%) ÷ dias do ciclo`, na moeda do plano.
 */

const DAY_MS = 86_400_000

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
const keyOf = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)

/** Data de renovação num mês (dia limitado ao fim do mês). */
function renewalIn(year: number, month: number, renewalDay: number): string {
    const normalized = new Date(Date.UTC(year, month, 1))
    return keyOf(normalized.getUTCFullYear(), normalized.getUTCMonth(), Math.min(renewalDay, daysInMonth(normalized.getUTCFullYear(), normalized.getUTCMonth())))
}

export interface SubscriptionCycle {
    /** Primeiro dia do ciclo (`AAAA-MM-DD`, incluso). */
    start: string
    /** Primeiro dia do ciclo seguinte (exclusivo). */
    end: string
    days: number
}

/** Ciclo que contém o dia (`AAAA-MM-DD`, UTC). */
export function cycleFor(dateKey: string, renewalDay: number): SubscriptionCycle {
    const [year, month] = dateKey.split("-").map(Number) as [number, number]
    const thisMonth = renewalIn(year, month - 1, renewalDay)
    const start = dateKey >= thisMonth ? thisMonth : renewalIn(year, month - 2, renewalDay)
    const [sy, sm] = start.split("-").map(Number) as [number, number]
    const end = renewalIn(sy, sm, renewalDay)
    return { start, end, days: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) }
}

/** Mensalidade com IOF/spread, na moeda do plano. */
export function monthlyWithFees(billing: Pick<SubscriptionBilling, "amount" | "iofPercent">): number {
    return billing.amount * (1 + (billing.iofPercent ?? 0) / 100)
}

/** Cota de um dia do ciclo, na moeda do plano. */
export function dailyQuota(billing: Pick<SubscriptionBilling, "amount" | "iofPercent" | "renewalDay">, dateKey: string): number {
    return monthlyWithFees(billing) / cycleFor(dateKey, billing.renewalDay).days
}
