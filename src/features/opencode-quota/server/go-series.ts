import { loggerFor } from "@/lib/logger"
import { GO_CLOSED_DAY_CACHE_MS, GO_CYCLE_COST_CACHE_MAX, GO_RECENT_DAY_CACHE_MS, GO_SERIES_CACHE_MAX, GO_SERIES_CONCURRENCY, GO_FAILED_DAY_CACHE_MS } from "../go-constants"
import { addDaysKey, composeGoDay, dateKeysBetween, dayFraction, utcDateKey, type GoDayPart, type GoDayValue, type GoModelCost } from "../go-logic"
import { readCache, writeCache, type CacheEntry } from "./go-cache"
import { fetchGoCostByDay, fetchGoModelsCost } from "./go-api"

/**
 * Série diária da assinatura em pontos percentuais, calculada a cada leitura (OPE-167, sem snapshot no
 * banco): `Σ custo(dia, modelo) / Σ cota(modelo) × 100`, um dia por chave por chamada ao `usage/models`. No
 * consolidado ("Todas as chaves", OPE-180) custo e cota somam as chaves que responderam no dia. Só a memória do
 * processo guarda o custo bruto lido por chave e dia (10 min para hoje e ontem, 6 h para os dias fechados), com
 * poda e teto (`writeCache`).
 */

const log = () => loggerFor({ feature: "opencode-quota", source: "opencode-go" })

interface SeriesStore {
    /** Custo bruto por modelo de `${keyId}:${date}`; `null` com `failed` quando a chamada falhou. */
    days: Map<string, CacheEntry<GoModelCost[] | null>>
    cost: Map<string, CacheEntry<number | null>>
}

const globalStore = globalThis as typeof globalThis & { __opencodeGoSeries?: SeriesStore }
const store = (): SeriesStore => (globalStore.__opencodeGoSeries ??= { days: new Map(), cost: new Map() })

/** Somente testes: zera a memória da série. */
export function resetGoSeriesCacheForTests(): void {
    globalStore.__opencodeGoSeries = undefined
}

/** Somente testes: tamanho da memória da série. */
export function goSeriesCacheSizeForTests(): { days: number; cost: number } {
    const state = store()
    return { days: state.days.size, cost: state.cost.size }
}

function dayTtl(key: string, nowMs: number): number {
    return key >= addDaysKey(utcDateKey(nowMs), -1) ? GO_RECENT_DAY_CACHE_MS : GO_CLOSED_DAY_CACHE_MS
}

async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
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

export interface GoSeriesKey {
    keyId: string
    apiKey: string
    allowances: ReadonlyMap<string, number | null>
    /** Relê hoje mesmo com cache (botão Atualizar, só a chave cujo status foi relido). */
    forceToday?: boolean
}

export interface GoDaysRequest {
    keys: readonly GoSeriesKey[]
    dates: readonly string[]
    nowMs: number
    signal?: AbortSignal
}

/** Custo bruto do dia numa chave; `null` quando a chamada falhou (não é reconsultado por `GO_FAILED_DAY_CACHE_MS`). */
async function loadDayCosts(key: GoSeriesKey, date: string, nowMs: number, signal?: AbortSignal): Promise<GoModelCost[] | null> {
    const cache = store().days
    const cacheKey = `${key.keyId}:${date}`
    const hit = readCache(cache, cacheKey, nowMs)
    if (hit && !(key.forceToday && date === utcDateKey(nowMs))) return hit.value
    try {
        const value = await fetchGoModelsCost(key.apiKey, date, signal)
        writeCache(cache, cacheKey, { at: nowMs, expiresAt: nowMs + dayTtl(date, nowMs), value }, GO_SERIES_CACHE_MAX)
        return value
    } catch (error) {
        if (signal?.aborted) throw error
        log().warn({ date, keyId: key.keyId, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] dia da série indisponível")
        writeCache(cache, cacheKey, { at: nowMs, expiresAt: nowMs + GO_FAILED_DAY_CACHE_MS, value: null, failed: true }, GO_SERIES_CACHE_MAX)
        return null
    }
}

/**
 * Pontos percentuais de cada dia somando as chaves (uma chave = a assinatura dela). Todas as chamadas `(chave, dia)`
 * dividem o mesmo limite de concorrência; dia em que nenhuma chave respondeu fica `null` (a série segue com os demais).
 */
export async function loadGoDays({ keys, dates, nowMs, signal }: GoDaysRequest): Promise<Map<string, GoDayValue>> {
    const tasks = keys.flatMap((key) => dates.map((date) => ({ key, date })))
    const results = await mapLimit(tasks, GO_SERIES_CONCURRENCY, ({ key, date }) => loadDayCosts(key, date, nowMs, signal))
    const parts = new Map<string, GoDayPart[]>()
    tasks.forEach(({ key, date }, index) => {
        const costs = results[index]
        if (!costs) return
        const list = parts.get(date) ?? []
        list.push({ costs, allowances: key.allowances })
        parts.set(date, list)
    })
    return new Map(dates.map((date) => [date, composeGoDay(parts.get(date) ?? [], keys.length)]))
}

/** Gasto real (US$) do ciclo numa chave: `cost-by-day` do início até hoje, com o primeiro dia pró-rateado; `null` se falhar. */
export async function loadGoCycleCost({ apiKey, keyId, startMs, nowMs, force = false, signal }: { apiKey: string; keyId: string; startMs: number; nowMs: number; force?: boolean; signal?: AbortSignal }): Promise<number | null> {
    const cache = store().cost
    const cacheKey = `${keyId}:${startMs}`
    const hit = readCache(cache, cacheKey, nowMs)
    if (hit && !force) return hit.value
    const startKey = utcDateKey(startMs)
    try {
        const byDay = await fetchGoCostByDay(apiKey, startKey, utcDateKey(nowMs), signal)
        let micro = 0
        for (const key of dateKeysBetween(startKey, utcDateKey(nowMs))) {
            const cost = byDay.get(key) ?? 0
            micro += key === startKey ? cost * (1 - dayFraction(startMs)) : cost
        }
        const value = Math.round(micro / 1e6) / 100
        writeCache(cache, cacheKey, { at: nowMs, expiresAt: nowMs + GO_RECENT_DAY_CACHE_MS, value }, GO_CYCLE_COST_CACHE_MAX)
        return value
    } catch (error) {
        if (signal?.aborted) throw error
        log().warn({ keyId, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] gasto real do ciclo indisponível")
        return null
    }
}
