/**
 * Datas e dinheiro dos custos de IA (módulo PURO, OPE-203). O câmbio vale pelo dia do passo no horário de Brasília;
 * o rateio de assinatura, pelo dia UTC (o das APIs de cota). Valor desconhecido é `null` e aparece "—", nunca zero.
 */

const BRASILIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })

/** Dia `AAAA-MM-DD` no horário de Brasília. */
export function brasiliaDateKey(at: Date): string {
    return BRASILIA.format(at)
}

/** Dia `AAAA-MM-DD` em UTC. */
export function utcDateKey(at: Date): string {
    return at.toISOString().slice(0, 10)
}

export const roundMoney = (value: number) => Math.round(value * 1e6) / 1e6

const usd = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2, maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2 }).format(value)
const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2 }).format(value)

export function formatUsd(value: number | null | undefined): string {
    return typeof value === "number" && Number.isFinite(value) ? usd(value) : "—"
}

export function formatBrl(value: number | null | undefined): string {
    return typeof value === "number" && Number.isFinite(value) ? brl(value) : "—"
}

/** "US$ 1,23 · R$ 6,15" (o R$ some quando a cotação não existe). */
export function formatMoneyPair(usdValue: number | null | undefined, brlValue: number | null | undefined): string {
    if (typeof usdValue !== "number") return "—"
    return typeof brlValue === "number" ? `${formatUsd(usdValue)} · ${formatBrl(brlValue)}` : formatUsd(usdValue)
}
