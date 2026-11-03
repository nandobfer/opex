/**
 * Buckets de tempo por fuso IANA (módulo puro): chaves de dia (`YYYY-MM-DD`), semana (segunda-feira)
 * e mês (`YYYY-MM`), usadas pelos Dashboards e pelas métricas dos agentes.
 */

export type BucketMode = "day" | "week" | "month"

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function zonedFormat(timeZone: string): Intl.DateTimeFormat {
    let formatter = formatterCache.get(timeZone)
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        formatterCache.set(timeZone, formatter)
    }
    return formatter
}

/** `YYYY-MM-DD` do instante no fuso. */
export function dayKey(ms: number, timeZone: string): string {
    const parts = zonedFormat(timeZone).formatToParts(new Date(ms))
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
    return `${get("year")}-${get("month")}-${get("day")}`
}

const pad = (value: number) => String(value).padStart(2, "0")

function utcMsFromDayKey(key: string): number {
    const [year, month, day] = key.split("-").map(Number)
    return Date.UTC(year!, month! - 1, day!)
}

function dayKeyFromUtcMs(ms: number): string {
    const date = new Date(ms)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Segunda-feira (`YYYY-MM-DD`) da semana do instante, no fuso. */
export function weekKey(ms: number, timeZone: string): string {
    const utc = utcMsFromDayKey(dayKey(ms, timeZone))
    const weekday = new Date(utc).getUTCDay() // 0 = domingo
    return dayKeyFromUtcMs(utc - ((weekday + 6) % 7) * 86_400_000)
}

/** `YYYY-MM` do instante no fuso. */
export function monthKey(ms: number, timeZone: string): string {
    return dayKey(ms, timeZone).slice(0, 7)
}

export function bucketKeyFor(ms: number, mode: BucketMode, timeZone: string): string {
    if (mode === "day") return dayKey(ms, timeZone)
    if (mode === "week") return weekKey(ms, timeZone)
    return monthKey(ms, timeZone)
}

/** Modo do bucket a partir do intervalo: ≤ 31 dias → dia; acima → semana. */
export function bucketMode(fromMs: number, toMs: number): "day" | "week" {
    return Math.round((toMs - fromMs) / 86_400_000) <= 31 ? "day" : "week"
}

function nextMonthKey(key: string): string {
    const [year, month] = key.split("-").map(Number)
    const date = new Date(Date.UTC(year!, month! - 1, 1))
    date.setUTCMonth(date.getUTCMonth() + 1)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

/** Chaves dos buckets cobrindo o intervalo (inclusive). Intervalo invertido devolve `[]`. */
export function bucketKeys(mode: BucketMode, fromMs: number, toMs: number, timeZone: string): string[] {
    if (fromMs > toMs) return []
    const keys: string[] = []
    if (mode === "month") {
        const end = monthKey(toMs, timeZone)
        let current = monthKey(fromMs, timeZone)
        let guard = 0
        while (guard++ < 500) {
            keys.push(current)
            if (current === end) break
            current = nextMonthKey(current)
        }
        return keys
    }
    const step = mode === "week" ? 7 * 86_400_000 : 86_400_000
    const startUtc = utcMsFromDayKey(mode === "week" ? weekKey(fromMs, timeZone) : dayKey(fromMs, timeZone))
    const endUtc = utcMsFromDayKey(mode === "week" ? weekKey(toMs, timeZone) : dayKey(toMs, timeZone))
    let guard = 0
    for (let cursor = startUtc; cursor <= endUtc && guard++ < 2000; cursor += step) keys.push(dayKeyFromUtcMs(cursor))
    return keys
}
