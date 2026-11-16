import { GO_DISPLAY_TIME_ZONE } from "./go-constants"
import type { GoCeilingDto, GoChartDto, GoChartPointDto } from "./go-types"

/**
 * Regras da assinatura OpenCode Go (OPE-167), módulo PURO: percentual do medidor, previsão linear,
 * ciclos anteriores, série diária em pontos percentuais e o desenho do gráfico. Dias são baldes UTC
 * (`YYYY-MM-DD`), como a API do Console devolve.
 */

export const DAY_MS = 86_400_000

const round = (value: number, digits = 2) => {
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
}

export function utcDateKey(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10)
}

export function dayStartMs(key: string): number {
    return Date.parse(`${key}T00:00:00.000Z`)
}

export function addDaysKey(key: string, days: number): string {
    return utcDateKey(dayStartMs(key) + days * DAY_MS)
}

/** Dias de `from` a `to` (inclusive); vazio quando `from > to`. */
export function dateKeysBetween(from: string, to: string): string[] {
    const keys: string[] = []
    for (let key = from; key <= to; key = addDaysKey(key, 1)) keys.push(key)
    return keys
}

/** Data do calendário em São Paulo de um instante (o filtro de período é escolhido em datas locais). */
export function displayDateKey(ms: number): string {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: GO_DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms))
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00"
    return `${part("year")}-${part("month")}-${part("day")}`
}

/** Fração do dia UTC já decorrida no instante (0 a 1). */
export function dayFraction(ms: number): number {
    return (ms - dayStartMs(utcDateKey(ms))) / DAY_MS
}

/** Percentual exato do medidor (`usedMicroCents / limitMicroCents × 100`). */
export function meterRatio(used: number, limit: number): number {
    return limit > 0 ? (used / limit) * 100 : 0
}

/** Percentual com uma casa, truncado (o Console mostra o inteiro truncado: 43,90 → 43). */
export function meterPercent(used: number, limit: number): number {
    return Math.floor(meterRatio(used, limit) * 10 + 1e-9) / 10
}

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

export interface GoForecast {
    dailyAverage: number | null
    projectedPercent: number | null
    crossesAtMs: number | null
    limitReached: boolean
}

/**
 * Previsão linear do ciclo: `% previsto = % usado × (fim − início) / (agora − início)`, cruzamento em
 * `início + (agora − início) × 100 / % usado` e média `% usado × 24 h / (agora − início)`. Sem previsão
 * com menos de 1 dia de ciclo ou com o mês em 100%.
 */
export function goForecast({ startMs, endMs, nowMs, percent }: { startMs: number; endMs: number; nowMs: number; percent: number }): GoForecast {
    const elapsed = nowMs - startMs
    const limitReached = percent >= 100
    const dailyAverage = elapsed > 0 ? (percent * DAY_MS) / elapsed : null
    if (limitReached || elapsed < DAY_MS || nowMs >= endMs) return { dailyAverage, projectedPercent: null, crossesAtMs: null, limitReached }
    const projectedPercent = (percent * (endMs - startMs)) / elapsed
    const crossesAtMs = percent > 0 ? startMs + (elapsed * 100) / percent : null
    return { dailyAverage, projectedPercent, crossesAtMs: crossesAtMs !== null && crossesAtMs < endMs ? crossesAtMs : null, limitReached }
}

/** Mesmo dia/hora `months` meses antes, em UTC (dia limitado ao fim do mês). */
export function subUtcMonths(ms: number, months: number): number {
    const date = new Date(ms)
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1))
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())
}

export interface GoCycle {
    startMs: number
    endMs: number
    current: boolean
}

/**
 * Ciclos da assinatura que cruzam o período `[fromMs, toMs]`, do mais antigo ao atual. Os anteriores são
 * deduzidos voltando mês a mês a partir do início do ciclo atual.
 */
