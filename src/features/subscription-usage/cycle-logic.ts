import { USAGE_DISPLAY_TIME_ZONE } from "./constants"
import type { CycleChartDto, CycleChartPointDto } from "./types"

/**
 * Regras compartilhadas das assinaturas lidas por ciclo (OpenCode Go, OPE-167; Command Code, OPE-190), módulo PURO:
 * percentual do medidor, previsão linear, ciclos, eixos e o desenho do gráfico de um ciclo. Dias são baldes UTC
 * (`YYYY-MM-DD`).
 */

export const DAY_MS = 86_400_000

export const roundTo = (value: number, digits = 2) => {
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

/** Percentual exato do medidor (`usado / limite × 100`). */
export function meterRatio(used: number, limit: number): number {
    return limit > 0 ? (used / limit) * 100 : 0
}

/** Percentual com uma casa, truncado (o Console mostra o inteiro truncado: 43,90 → 43). */
export function meterPercent(used: number, limit: number): number {
    return Math.floor(meterRatio(used, limit) * 10 + 1e-9) / 10
}

export interface CycleForecast {
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
export function cycleForecast({ startMs, endMs, nowMs, percent }: { startMs: number; endMs: number; nowMs: number; percent: number }): CycleForecast {
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

export interface UsageCycle {
    startMs: number
    endMs: number
    current: boolean
}

/**
 * Ciclo exibido no gráfico (decisão do dono, 17/11/2026: um ciclo por vez, sem acumular entre ciclos): o atual
 * quando o fim do filtro alcança o início dele (o padrão "Último mês" termina hoje); senão o ciclo anterior que
 * contém o fim do filtro, deduzido voltando mês a mês a partir do início do ciclo atual.
 */
export function cycleFor(current: { startMs: number; endMs: number }, toMs: number): UsageCycle {
    if (toMs >= current.startMs) return { ...current, current: true }
    let end = current.startMs
    for (let back = 1; back <= 36; back++) {
        const start = subUtcMonths(current.startMs, back)
        if (toMs >= start) return { startMs: start, endMs: end, current: false }
        end = start
    }
    return { startMs: subUtcMonths(current.startMs, 37), endMs: end, current: false }
}

/** Dias UTC que o ciclo toca até `untilMs`. */
export function cycleDayKeys(cycle: UsageCycle, untilMs: number): string[] {
    const last = Math.min(cycle.endMs - 1, untilMs)
    return last < cycle.startMs ? [] : dateKeysBetween(utcDateKey(cycle.startMs), utcDateKey(last))
}

export interface CycleDayValue {
    /** Pontos percentuais do dia; `null` sem dados. */
    percent: number | null
    partial: boolean
    /** Soma de assinaturas em que alguma ficou sem dados no dia (contou 0). */
    incomplete?: boolean
}

export interface CycleChartInput {
    cycle: UsageCycle
    nowMs: number
    days: ReadonlyMap<string, CycleDayValue>
    /** % exato do medidor mensal (ponta de hoje no ciclo atual). */
    monthRatio: number
    forecast: CycleForecast
    historyFrom: string
}

/** Folga mínima do eixo Y: o teto de 100% sempre aparece com respiro. */
const Y_MIN = 110
/** Passos possíveis das marcas do eixo Y: 50, 100, 200, 500, 1000… (o menor que deixe no máximo 6 marcas). */
const Y_TICK_MANTISSAS = [1, 2, 5]
const Y_MAX_TICKS = 6
/** Marca a menos desta fração do topo sai, para os rótulos não se encavalarem (o 100% fica sempre). */
const Y_TICK_GAP = 0.08

/**
 * Teto do eixo Y: o próximo múltiplo de 10 estritamente acima do maior valor do gráfico (uso e previsão), no
 * mínimo 110% — 113% → 120%, 120% → 130%, 96% → 110%. Fica sempre acima do maior ponto, para o círculo e o
 * rótulo do fim da previsão não saírem do domínio.
 */
export function cycleYMax(values: readonly number[]): number {
    const top = Math.max(0, ...values)
    return Math.max(Y_MIN, Math.floor(top / 10) * 10 + 10)
}

/**
 * Marcas do eixo Y: múltiplos do menor passo (50, 100, 200, 500, 1000…) que deixe no máximo 6 marcas, com o 100%
 * (teto) e o próprio topo como última marca — 0, 50, 100, 120 até a previsão crescer; 0, 100, 200, 300, 400, 490.
 */
export function cycleYTicks(yMax: number): number[] {
    for (let index = 0; ; index++) {
        const step = Y_TICK_MANTISSAS[(index + 2) % 3]! * 10 ** (Math.floor((index + 2) / 3) + 1)
        const ticks = new Set<number>([0])
        // O 100% (teto) é marca fixa enquanto não encavala com o 0%; acima disso a linha pontilhada já o mostra.
        if (100 >= yMax * Y_TICK_GAP) ticks.add(100)
        for (let value = step; value < yMax; value += step) {
            if (yMax - value >= yMax * Y_TICK_GAP) ticks.add(value)
        }
        if (ticks.size + 1 > Y_MAX_TICKS) continue
        return [...[...ticks].sort((a, b) => a - b), yMax]
    }
}

/**
 * Gráfico de UM ciclo, no desenho do Console do OpenCode Go: a linha nasce em 0% no início do ciclo, ganha um
 * ponto no fim de cada dia UTC (o primeiro e o último dia pró-rateados pelos horários de início e fim) e, no ciclo
 * atual, termina em "agora" com o valor exato do medidor. A previsão é a reta de "agora" até a renovação, com um
 * ponto no fim de cada dia (`dayForecast` = a parte da previsão que cai no dia); o teto é fixo em 100%. Dia sem
 * dados quebra a linha e conta 0.
 */
export function buildCycleChart(input: CycleChartInput): CycleChartDto {
    const { cycle, nowMs, days, monthRatio, forecast, historyFrom } = input
    const live = cycle.current && nowMs < cycle.endMs
    const untilMs = live ? nowMs : cycle.endMs
    const points: CycleChartPointDto[] = [{ t: cycle.startMs, date: utcDateKey(cycle.startMs), dayPercent: null, usage: 0, forecast: null, dayForecast: null }]
    let cumulative = 0
    let missingDays = 0
    let partialDays = 0
    let incompleteDays = 0

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
        if (percent !== null && day?.incomplete) incompleteDays++
        if (isToday) break
        // Primeiro e último dia do ciclo entram pró-rateados — no acumulado e no "uso do dia" da dica.
        const share = percent === null ? null : percent * ((to - from) / DAY_MS)
        cumulative += share ?? 0
        points.push({ t: to, date: key, dayPercent: share === null ? null : roundTo(share), usage: percent === null ? null : roundTo(cumulative), forecast: null, dayForecast: null })
    }

    let today: CycleChartDto["today"] = null
    let crossing: CycleChartDto["crossing"] = null
    let forecastEnd: CycleChartDto["forecastEnd"] = null
    if (live) {
        const key = utcDateKey(nowMs)
        const todayPercent = days.get(key)?.percent ?? null
        const value = roundTo(monthRatio)
        points.push({ t: nowMs, date: key, dayPercent: todayPercent === null ? null : roundTo(todayPercent), usage: value, forecast: forecast.projectedPercent !== null ? value : null, dayForecast: null })
        today = { t: nowMs, percent: value }
        if (forecast.projectedPercent !== null) {
            // Um ponto no fim de cada dia UTC até a renovação (todos sobre a mesma reta), para a dica mostrar a
            // previsão do dia sob o mouse, como o uso do dia no trecho verde.
            const rate = monthRatio / (nowMs - cycle.startMs)
            let previous = nowMs
            for (const dayKey of dateKeysBetween(utcDateKey(nowMs), utcDateKey(cycle.endMs - 1))) {
                const t = Math.min(dayStartMs(dayKey) + DAY_MS, cycle.endMs)
                if (t <= previous) continue
                const atEnd = t === cycle.endMs
                points.push({ t, date: dayKey, dayPercent: null, usage: null, forecast: atEnd ? roundTo(forecast.projectedPercent) : roundTo(monthRatio + rate * (t - nowMs)), dayForecast: roundTo(rate * (t - previous)) })
                previous = t
            }
            forecastEnd = { t: cycle.endMs, percent: roundTo(forecast.projectedPercent, 1) }
            if (forecast.crossesAtMs !== null) crossing = { t: forecast.crossesAtMs, value: 100, label: formatUsageDate(new Date(forecast.crossesAtMs).toISOString()) }
        }
    }

    const values = points.flatMap((point) => [point.usage ?? 0, point.forecast ?? 0])
    return {
        cycle: { startsAt: new Date(cycle.startMs).toISOString(), endsAt: new Date(cycle.endMs).toISOString(), current: cycle.current },
        points,
        today,
        crossing,
        forecastEnd,
        yMax: cycleYMax(values),
        missingDays,
        partialDays,
        incompleteDays,
        historyFrom,
    }
}

function zonedParts(ms: number): Record<string, string> {
    const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: USAGE_DISPLAY_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms))
    return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

/** "05/12 às 09:15" no fuso de São Paulo (dica da renovação e dos resets). */
export function formatUsageDateTime(iso: string): string {
    const parts = zonedParts(Date.parse(iso))
    return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const

/** "1 dez" no fuso de São Paulo (cabeçalho e rótulo do cruzamento, como "Dec 1" no Console). */
export function formatUsageDate(iso: string): string {
    const parts = zonedParts(Date.parse(iso))
    return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]}`
}

/** Rótulo da faixa de datas do eixo: "5 NOV" no fuso de São Paulo. */
export function axisDateLabel(ms: number): string {
    return formatUsageDate(new Date(ms).toISOString()).toUpperCase()
}

/** Data completa do tooltip: "16/11/2026" no fuso de São Paulo. */
export function formatUsageFullDate(ms: number): string {
    const parts = zonedParts(ms)
    return `${parts.day}/${parts.month}/${parts.year}`
}

/**
 * Marcas da faixa de datas (como no Console): início, ⅓ e ⅔ do ciclo, o cruzamento com o teto (destacado) e o
 * fim. Marca a menos de 3 dias de outra mais importante (início, fim, cruzamento) sai, para não encavalar.
 */
export function cycleAxisTicks(startMs: number, endMs: number, crossingMs: number | null): { t: number; highlight: boolean }[] {
    const span = endMs - startMs
    const fixed = [{ t: startMs, highlight: false }, ...(crossingMs !== null ? [{ t: crossingMs, highlight: true }] : []), { t: endMs, highlight: false }]
    const thirds = [startMs + span / 3, startMs + (2 * span) / 3].filter((t) => fixed.every((tick) => Math.abs(tick.t - t) >= 3 * DAY_MS))
    return [...fixed, ...thirds.map((t) => ({ t, highlight: false }))].sort((a, b) => a.t - b.t)
}

/** Percentual em pt-BR com uma casa ("43,9%"). */
export function formatUsagePercent(value: number, digits = 1): string {
    return `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

/** Valor em US$ ("US$ 44,53"). */
export function formatUsageUsd(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "USD" })
}

/** Leitura antiga demais (a rotina relê a cada 5 min). */
export function isUsageStale(checkedAt: string, nowMs: number, staleAfterMs: number): boolean {
    const at = Date.parse(checkedAt)
    return Number.isFinite(at) && nowMs - at > staleAfterMs
}

/** Trecho final da linha de status do cabeçalho: limite atingido, data em que o ritmo atual atinge o teto ou o % previsto. */
export function usageStatusLine(data: { limitReached: boolean; forecast: { crossesAt: string | null; projectedPercent: number | null } | null }): { text: string; tone: "warning" | "destructive" | "muted" } | null {
    if (data.limitReached) return { text: "Limite mensal atingido", tone: "destructive" }
    if (data.forecast?.crossesAt) return { text: `No ritmo atual, atinge o limite em ${formatUsageDate(data.forecast.crossesAt)}`, tone: "warning" }
    if (data.forecast?.projectedPercent !== null && data.forecast?.projectedPercent !== undefined) return { text: `Previsão de ${formatUsagePercent(data.forecast.projectedPercent)} até a renovação`, tone: "muted" }
    return null
}
