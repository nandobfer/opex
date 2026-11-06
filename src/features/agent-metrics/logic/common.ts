import { bucketKeyFor, bucketKeys, type BucketMode } from "@/lib/time/buckets"
import { METRICS_TIME_ZONE } from "../constants"
import type { MetricKpiDto, MetricLineChartDto, MetricLineChartInput, MetricPointDto, MetricSampleDto, UsagePointDto } from "../types"

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
 * Amostra (n) de cada série no ponto: `percentSeries` e `valueSeries` gravam, junto do valor, a chave
 * `n:<série>` com a quantidade de itens da base daquele bucket. `finalizeLineChart` tira essas chaves
 * dos pontos e as devolve em `samples` (o gráfico mostra o n no eixo, no tooltip e na tabela).
 */
export const SAMPLE_KEY_PREFIX = "n:"
export const sampleKey = (key: string) => `${SAMPLE_KEY_PREFIX}${key}`

/** Abaixo deste n, o ponto é pouco representativo (marcador vazado no gráfico). */
export const MIN_RELIABLE_SAMPLE = 3

/** "em cada dia", "em cada semana" ou "em cada mês", conforme o agrupamento. */
export function eachBucketLabel(mode: BucketMode): string {
    return mode === "day" ? "em cada dia" : mode === "week" ? "em cada semana" : "em cada mês"
}

/** Junta séries com os mesmos buckets (cada uma traz as próprias chaves, inclusive as amostras). */
export function mergeLineSeries(...series: MetricPointDto[][]): MetricPointDto[] {
    const first = series[0] ?? []
    return first.map((point, index) => Object.assign({}, ...series.map((list) => list[index] ?? {}), { bucket: point.bucket }) as MetricPointDto)
}

/**
 * Fecha o gráfico de linhas para o DTO: separa as amostras (`n:<série>`) dos valores. A base do
 * bucket é o maior n entre as séries (a base principal; séries com base própria, como "% de CI
 * corrigido", mostram o próprio n no tooltip). Gráfico de soma (`sampleLabel: null`) não leva n.
 */
export function finalizeLineChart(chart: MetricLineChartInput): MetricLineChartDto {
    const keys = chart.series.map((item) => item.key)
    const points: MetricPointDto[] = []
    const samples: MetricSampleDto[] = []
    for (const raw of chart.points) {
        const point: MetricPointDto = { bucket: raw.bucket }
        const bySeries: Record<string, number> = {}
        for (const [key, value] of Object.entries(raw)) {
            if (key.startsWith(SAMPLE_KEY_PREFIX)) bySeries[key.slice(SAMPLE_KEY_PREFIX.length)] = Number(value) || 0
            else point[key] = value
        }
        for (const key of keys) if (!(key in point)) point[key] = null
        const counts = keys.map((key) => bySeries[key] ?? 0)
        points.push(point)
        samples.push({ bucket: raw.bucket, base: counts.length ? Math.max(...counts) : 0, bySeries: Object.fromEntries(keys.map((key, index) => [key, counts[index]!])) })
    }
    return { ...chart, points, samples: chart.sampleLabel === null ? [] : samples, minSample: chart.sampleLabel === null ? null : MIN_RELIABLE_SAMPLE }
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
                point[sampleKey(key)] = 0
                continue
            }
            const eligible = start === null ? list : list.filter((item) => item.at >= start)
            point[key] = pct(eligible.filter((item) => item.flags[key]).length, eligible.length)
            point[sampleKey(key)] = eligible.length
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
            point[sampleKey(key)] = values.length
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

/** Totais das execuções do período (`agent_runs`): o que cada KPI comum precisa, com a contagem de quem tem registro. */
export interface RunTotals {
    runs: number
    failures: number
    costSum: number
    costCount: number
    tokenSum: number
    tokenCount: number
    durationSum: number
    durationCount: number
}

export type RunKpiId = "runs" | "run-failures" | "run-cost" | "run-tokens" | "run-duration"

/**
 * KPIs comuns das execuções (OPE-141, porte do `runKpis` do MT-40 do my-tasks): Execuções, % de falhas,
 * Custo (soma), Tokens (soma) e Duração média. Sem registro, "—" (nunca 0). `covered` tira os que o
 * agente já mostra com o mesmo significado (decisão do dono: fica o KPI do agente).
 */
export function runKpis(totals: RunTotals, covered: readonly RunKpiId[] = []): MetricKpiDto[] {
    const all: MetricKpiDto[] = [
        { id: "runs", label: "Execuções", hint: "No período", value: totals.runs, format: "count", since: null },
        { id: "run-failures", label: "% de falhas", hint: "Execuções que terminaram com erro", value: pct(totals.failures, totals.runs), format: "percent", since: null },
        { id: "run-cost", label: "Custo", hint: "Soma das execuções com custo registrado", value: totals.costCount ? totals.costSum : null, format: "usd", since: null },
        { id: "run-tokens", label: "Tokens", hint: "Soma das execuções com tokens registrados", value: totals.tokenCount ? totals.tokenSum : null, format: "tokens", since: null },
        { id: "run-duration", label: "Duração média", hint: "Das execuções com duração registrada, em minutos", value: totals.durationCount ? totals.durationSum / totals.durationCount / 60_000 : null, format: "duration", since: null },
    ]
    return all.filter((item) => !covered.includes(item.id as RunKpiId))
}
