import { loggerFor } from "@/lib/logger"
import { utcDateKey } from "@/features/subscription-usage/cycle-logic"
import { CC_CLOSED_DAY_CACHE_MS, CC_FAILED_DAY_CACHE_MS, CC_RECENT_DAY_CACHE_MS, CC_SERIES_CONCURRENCY } from "../constants"
import { ccDailyCredits, ccSeriesBoundaries, type CcDayCredits } from "../logic"
import { fetchCcSummary } from "./api"

/**
 * Série diária da assinatura Command Code (OPE-190), sem snapshot no banco: cada dia do ciclo é a diferença entre os
 * totais de `usage/summary?since=` no início dele e no início do dia seguinte (hoje = desde o início de hoje). Os
 * dias ficam em memória por (chave, ciclo, dia): fechados 6 h, hoje 10 min e falhas 90 s.
 */

const log = () => loggerFor({ feature: "command-code-usage", source: "command-code" })

interface DayEntry {
    at: number
    ttl: number
    value: CcDayCredits
}

const globalStore = globalThis as typeof globalThis & { __commandCodeSeries?: Map<string, DayEntry> }
const store = () => (globalStore.__commandCodeSeries ??= new Map())

/** Somente testes: zera a memória da série. */
export function resetCcSeriesCacheForTests(): void {
    globalStore.__commandCodeSeries = undefined
}

/** Executa com no máximo `limit` tarefas ao mesmo tempo, preservando a ordem. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length)
    let next = 0
    const worker = async () => {
        while (next < items.length) {
            const index = next++
            results[index] = await run(items[index]!)
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
    return results
}

/**
 * Créditos do pool mensal por dia do ciclo que começa em `cycleStartMs`. `forceToday` relê o dia de hoje (botão
 * Atualizar). Só os limites dos dias que faltam na memória são consultados.
 */
export async function loadCcDays(options: { apiKey: string; keyId: string; orgId: string | null; cycleStartMs: number; nowMs: number; forceToday: boolean }): Promise<Map<string, CcDayCredits>> {
    const { apiKey, keyId, orgId, cycleStartMs, nowMs, forceToday } = options
    const boundaries = ccSeriesBoundaries(cycleStartMs, nowMs)
    const today = utcDateKey(nowMs)
    const cache = store()
    const cacheKey = (date: string) => `${keyId}:${cycleStartMs}:${date}`
    const result = new Map<string, CcDayCredits>()
    const missing: number[] = []
    boundaries.forEach((boundary, index) => {
        const hit = cache.get(cacheKey(boundary.date))
        const fresh = hit && nowMs - hit.at < hit.ttl && !(forceToday && boundary.date === today)
        if (fresh) result.set(boundary.date, hit.value)
        else missing.push(index)
    })
    if (!missing.length) return result

    // Cada dia precisa do limite dele e do seguinte (o último, hoje, só do dele).
    const needed = [...new Set(missing.flatMap((index) => (index + 1 < boundaries.length ? [index, index + 1] : [index])))].sort((a, b) => a - b)
    const totals = new Array<number | null>(boundaries.length).fill(null)
    await mapLimit(needed, CC_SERIES_CONCURRENCY, async (index) => {
        try {
            const summary = await fetchCcSummary(apiKey, orgId, boundaries[index]!.sinceMs)
            totals[index] = summary.totalMonthlyCredits ?? null
        } catch (error) {
            log().warn({ date: boundaries[index]!.date, err: error instanceof Error ? error.message : String(error) }, "[command-code] limite da série indisponível")
        }
    })
    const computed = ccDailyCredits(boundaries, totals)
    for (const index of missing) {
        const date = boundaries[index]!.date
        const value = computed.get(date) ?? { credits: null, partial: false }
        const ttl = value.credits === null ? CC_FAILED_DAY_CACHE_MS : date === today ? CC_RECENT_DAY_CACHE_MS : CC_CLOSED_DAY_CACHE_MS
        cache.set(cacheKey(date), { at: nowMs, ttl, value })
        result.set(date, value)
    }
    return result
}