export function goCycles(current: { startMs: number; endMs: number }, fromMs: number, toMs: number): GoCycle[] {
    const cycles: GoCycle[] = []
    if (current.startMs <= toMs && current.endMs > fromMs) cycles.push({ ...current, current: true })
    let end = current.startMs
    for (let back = 1; back <= 36 && end > fromMs; back++) {
        const start = subUtcMonths(current.startMs, back)
        if (start <= toMs) cycles.unshift({ startMs: start, endMs: end, current: false })
        end = start
    }
    return cycles
}

export interface GoDayValue {
    /** Pontos percentuais do dia; `null` sem dados. */
    percent: number | null
    partial: boolean
}

export interface GoChartInput {
    /** Período do filtro, em dias. */
    fromKey: string
    toKey: string
    nowMs: number
    cycles: readonly GoCycle[]
    days: ReadonlyMap<string, GoDayValue>
    /** % exato do medidor mensal (ponta de hoje). */
    monthRatio: number
    forecast: GoForecast
    historyFrom: string
}

/** Primeiro dia da série: o início do ciclo mais antigo (o acumulado começa nele, mesmo antes do filtro). */
export function seriesStartKey(cycles: readonly GoCycle[], fromKey: string): string {
    return cycles.length ? utcDateKey(cycles[0]!.startMs) : fromKey
}

/** Último dia do eixo: com o filtro chegando a hoje, vai até a renovação (para caber a previsão). */
export function chartEndKey(toKey: string, nowMs: number, cycles: readonly GoCycle[]): string {
    const todayKey = utcDateKey(nowMs)
    const current = cycles.find((cycle) => cycle.current && cycle.startMs <= nowMs && nowMs < cycle.endMs)
    if (toKey >= todayKey && current) {
        const renewal = utcDateKey(current.endMs - 1)
        return renewal > toKey ? renewal : toKey
    }
    return toKey
}

/** Teto do eixo Y: 150% ou o próximo múltiplo de 50 acima do maior valor. */
export function goYMax(values: readonly number[]): number {
    const top = Math.max(0, ...values)
    return Math.max(150, Math.ceil(top / 50) * 50)
}

/**
 * Gráfico do consumo: acumulado através dos ciclos (dia sem dados quebra a linha e conta 0), um teto por
 * ciclo em "acumulado no início + 100", a ponta de hoje igual ao medidor e a previsão linear até a renovação.
 * O dia em que um ciclo começa é pró-rateado pelo horário de início.
 */
