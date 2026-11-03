import { bucketKeyFor, bucketKeys, type BucketMode } from "@/lib/time/buckets"
import { METRICS_TIME_ZONE } from "../constants"
import type { MetricPointDto, UsagePointDto } from "../types"

/** Helpers puros das métricas dos agentes (OPE-122). */

/** Porcentagem (0–100) ou `null` sem base: o período vazio mostra "—", nunca 0%. */
export function pct(part: number, total: number): number | null {
    return total > 0 ? (part / total) * 100 : null
}

export function avg(values: readonly number[]): number | null {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function sum(values: readonly (number | null | undefined)[]): number {
    return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

export interface BucketContext {
    mode: BucketMode
    from: number
    to: number
    timeZone?: string
}

export function bucketOf(ms: number, ctx: BucketContext): string {
    return bucketKeyFor(ms, ctx.mode, ctx.timeZone ?? METRICS_TIME_ZONE)
}

export function bucketsOf(ctx: BucketContext): string[] {
    return bucketKeys(ctx.mode, ctx.from, ctx.to, ctx.timeZone ?? METRICS_TIME_ZONE)
}

/**
 * Série de porcentagens por bucket: em cada bucket, a fração dos itens (base) com a marca de cada
 * série. Bucket sem base fica `null` (sem ponto, nunca zero); série não retroativa (`since`) também
 * fica `null` nos buckets anteriores à data de início, e a base dela só conta itens depois dessa data.
 */
export function percentSeries<K extends string>(
    items: readonly { at: number; flags: Partial<Record<K, boolean>> }[],
    keys: readonly K[],
    ctx: BucketContext,
    since: Partial<Record<K, number | null>> = {},
): MetricPointDto[] {
    const groups = new Map<string, { at: number; flags: Partial<Record<K, boolean>> }[]>()
    for (const item of items) {
        const bucket = bucketOf(item.at, ctx)
        const list = groups.get(bucket) ?? []
        list.push(item)
        groups.set(bucket, list)
    }
    const sinceBucket = Object.fromEntries(keys.map((key) => [key, since[key] ? bucketOf(since[key]!, ctx) : null])) as Record<K, string | null>
    return bucketsOf(ctx).map((bucket) => {
        const point: MetricPointDto = { bucket }
        const list = groups.get(bucket) ?? []
        for (const key of keys) {
            const start = since[key] ?? null
            if (start !== null && sinceBucket[key] && bucket < sinceBucket[key]!) {
                point[key] = null
                continue
            }
            const eligible = start === null ? list : list.filter((item) => item.at >= start)
            point[key] = pct(eligible.filter((item) => item.flags[key]).length, eligible.length)
        }
        return point
    })
}

/** Valores por bucket (soma ou média) de uma lista de itens com data. Sem itens no bucket: `null`. */
export function valueSeries<K extends string>(items: readonly { at: number; values: Partial<Record<K, number | null>> }[], keys: readonly K[], ctx: BucketContext, mode: "sum" | "avg" = "sum"): MetricPointDto[] {
    const groups = new Map<string, { at: number; values: Partial<Record<K, number | null>> }[]>()
    for (const item of items) {
        const bucket = bucketOf(item.at, ctx)
        groups.set(bucket, [...(groups.get(bucket) ?? []), item])
    }
    return bucketsOf(ctx).map((bucket) => {
        const point: MetricPointDto = { bucket }
        const list = groups.get(bucket) ?? []
        for (const key of keys) {
            const values = list.map((item) => item.values[key]).filter((value): value is number => typeof value === "number")
            point[key] = values.length ? (mode === "sum" ? sum(values) : avg(values)) : null
        }
        return point
    })
}

/** Uso por data: execuções e falhas por bucket (zero quando não houve uso — é contagem, não taxa). */
export function usageSeries(days: readonly { day: string; runs: number; failures: number }[], ctx: BucketContext): UsagePointDto[] {
    const totals = new Map<string, UsagePointDto>()
    for (const bucket of bucketsOf(ctx)) totals.set(bucket, { bucket, runs: 0, failures: 0 })
    for (const day of days) {
        const key = ctx.mode === "day" ? day.day : ctx.mode === "month" ? day.day.slice(0, 7) : bucketOf(Date.parse(`${day.day}T12:00:00Z`), ctx)
        const hit = totals.get(key)
        if (!hit) continue
        hit.runs += day.runs
        hit.failures += day.failures
    }
    return [...totals.values()]
}

/** Contagem por chave, ordenada da maior para a menor. */
export function countBy<T>(items: readonly T[], keyOf: (item: T) => string | null | undefined): { key: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const item of items) {
        const key = keyOf(item)
        if (!key) continue
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}
