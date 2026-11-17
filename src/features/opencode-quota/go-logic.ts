import { GO_DISPLAY_TIME_ZONE } from "./go-constants"
import type { GoChartDto, GoChartPointDto } from "./go-types"

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
 * Ciclo exibido no gráfico (decisão do dono, 17/11/2026: um ciclo por vez, sem acumular entre ciclos): o atual
 * quando o fim do filtro alcança o início dele (o padrão "Último mês" termina hoje); senão o ciclo anterior que
 * contém o fim do filtro, deduzido voltando mês a mês a partir do início do ciclo atual.
 */
export function goCycleFor(current: { startMs: number; endMs: number }, toMs: number): GoCycle {
    if (toMs >= current.startMs) return { ...current, current: true }
    let end = current.startMs
    for (let back = 1; back <= 36; back++) {
        const start = subUtcMonths(current.startMs, back)
        if (toMs >= start) return { startMs: start, endMs: end, current: false }
        end = start
    }
    return { startMs: subUtcMonths(current.startMs, 37), endMs: end, current: false }
}

/** Dias UTC (baldes da API) que o ciclo toca até `untilMs`. */
export function cycleDayKeys(cycle: GoCycle, untilMs: number): string[] {
    const last = Math.min(cycle.endMs - 1, untilMs)
    return last < cycle.startMs ? [] : dateKeysBetween(utcDateKey(cycle.startMs), utcDateKey(last))
}

export interface GoDayValue {
    /** Pontos percentuais do dia; `null` sem dados. */
    percent: number | null
    partial: boolean
}

export interface GoChartInput {
    cycle: GoCycle
    nowMs: number
    days: ReadonlyMap<string, GoDayValue>
    /** % exato do medidor mensal (ponta de hoje no ciclo atual). */
    monthRatio: number
    forecast: GoForecast
    historyFrom: string
}

/** Teto do eixo Y: 150% ou o próximo múltiplo de 50 acima do maior valor. */
export function goYMax(values: readonly number[]): number {
    const top = Math.max(0, ...values)
    return Math.max(150, Math.ceil(top / 50) * 50)
}

/**
 * Gráfico de UM ciclo, no desenho do Console: a linha nasce em 0% no início do ciclo, ganha um ponto no fim de
 * cada dia UTC (o primeiro e o último dia pró-rateados pelos horários de início e fim) e, no ciclo atual,
 * termina em "agora" com o valor exato do medidor. A previsão é a reta de "agora" até a renovação, com um
 * ponto no fim de cada dia (`dayForecast` = a parte da previsão que cai no dia); o teto é fixo em 100%. Dia sem dados quebra a linha e conta 0.
 */
