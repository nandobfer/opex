import { DAY_MS, dateKeysBetween, dayStartMs, utcDateKey, type CycleDayValue } from "@/features/subscription-usage/cycle-logic"
import { GO_METER_IDS, type GoMeterId } from "./go-constants"
import type { GoStatus } from "./go-schemas"
import type { GoKeyScopeDto } from "./go-types"

/**
 * Regras da assinatura OpenCode Go (OPE-167), módulo PURO: série diária em pontos percentuais pela cota de cada
 * modelo, soma de assinaturas e mensagens do Console. Percentual do medidor, previsão, ciclos e o desenho do
 * gráfico ficam no módulo compartilhado `subscription-usage/cycle-logic` (OPE-190), reexportados aqui com os
 * nomes antigos. Dias são baldes UTC (`YYYY-MM-DD`), como a API do Console devolve.
 */

export {
    DAY_MS,
    utcDateKey,
    dayStartMs,
    addDaysKey,
    dateKeysBetween,
    dayFraction,
    meterRatio,
    meterPercent,
    subUtcMonths,
    cycleDayKeys,
    axisDateLabel,
    cycleForecast as goForecast,
    cycleFor as goCycleFor,
    cycleYMax as goYMax,
    cycleYTicks as goYTicks,
    buildCycleChart as buildGoChart,
    formatUsageDateTime as formatGoDateTime,
    formatUsageDate as formatGoDate,
    formatUsageFullDate as formatGoFullDate,
    cycleAxisTicks as goAxisTicks,
    formatUsagePercent as formatGoPercent,
    formatUsageUsd as formatGoUsd,
    isUsageStale as isGoUsageStale,
} from "@/features/subscription-usage/cycle-logic"
export type { CycleForecast as GoForecast, UsageCycle as GoCycle, CycleChartInput as GoChartInput } from "@/features/subscription-usage/cycle-logic"

export type GoDayValue = CycleDayValue

/** Pontos percentuais de um custo (micro-cents) num modelo com cota mensal em US$: `custo / cota × 100`. */
export function costToPercent(costMicroCents: number, allowanceUsd: number): number {
    return costMicroCents / 1e6 / allowanceUsd
}

export interface GoModelCost {
    model: string
    costMicroCents: number
}

/** Pontos percentuais do dia: soma por modelo do custo sobre a cota do modelo. Modelo com custo e sem cota deixa o dia parcial. */
export function dayPercentFromModels(items: readonly GoModelCost[], allowances: ReadonlyMap<string, number | null>): { percent: number; partial: boolean } {
    let percent = 0
    let partial = false
    for (const item of items) {
        if (item.costMicroCents <= 0) continue
        const allowance = allowances.get(item.model)
        if (!allowance) {
            partial = true
            continue
        }
        percent += costToPercent(item.costMicroCents, allowance)
    }
    return { percent, partial }
}


/**
 * Identidade estável de uma assinatura (OPE-180): ciclo (`startsAt`/`endsAt`, ao milissegundo) e os limites das
 * três janelas. Uso e resets ficam de fora: cada chave tem a própria leitura em memória, e duas chaves do mesmo
 * workspace lidas em instantes diferentes, com consumo no meio, continuam sendo a mesma assinatura.
 */
export function goSubscriptionSignature(status: GoStatus): string {
    const limits = GO_METER_IDS.map((id) => status.access.meters[id].limitMicroCents)
    return [status.access.startsAt, status.access.endsAt, ...limits].join("|")
}

/** Agrupa as leituras por assinatura, na ordem da primeira chave de cada uma. */
export function groupGoSubscriptions<T extends { status: GoStatus }>(reads: readonly T[]): T[][] {
    const groups = new Map<string, T[]>()
    for (const read of reads) {
        const signature = goSubscriptionSignature(read.status)
        const group = groups.get(signature)
        if (group) group.push(read)
        else groups.set(signature, [read])
    }
    return [...groups.values()]
}

/**
 * Uso de uma assinatura antes do início do próprio ciclo e dentro do ciclo de referência (OPE-180): soma dos % dos
 * dias da série entre `fromMs` (início da referência) e `toMs` (início do ciclo dela), pró-rateando as pontas. Dia
 * sem dados conta 0. Com `toMs <= fromMs` (mesmo ciclo), 0.
 */
export function goPreCycleRatio(days: ReadonlyMap<string, GoDayValue> | null, fromMs: number, toMs: number): number {
    if (!days || toMs <= fromMs) return 0
    let ratio = 0
    for (const key of goPreCycleDayKeys(fromMs, toMs)) {
        const percent = days.get(key)?.percent ?? null
        if (percent === null) continue
        const start = dayStartMs(key)
        ratio += percent * ((Math.min(start + DAY_MS, toMs) - Math.max(start, fromMs)) / DAY_MS)
    }
    return ratio
}

/** Dias UTC de `[fromMs, toMs)` (vazio quando `toMs <= fromMs`); o intervalo é a distância entre dois inícios de ciclo. */
export function goPreCycleDayKeys(fromMs: number, toMs: number): string[] {
    return toMs <= fromMs ? [] : dateKeysBetween(utcDateKey(fromMs), utcDateKey(toMs - 1))
}

export interface GoMeterSum {
    usedMicroCents: number
    limitMicroCents: number
    resetsAt: string | null
}

