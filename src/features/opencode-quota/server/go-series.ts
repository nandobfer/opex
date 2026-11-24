import { loggerFor } from "@/lib/logger"
import { GO_CLOSED_DAY_CACHE_MS, GO_RECENT_DAY_CACHE_MS, GO_SERIES_CONCURRENCY, GO_FAILED_DAY_CACHE_MS } from "../go-constants"
import { addDaysKey, dateKeysBetween, dayFraction, dayPercentFromModels, utcDateKey, type GoDayValue } from "../go-logic"
import { fetchGoCostByDay, fetchGoModelsCost } from "./go-api"

/**
 * Série diária da assinatura em pontos percentuais, calculada a cada leitura (OPE-167, sem snapshot no
 * banco): `Σ custo(dia, modelo) / cota(modelo) × 100`, um dia por chamada ao `usage/models`. Só a memória
 * do processo guarda os dias lidos (10 min para hoje e ontem, 6 h para os dias fechados).
 */

const log = () => loggerFor({ feature: "opencode-quota", source: "opencode-go" })

interface Cached<T> {
    at: number
    value: T
    /** Resultado negativo (a chamada falhou): vale só por `GO_FAILED_DAY_CACHE_MS`. */
    failed?: boolean
}

interface SeriesStore {
    days: Map<string, Cached<GoDayValue>>
    cost: Map<string, Cached<number | null>>
}

const globalStore = globalThis as typeof globalThis & { __opencodeGoSeries?: SeriesStore }
const store = (): SeriesStore => (globalStore.__opencodeGoSeries ??= { days: new Map(), cost: new Map() })

/** Somente testes: zera a memória da série. */
export function resetGoSeriesCacheForTests(): void {
    globalStore.__opencodeGoSeries = undefined
}

function dayTtl(key: string, nowMs: number): number {
    return key >= addDaysKey(utcDateKey(nowMs), -1) ? GO_RECENT_DAY_CACHE_MS : GO_CLOSED_DAY_CACHE_MS
}

/** Executa `run` em cada item com no máximo `limit` chamadas simultâneas, preservando a ordem dos resultados. */
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

export interface GoDaysRequest {
    apiKey: string
    keyId: string
    dates: readonly string[]
    allowances: ReadonlyMap<string, number | null>
    nowMs: number
    /** Relê hoje mesmo com cache (botão Atualizar). */
    forceToday?: boolean
    signal?: AbortSignal
}

/** Pontos percentuais de cada dia; dia cuja chamada falhou fica `null` (a série segue com os demais). */
export async function loadGoDays({ apiKey, keyId, dates, allowances, nowMs, forceToday = false, signal }: GoDaysRequest): Promise<Map<string, GoDayValue>> {
    const cache = store().days
    const todayKey = utcDateKey(nowMs)
    const entries = await mapLimit(dates, GO_SERIES_CONCURRENCY, async (date): Promise<[string, GoDayValue]> => {
        const cacheKey = `${keyId}:${date}`
        const hit = cache.get(cacheKey)
        const ttl = hit?.failed ? GO_FAILED_DAY_CACHE_MS : dayTtl(date, nowMs)
        const fresh = hit && nowMs - hit.at < ttl && !(forceToday && date === todayKey)
        if (fresh) return [date, hit.value]
        try {
            const value: GoDayValue = dayPercentFromModels(await fetchGoModelsCost(apiKey, date, signal), allowances)
            cache.set(cacheKey, { at: nowMs, value })
            return [date, value]
        } catch (error) {
            if (signal?.aborted) throw error
            log().warn({ date, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] dia da série indisponível")
            const value: GoDayValue = { percent: null, partial: false }
            cache.set(cacheKey, { at: nowMs, value, failed: true })
            return [date, value]
        }
    })
    return new Map(entries)
}

/** Gasto real (US$) do ciclo: `cost-by-day` do início até hoje, com o primeiro dia pró-rateado; `null` se falhar. */
export async function loadGoCycleCost({ apiKey, keyId, startMs, nowMs, force = false, signal }: { apiKey: string; keyId: string; startMs: number; nowMs: number; force?: boolean; signal?: AbortSignal }): Promise<number | null> {
    const cache = store().cost
    const cacheKey = `${keyId}:${startMs}`
    const hit = cache.get(cacheKey)
    if (hit && !force && nowMs - hit.at < GO_RECENT_DAY_CACHE_MS) return hit.value
    const startKey = utcDateKey(startMs)
    try {
        const byDay = await fetchGoCostByDay(apiKey, startKey, utcDateKey(nowMs), signal)
        let micro = 0
        for (const key of dateKeysBetween(startKey, utcDateKey(nowMs))) {
            const cost = byDay.get(key) ?? 0
            micro += key === startKey ? cost * (1 - dayFraction(startMs)) : cost
        }
        const value = Math.round(micro / 1e6) / 100
        cache.set(cacheKey, { at: nowMs, value })
        return value
    } catch (error) {
        if (signal?.aborted) throw error
        log().warn({ err: error instanceof Error ? error.message : String(error) }, "[opencode-go] gasto real do ciclo indisponível")
        return null
    }
}