export function buildGoChart(input: GoChartInput): GoChartDto {
    const { fromKey, toKey, nowMs, cycles, days, monthRatio, forecast, historyFrom } = input
    const todayKey = utcDateKey(nowMs)
    const endKey = chartEndKey(toKey, nowMs, cycles)
    const lastPastKey = endKey < todayKey ? endKey : todayKey
    const current = cycles.find((cycle) => cycle.current && cycle.startMs <= nowMs && nowMs < cycle.endMs) ?? null

    const bases = new Map<number, number>()
    const boundaryOf = new Map<string, number>()
    for (const cycle of cycles) boundaryOf.set(utcDateKey(cycle.startMs), cycle.startMs)

    const points: GoChartPointDto[] = []
    let cumulative = 0
    let missingDays = 0
    let partialDays = 0
    const firstStart = cycles[0]?.startMs ?? null

    for (const key of dateKeysBetween(seriesStartKey(cycles, fromKey), lastPastKey)) {
        const day = days.get(key)
        const percent = day?.percent ?? null
        // Hoje, no ciclo atual, a ponta vem do medidor: o dia sem dados não falta na linha.
        const meterDay = key === todayKey && current !== null
        if (percent === null && !meterDay) missingDays++
        else if (day?.partial) partialDays++
        const value = percent ?? 0
        const boundary = boundaryOf.get(key)
        if (boundary !== undefined) {
            const before = dayFraction(boundary)
            if (boundary === firstStart) {
                bases.set(boundary, 0)
                cumulative = value * (1 - before)
            } else {
                bases.set(boundary, cumulative + value * before)
                cumulative += value
            }
        } else {
            cumulative += value
        }
        let usage: number | null = percent === null ? null : cumulative
        if (key === todayKey && current) usage = (bases.get(current.startMs) ?? cumulative) + monthRatio
        if (key >= fromKey) points.push({ date: key, dayPercent: percent === null ? null : round(percent), usage: usage === null ? null : round(usage), forecast: null })
    }
    for (const key of dateKeysBetween(addDaysKey(lastPastKey, 1), endKey)) {
        if (key >= fromKey) points.push({ date: key, dayPercent: null, usage: null, forecast: null })
    }

    const ceilings: GoCeilingDto[] = []
    for (const cycle of cycles) {
        const base = bases.get(cycle.startMs)
        if (base === undefined) continue
        const from = utcDateKey(cycle.startMs) < fromKey ? fromKey : utcDateKey(cycle.startMs)
        const cycleEnd = utcDateKey(cycle.endMs - 1)
        const to = cycleEnd > endKey ? endKey : cycleEnd
        if (from <= to) ceilings.push({ from, to, value: round(base + 100), current: cycle.current })
    }

    let crossing: GoChartDto["crossing"] = null
    let forecastEnd: GoChartDto["forecastEnd"] = null
    const currentBase = current ? bases.get(current.startMs) : undefined
    if (current && currentBase !== undefined && forecast.projectedPercent !== null && endKey >= todayKey) {
        const elapsed = nowMs - current.startMs
        const renewalKey = utcDateKey(current.endMs - 1)
        for (const point of points) {
            if (point.date < todayKey || point.date > renewalKey) continue
            const at = point.date === todayKey ? nowMs : Math.min(dayStartMs(point.date) + DAY_MS, current.endMs)
            point.forecast = round(currentBase + (monthRatio * (at - current.startMs)) / elapsed)
        }
        forecastEnd = { date: renewalKey, value: round(currentBase + forecast.projectedPercent), percent: round(forecast.projectedPercent, 1) }
        if (forecast.crossesAtMs !== null) crossing = { date: utcDateKey(forecast.crossesAtMs), value: round(currentBase + 100), label: formatGoDate(new Date(forecast.crossesAtMs).toISOString()) }
    }

    const values = [...points.flatMap((point) => [point.usage ?? 0, point.forecast ?? 0]), ...ceilings.map((ceiling) => ceiling.value)]
    return { points, ceilings, crossing, forecastEnd, yMax: goYMax(values), missingDays, partialDays, historyFrom }
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

function zonedParts(ms: number): Record<string, string> {
    const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: GO_DISPLAY_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms))
    return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

/** "05/12 às 09:15" no fuso de São Paulo. */
export function formatGoDateTime(iso: string): string {
    const parts = zonedParts(Date.parse(iso))
    return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`
}

/** "01/12" no fuso de São Paulo. */
export function formatGoDate(iso: string): string {
    const parts = zonedParts(Date.parse(iso))
    return `${parts.day}/${parts.month}`
}

/** Rótulo de um dia UTC do eixo (`2026-12-01` → "01/12"; com ano → "01/12/2026"). */
export function dayKeyLabel(key: string, withYear = false): string {
    const [year, month, day] = key.split("-")
    return withYear ? `${day}/${month}/${year}` : `${day}/${month}`
}

/** Percentual em pt-BR com uma casa ("43,9%"). */
export function formatGoPercent(value: number, digits = 1): string {
    return `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

/** Gasto em US$ ("US$ 44,53"). */
export function formatGoUsd(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "USD" })
}

/** Leitura antiga demais (a rotina relê a cada 5 min). */
export function isGoUsageStale(checkedAt: string, nowMs: number, staleAfterMs: number): boolean {
    const at = Date.parse(checkedAt)
    return Number.isFinite(at) && nowMs - at > staleAfterMs
}