/** Janelas somadas entre as assinaturas: uso e limite somados; o reset é o mais próximo (ignora os nulos). */
export function sumGoMeters(statuses: readonly GoStatus[]): Record<GoMeterId, GoMeterSum> {
    const sum = (id: GoMeterId): GoMeterSum => {
        let usedMicroCents = 0
        let limitMicroCents = 0
        let resetsAt: string | null = null
        for (const status of statuses) {
            const meter = status.access.meters[id]
            usedMicroCents += meter.usedMicroCents
            limitMicroCents += meter.limitMicroCents
            if (meter.resetsAt && (resetsAt === null || Date.parse(meter.resetsAt) < Date.parse(resetsAt))) resetsAt = meter.resetsAt
        }
        return { usedMicroCents, limitMicroCents, resetsAt }
    }
    return { fiveHour: sum("fiveHour"), week: sum("week"), month: sum("month") }
}

/**
 * Assinatura cujo ciclo rege o gráfico, a previsão e o "Renova em" (decisão do dono, OPE-180): a da renovação
 * mais próxima; empate pela maior cota mensal, depois a chave principal, depois o nome.
 */
export function goReferenceIndex(subscriptions: readonly { status: GoStatus; primary: boolean; name: string }[]): number {
    let best = 0
    for (let index = 1; index < subscriptions.length; index++) {
        const a = subscriptions[index]!
        const b = subscriptions[best]!
        const byEnd = Date.parse(a.status.access.endsAt) - Date.parse(b.status.access.endsAt)
        const byLimit = b.status.access.meters.month.limitMicroCents - a.status.access.meters.month.limitMicroCents
        const byPrimary = Number(b.primary) - Number(a.primary)
        const order = byEnd || byLimit || byPrimary || a.name.localeCompare(b.name, "pt-BR")
        if (order < 0) best = index
    }
    return best
}

/**
 * Série diária somada (OPE-180): `Σ(% do dia × limite mensal) / Σ limites mensais` — o mesmo que `Σ custo / Σ cota`.
 * Assinatura sem dados no dia (ou sem série) conta 0 e marca o dia como incompleto; sem dados de nenhuma, o dia
 * fica `null`. Com uma só assinatura, devolve a série dela.
 */
export function combineGoDays(series: readonly { days: ReadonlyMap<string, GoDayValue> | null; weight: number }[], dates: readonly string[]): Map<string, GoDayValue> {
    const only = series.length === 1 ? series[0]!.days : null
    if (only) return new Map(only)
    const totalWeight = series.reduce((total, item) => total + item.weight, 0)
    const combined = new Map<string, GoDayValue>()
    for (const date of dates) {
        let weighted = 0
        let known = 0
        let partial = false
        for (const item of series) {
            const day = item.days?.get(date)
            if (!day || day.percent === null) continue
            known++
            weighted += day.percent * item.weight
            partial ||= day.partial
        }
        if (known === 0 || totalWeight <= 0) combined.set(date, { percent: null, partial: false })
        else combined.set(date, { percent: weighted / totalWeight, partial, ...(known < series.length ? { incomplete: true } : {}) })
    }
    return combined
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Rótulo das chaves no cabeçalho do card: "Chave: X" com uma chave; "Chaves: 3 (2 assinaturas)" na soma. */
export function goKeyLabel(scope: GoKeyScopeDto | null, keyName: string | null): string | null {
    if (!scope || scope.keys.length <= 1) {
        const name = scope?.keys[0]?.name ?? keyName
        return name ? `Chave: ${name}` : null
    }
    const keys = `Chaves: ${scope.keys.length}`
    return scope.subscriptions < scope.keys.length ? `${keys} (${plural(scope.subscriptions, "assinatura", "assinaturas")})` : keys
}

/** Chaves que leem a mesma assinatura (contadas uma vez), uma lista de nomes por assinatura. */
export function goSharedKeyGroups(scope: GoKeyScopeDto | null): string[][] {
    if (!scope) return []
    const groups = new Map<number, string[]>()
    for (const key of scope.keys) groups.set(key.subscription, [...(groups.get(key.subscription) ?? []), key.name])
    return [...groups.values()].filter((names) => names.length > 1)
}


/** Mensagem pt-BR para uma resposta de erro do Console. */
export function goConsoleStatusMessage(status: number, body = ""): string {
    if (status === 401) return "O OpenCode Go recusou a chave (HTTP 401). Confira a chave em uso em Integrações › Inteligência Artificial › OpenCode Go."
    if (status === 403 && /\b1010\b/.test(body)) return "O Cloudflare bloqueou o acesso ao Console do OpenCode Go (Error 1010). Tente novamente mais tarde."
    if (status === 403) return "A chave não tem acesso ao Console do OpenCode Go (HTTP 403)."
    if (status === 404) return "O Console do OpenCode Go não tem mais este endpoint (HTTP 404): a API interna mudou."
    if (status === 429) return "O Console do OpenCode Go limitou as consultas (HTTP 429). Tente novamente em alguns minutos."
    return `O Console do OpenCode Go respondeu HTTP ${status}.`
}

export const GO_CONSOLE_FORMAT_MESSAGE = "O Console do OpenCode Go respondeu num formato não reconhecido: a API interna pode ter mudado."