export function buildGoChart(input: GoChartInput): GoChartDto {
    const { cycle, nowMs, days, monthRatio, forecast, historyFrom } = input
    const live = cycle.current && nowMs < cycle.endMs
    const untilMs = live ? nowMs : cycle.endMs
    const points: GoChartPointDto[] = [{ t: cycle.startMs, date: utcDateKey(cycle.startMs), dayPercent: null, usage: 0, forecast: null, dayForecast: null }]
    let cumulative = 0
    let missingDays = 0
    let partialDays = 0

    for (const key of cycleDayKeys(cycle, untilMs - 1)) {
        const dayStart = dayStartMs(key)
        const dayEnd = dayStart + DAY_MS
        const from = Math.max(dayStart, cycle.startMs)
        const to = Math.min(dayEnd, cycle.endMs)
        const isToday = live && nowMs < dayEnd
        const day = days.get(key)
        const percent = day?.percent ?? null
        if (percent === null && !isToday) missingDays++
        else if (day?.partial) partialDays++
        if (isToday) break
        cumulative += (percent ?? 0) * ((to - from) / DAY_MS)
        points.push({ t: to, date: key, dayPercent: percent === null ? null : round(percent), usage: percent === null ? null : round(cumulative), forecast: null, dayForecast: null })
    }

    let today: GoChartDto["today"] = null
    let crossing: GoChartDto["crossing"] = null
    let forecastEnd: GoChartDto["forecastEnd"] = null
    if (live) {
        const key = utcDateKey(nowMs)
        const todayPercent = days.get(key)?.percent ?? null
        const value = round(monthRatio)
        points.push({ t: nowMs, date: key, dayPercent: todayPercent === null ? null : round(todayPercent), usage: value, forecast: forecast.projectedPercent !== null ? value : null, dayForecast: null })
        today = { t: nowMs, percent: value }
        if (forecast.projectedPercent !== null) {
            // Um ponto no fim de cada dia UTC até a renovação (todos sobre a mesma reta), para a dica mostrar a
            // previsão do dia sob o mouse, como o uso do dia no trecho verde.
            const rate = monthRatio / (nowMs - cycle.startMs)
            let previous = nowMs
            for (const key of dateKeysBetween(utcDateKey(nowMs), utcDateKey(cycle.endMs - 1))) {
                const t = Math.min(dayStartMs(key) + DAY_MS, cycle.endMs)
                if (t <= previous) continue
                const atEnd = t === cycle.endMs
                points.push({ t, date: key, dayPercent: null, usage: null, forecast: atEnd ? round(forecast.projectedPercent) : round(monthRatio + rate * (t - nowMs)), dayForecast: round(rate * (t - previous)) })
                previous = t
            }
            forecastEnd = { t: cycle.endMs, percent: round(forecast.projectedPercent, 1) }
            if (forecast.crossesAtMs !== null) crossing = { t: forecast.crossesAtMs, value: 100, label: formatGoDate(new Date(forecast.crossesAtMs).toISOString()) }
        }
    }

    const values = points.flatMap((point) => [point.usage ?? 0, point.forecast ?? 0])
    return {
        cycle: { startsAt: new Date(cycle.startMs).toISOString(), endsAt: new Date(cycle.endMs).toISOString(), current: cycle.current },
        points,
        today,
        crossing,
        forecastEnd,
        yMax: goYMax(values),
        missingDays,
        partialDays,
        historyFrom,
    }
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

/** "05/12 às 09:15" no fuso de São Paulo (dica da renovação e dos resets). */
export function formatGoDateTime(iso: string): string {
    const parts = zonedParts(Date.parse(iso))
    return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const

/** "1 dez" no fuso de São Paulo (cabeçalho e rótulo do cruzamento, como "Dec 1" no Console). */
export function formatGoDate(iso: string): string {
    const parts = zonedParts(Date.parse(iso))
    return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]}`
}

/** Rótulo da faixa de datas do eixo: "5 NOV" no fuso de São Paulo. */
export function axisDateLabel(ms: number): string {
    return formatGoDate(new Date(ms).toISOString()).toUpperCase()
}

/** Data completa do tooltip: "16/11/2026" no fuso de São Paulo. */
export function formatGoFullDate(ms: number): string {
    const parts = zonedParts(ms)
    return `${parts.day}/${parts.month}/${parts.year}`
}

/**
 * Marcas da faixa de datas (como no Console): início, ⅓ e ⅔ do ciclo, o cruzamento com o teto (destacado) e o
 * fim. Marca a menos de 3 dias de outra mais importante (início, fim, cruzamento) sai, para não encavalar.
 */
export function goAxisTicks(startMs: number, endMs: number, crossingMs: number | null): { t: number; highlight: boolean }[] {
    const span = endMs - startMs
    const fixed = [{ t: startMs, highlight: false }, ...(crossingMs !== null ? [{ t: crossingMs, highlight: true }] : []), { t: endMs, highlight: false }]
    const thirds = [startMs + span / 3, startMs + (2 * span) / 3].filter((t) => fixed.every((tick) => Math.abs(tick.t - t) >= 3 * DAY_MS))
    return [...fixed, ...thirds.map((t) => ({ t, highlight: false }))].sort((a, b) => a.t - b.t)
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
