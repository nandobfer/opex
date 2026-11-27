import { creditsStateAt, creditsStartOf } from "./credits"
import { dailyQuota } from "./cycle"
import { brasiliaDateKey, roundMoney, utcDateKey } from "./money"
import { AI_BILLING_MODE_LABELS, type AiBillingMode, type StoredAiKeyBilling } from "./schemas"

/**
 * Custo efetivo das chamadas de IA (módulo PURO, OPE-203), derivado na leitura a partir do custo de tabela gravado
 * e do plano da chave que respondeu — alterar o plano recalcula o efetivo sem tocar no custo de tabela.
 *
 * - Pago por uso: efetivo = tabela.
 * - Créditos válidos: tabela × (pago ÷ face) + uso extra; vencidos, esgotados ou antes do início: tabela (com aviso).
 * - Assinatura: cota do dia (mensalidade com IOF/spread ÷ dias do ciclo) × min(1, uso do passo ÷ uso total do dia) +
 *   uso extra. O uso é medido na unidade da API de cota (Go: `allowance`; Command Code: créditos ≈ custo de tabela);
 *   sem API de cota, o total do dia é a soma dos passos dos rotineiros na chave (o Opex carrega a cota inteira). Dia
 *   sem o total da API: efetivo desconhecido ("Parcial", com o motivo).
 * - Valores em R$ pela PTAX do dia do passo (Brasília); sem cotação, o R$ fica desconhecido (nunca zero).
 */

export interface CostStepInput {
    id: string
    at: Date
    provider: string
    model: string
    apiKeyId: string | null
    listUsd: number | null
    estimated: boolean
    /** Go: dólares descontados da cota da assinatura (`usage.opencode.allowance`). */
    allowanceUsd: number | null
    /** Go: uso extra cobrado à parte (`usage.cost`). */
    extraUsd: number | null
}

export interface KeyBillingInfo {
    keyId: string
    name: string
    provider: string
    billing: StoredAiKeyBilling
}

/** Uso total do dia na assinatura da chave. */
export type SubscriptionDayTotal = { kind: "api"; total: number | null } | { kind: "routine"; total: number }

export interface BillingLookup {
    key(keyId: string): KeyBillingInfo | null
    /** PTAX (venda) do dia `AAAA-MM-DD` (Brasília). */
    fx(dateKey: string): number | null
    subscriptionDay(provider: string, keyId: string, utcDate: string): SubscriptionDayTotal
    /** Créditos esgotados pela soma do Opex (instante a partir do qual não cobrem mais). */
    creditsExhaustedAt(keyId: string): Date | null
}

export interface StepCost {
    listUsd: number | null
    listBrl: number | null
    effectiveUsd: number | null
    effectiveBrl: number | null
    mode: AiBillingMode
    /** "Chave X · Assinatura" (divisão por plano). */
    planLabel: string
    missingPrice: string | null
    estimated: boolean
    notices: string[]
}

/** Provedores cuja assinatura tem API de cota (o total do dia vem dela). */
export const SUBSCRIPTION_API_PROVIDERS: readonly string[] = ["opencode-go", "command-code"]

const fmtDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`
const brlOf = (usd: number | null, rate: number | null) => (usd === null || rate === null ? null : roundMoney(usd * rate))

function subscriptionMetric(step: CostStepInput): number | null {
    if (step.provider === "opencode-go") return step.allowanceUsd ?? (step.extraUsd !== null ? 0 : null)
    return step.listUsd
}

export function stepEffectiveCost(step: CostStepInput, lookup: BillingLookup): StepCost {
    const brDate = brasiliaDateKey(step.at)
    const rate = lookup.fx(brDate)
    const list = step.listUsd
    const base = {
        listUsd: list,
        listBrl: brlOf(list, rate),
        missingPrice: list === null ? `${step.provider}/${step.model}` : null,
        estimated: step.estimated,
    }
    const notices: string[] = []
    if (rate === null) notices.push(`Cotação PTAX de ${fmtDay(brDate)} indisponível: o valor em R$ ficou parcial.`)
    const key = step.apiKeyId ? lookup.key(step.apiKeyId) : null
    if (!key) {
        if (step.apiKeyId) notices.push("Chave removida do chaveiro: o passo foi tratado como pago por uso.")
        return { ...base, effectiveUsd: list, effectiveBrl: brlOf(list, rate), mode: "usage", planLabel: step.apiKeyId ? "Chave removida · Pago por uso" : "Sem chave identificada · Pago por uso", notices }
    }
    const billing = key.billing
    const planLabel = `${key.name} · ${AI_BILLING_MODE_LABELS[billing.mode]}`
    const extra = step.extraUsd ?? 0
    if (billing.mode === "usage") return { ...base, effectiveUsd: list, effectiveBrl: brlOf(list, rate), mode: "usage", planLabel, notices }

    if (billing.mode === "credits") {
        const start = creditsStartOf(billing)
        const state = creditsStateAt(billing, step.at, brDate, { autoExhaustedAt: lookup.creditsExhaustedAt(key.keyId), paidUsdRate: start ? lookup.fx(start) : null })
        if (state.status !== "valid") {
            const why = state.status === "expired" ? "vencidos" : state.status === "exhausted" ? "esgotados" : "ainda não iniciados"
            notices.push(`Créditos da chave ${key.name} ${why}: os passos usaram o custo de tabela (pago por uso).`)
            return { ...base, effectiveUsd: list, effectiveBrl: brlOf(list, rate), mode: "credits", planLabel, notices }
        }
        if (state.ratio === null) notices.push(`Créditos da chave ${key.name} pagos em R$ sem cotação do início: custo efetivo desconhecido.`)
        const effective = list === null || state.ratio === null ? null : roundMoney(list * state.ratio + extra)
        return { ...base, effectiveUsd: effective, effectiveBrl: brlOf(effective, rate), mode: "credits", planLabel, notices }
    }

    const utcDate = utcDateKey(step.at)
    const metric = subscriptionMetric(step)
    const day = lookup.subscriptionDay(step.provider, key.keyId, utcDate)
    if (day.total === null) {
        notices.push(`Assinatura da chave ${key.name}: o uso total de ${fmtDay(utcDate)} não foi lido da API de cota; o custo efetivo do dia ficou parcial.`)
        return { ...base, effectiveUsd: null, effectiveBrl: null, mode: "subscription", planLabel, notices }
    }
    if (metric === null) return { ...base, effectiveUsd: null, effectiveBrl: null, mode: "subscription", planLabel, notices }
    const share = metric <= 0 ? 0 : day.total <= 0 ? 1 : Math.min(1, metric / day.total)
    const quota = dailyQuota(billing, utcDate) * share
    if (billing.currency === "USD") {
        const effective = roundMoney(quota + extra)
        return { ...base, effectiveUsd: effective, effectiveBrl: brlOf(effective, rate), mode: "subscription", planLabel, notices }
    }
    // Plano em R$: o R$ é exato; o US$ depende da PTAX do dia.
    const effectiveBrl = rate === null && extra > 0 ? null : roundMoney(quota + extra * (rate ?? 0))
    const effectiveUsd = rate === null ? null : roundMoney(quota / rate + extra)
    if (rate === null) notices.push(`Assinatura em R$ da chave ${key.name} sem cotação de ${fmtDay(brDate)}: o valor em US$ ficou parcial.`)
    return { ...base, effectiveUsd, effectiveBrl, mode: "subscription", planLabel, notices }
}

export interface CostTotals {
    listUsd: number | null
    listBrl: number | null
    effectiveUsd: number | null
    effectiveBrl: number | null
    savingsUsd: number | null
    savingsBrl: number | null
    /** Algum passo sem custo de tabela ou sem custo efetivo conhecido. */
    partial: boolean
    /** Algum valor em R$ desconhecido (sem cotação). */
    brlPartial: boolean
    /** Modelos sem preço (`provedor/modelo`). */
    missingPrices: string[]
    estimated: boolean
    notices: string[]
    steps: number
}

const add = (total: number | null, value: number | null) => (value === null ? total : roundMoney((total ?? 0) + value))

export function emptyTotals(): CostTotals {
    return { listUsd: null, listBrl: null, effectiveUsd: null, effectiveBrl: null, savingsUsd: null, savingsBrl: null, partial: false, brlPartial: false, missingPrices: [], estimated: false, notices: [], steps: 0 }
}

/** Soma de passos: só os valores conhecidos entram; o total vira "Parcial" quando falta algum. */
export function sumStepCosts(costs: readonly StepCost[]): CostTotals {
    const totals = emptyTotals()
    const missing = new Set<string>()
    const notices = new Set<string>()
    for (const cost of costs) {
        totals.steps++
        totals.listUsd = add(totals.listUsd, cost.listUsd)
        totals.listBrl = add(totals.listBrl, cost.listBrl)
        totals.effectiveUsd = add(totals.effectiveUsd, cost.effectiveUsd)
        totals.effectiveBrl = add(totals.effectiveBrl, cost.effectiveBrl)
        if (cost.listUsd !== null && cost.effectiveUsd !== null) totals.savingsUsd = add(totals.savingsUsd, roundMoney(cost.listUsd - cost.effectiveUsd))
        if (cost.listBrl !== null && cost.effectiveBrl !== null) totals.savingsBrl = add(totals.savingsBrl, roundMoney(cost.listBrl - cost.effectiveBrl))
        if (cost.listUsd === null || cost.effectiveUsd === null) totals.partial = true
        if ((cost.listUsd !== null && cost.listBrl === null) || (cost.effectiveUsd !== null && cost.effectiveBrl === null)) totals.brlPartial = true
        if (cost.missingPrice) missing.add(cost.missingPrice)
        if (cost.estimated) totals.estimated = true
        for (const notice of cost.notices) notices.add(notice)
    }
    totals.missingPrices = [...missing].sort()
    totals.notices = [...notices]
    return totals
}

/** Junta totais já somados (ex.: execuções de um dia). */
export function mergeTotals(list: readonly CostTotals[]): CostTotals {
    const totals = emptyTotals()
    const missing = new Set<string>()
    const notices = new Set<string>()
    for (const item of list) {
        totals.steps += item.steps
        totals.listUsd = add(totals.listUsd, item.listUsd)
        totals.listBrl = add(totals.listBrl, item.listBrl)
        totals.effectiveUsd = add(totals.effectiveUsd, item.effectiveUsd)
        totals.effectiveBrl = add(totals.effectiveBrl, item.effectiveBrl)
        totals.savingsUsd = add(totals.savingsUsd, item.savingsUsd)
        totals.savingsBrl = add(totals.savingsBrl, item.savingsBrl)
        totals.partial ||= item.partial
        totals.brlPartial ||= item.brlPartial
        totals.estimated ||= item.estimated
        item.missingPrices.forEach((model) => missing.add(model))
        item.notices.forEach((notice) => notices.add(notice))
    }
    totals.missingPrices = [...missing].sort()
    totals.notices = [...notices]
    return totals
}

/** `SUBSCRIPTION_API_PROVIDERS` inclui o provedor? */
export function hasSubscriptionApi(provider: string): boolean {
    return SUBSCRIPTION_API_PROVIDERS.includes(provider)
}
