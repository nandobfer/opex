import { getAiProviderKeyById, getAiProviderKeyPool, getPrimaryAiProviderKey, type AiProviderKey } from "@/lib/ai/api-keys"
import { opencodeGoAllowances } from "@/lib/ai/opencode-go"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { API_KEY_ID_PATTERN, USAGE_KEY_ALL } from "@/features/ai/usage-key-filter"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { GO_HISTORY_DAYS, GO_METER_IDS, GO_METER_LABELS, GO_MIN_REFRESH_MS, GO_STATUS_CACHE_MS, GO_STATUS_CONCURRENCY, OPENCODE_GO_USAGE_UPDATED_EVENT, GO_REQUEST_TIMEOUT_MS, type GoMeterId } from "../go-constants"
import {
    addDaysKey,
    buildGoChart,
    combineGoDays,
    cycleDayKeys,
    goCycleFor,
    goForecast,
    goReferenceIndex,
    groupGoSubscriptions,
    meterPercent,
    meterRatio,
    sumGoMeters,
    utcDateKey,
    type GoDayValue,
    type GoMeterSum,
} from "../go-logic"
import type { GoStatus } from "../go-schemas"
import type { GoKeyScopeDto, GoMeterDto, OpencodeGoUsageDto } from "../go-types"
import { fetchGoStatus, GoConsoleError } from "./go-api"
import { loadGoCycleCost, loadGoDays, mapLimit } from "./go-series"

/**
 * Consumo da assinatura OpenCode Go (OPE-167), lido da API do Console com as chaves do chaveiro
 * `ai_opencode_go`: medidores (5h, semana, mês), ciclo, previsão linear, gasto real do ciclo e o gráfico
 * diário em %. Em "Todas as chaves" (OPE-180) soma as assinaturas das chaves em uso — chaves com status
 * idêntico contam uma vez — num gráfico único com um teto de 100%; o ciclo é o da renovação mais próxima.
 * Nada é gravado no banco; o status fica em memória por chave e a rotina `opencode-go-usage-refresh` relê as
 * chaves em uso e publica `opencode-go-usage-updated` (uma vez por leitura) quando algo muda.
 */

const log = () => loggerFor({ feature: "opencode-quota", source: "opencode-go" })

interface StatusEntry {
    at: number
    status: GoStatus
}

interface StatusRead extends StatusEntry {
    fetched: boolean
    /** Os percentuais ou os resets mudaram desde a última publicação desta chave. */
    changed: boolean
}

interface UsageStore {
    status: Map<string, StatusEntry>
    /** Último hash publicado por chave (percentuais com uma casa e resets). */
    hash: Map<string, string>
}

const globalStore = globalThis as typeof globalThis & { __opencodeGoUsage?: UsageStore }
const store = (): UsageStore => (globalStore.__opencodeGoUsage ??= { status: new Map(), hash: new Map() })

/** Somente testes: zera a memória do status. */
export function resetGoUsageCacheForTests(): void {
    globalStore.__opencodeGoUsage = undefined
}

const blank = (state: OpencodeGoUsageDto["state"], message: string, keyName: string | null = null): OpencodeGoUsageDto => ({
    state,
    message,
    checkedAt: new Date().toISOString(),
    keyName,
    scope: null,
    cycle: null,
    meters: [],
    monthPercent: null,
    limitReached: false,
    forecast: null,
    realCostUsd: null,
    realCostPartial: false,
    chart: null,
    chartMessage: null,
})

type KeyResolution = { mode: GoKeyScopeDto["mode"]; keys: AiProviderKey[]; primaryId: string | null } | { dto: OpencodeGoUsageDto }

/** "Todas" soma as chaves em uso (OPE-180); uma chave do chaveiro consulta a assinatura dela; "sem chave"/"removidas" não têm assinatura. */
async function resolveKeys(filter: string | undefined): Promise<KeyResolution> {
    if (!filter || filter === USAGE_KEY_ALL) {
        const [keys, primary] = await Promise.all([getAiProviderKeyPool("ai_opencode_go"), getPrimaryAiProviderKey("ai_opencode_go")])
        return keys.length ? { mode: "all", keys, primaryId: primary?.id ?? null } : { dto: blank("unconfigured", "Cadastre e coloque em uso uma chave do OpenCode Go para ver o consumo da assinatura.") }
    }
    if (API_KEY_ID_PATTERN.test(filter)) {
        const key = await getAiProviderKeyById("ai_opencode_go", filter)
        return key ? { mode: "key", keys: [key], primaryId: key.id } : { dto: blank("no-key", "A chave selecionada não existe mais no chaveiro do OpenCode Go.") }
    }
    return { dto: blank("no-key", "Este filtro de chave não aponta para uma assinatura: escolha “Todas as chaves” ou uma chave do chaveiro.") }
}

const statusHash = (status: GoStatus) =>
    GO_METER_IDS.map((id) => {
        const meter = status.access.meters[id]
        return `${id}:${meterPercent(meter.usedMicroCents, meter.limitMicroCents)}:${meter.resetsAt ?? ""}`
    }).join("|")

/** Status da chave: reaproveita a memória recente; `force` relê (respeitando o intervalo mínimo). Quem chama publica. */
async function readStatus(key: AiProviderKey, { force, nowMs }: { force: boolean; nowMs: number }): Promise<StatusRead> {
    const state = store()
    const hit = state.status.get(key.id)
    if (hit && nowMs - hit.at < (force ? GO_MIN_REFRESH_MS : GO_STATUS_CACHE_MS)) return { ...hit, fetched: false, changed: false }
    const entry = { at: nowMs, status: await fetchGoStatus(key.apiKey) }
    state.status.set(key.id, entry)
    const hash = statusHash(entry.status)
    const changed = state.hash.get(key.id) !== hash
    if (changed) state.hash.set(key.id, hash)
    return { ...entry, fetched: true, changed }
}

type KeyRead = { key: AiProviderKey; read: StatusRead } | { key: AiProviderKey; error: string }

/** Lê o status de cada chave (concorrência limitada); a falha de uma não derruba as outras. Publica uma vez se algo mudou. */
async function readStatuses(keys: readonly AiProviderKey[], options: { force: boolean; nowMs: number }): Promise<KeyRead[]> {
    const reads = await mapLimit(keys, GO_STATUS_CONCURRENCY, async (key): Promise<KeyRead> => {
        try {
            return { key, read: await readStatus(key, options) }
        } catch (error) {
            log().warn({ keyId: key.id, status: error instanceof GoConsoleError ? error.status : null, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] status da assinatura indisponível")
            return { key, error: error instanceof GoConsoleError ? error.message : "Não foi possível ler a assinatura do OpenCode Go." }
        }
    })
    const changed = reads.filter((item) => "read" in item && item.read.changed)
    if (changed.length) {
        const at = Math.max(...changed.map((item) => ("read" in item ? item.read.at : 0)))
        await publishAppEvent(OPENCODE_GO_USAGE_UPDATED_EVENT, { checkedAt: new Date(at).toISOString() }).catch(() => undefined)
    }
    return reads
}

/**
 * Fim do período do filtro (padrão: agora). Ele escolhe o ciclo do gráfico (`goCycleFor`): o padrão "Último
 * mês" termina no fim do dia de hoje em São Paulo e cai sempre no ciclo atual — inclusive entre 21h e 24h,
 * quando já é o dia seguinte em UTC.
 */
export function filterEndMs(query: UsageQuery, nowMs: number): number {
    return query.to ? Date.parse(query.to) : nowMs
}

function metersOf(meters: Record<GoMeterId, Omit<GoMeterSum, "resetsAt"> & { resetsAt?: string | null }>): GoMeterDto[] {
    return GO_METER_IDS.map((id) => {
        const meter = meters[id]
        return { id, label: GO_METER_LABELS[id], percent: meterPercent(meter.usedMicroCents, meter.limitMicroCents), resetsAt: meter.resetsAt ?? null }
    })
}

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10)

/** Uma assinatura da soma: as chaves que a leem (status idêntico) e o status da primeira. */
interface Subscription {
    keys: AiProviderKey[]
    status: GoStatus
    at: number
    /** O status foi relido de fato nesta leitura forçada: relê também hoje e o gasto. */
    reread: boolean
    primary: boolean
    name: string
}

interface BuildOptions {
    force: boolean
}

async function buildUsage(query: UsageQuery, { force }: BuildOptions): Promise<OpencodeGoUsageDto> {
    const resolved = await resolveKeys(query.apiKey)
    if ("dto" in resolved) return resolved.dto
    const { mode, keys, primaryId } = resolved
    const nowMs = Date.now()
    const reads = await readStatuses(keys, { force, nowMs })
    const ok = reads.flatMap((item) => ("read" in item ? [{ key: item.key, read: item.read, status: item.read.status }] : []))
    const failed = reads.flatMap((item) => ("error" in item ? [{ name: item.key.name, message: item.error }] : []))
    if (!ok.length) return blank("error", failed[0]?.message ?? "Não foi possível ler a assinatura do OpenCode Go.", keys.length === 1 ? keys[0]!.name : null)

    const subscriptions: Subscription[] = groupGoSubscriptions(ok).map((group) => ({
        keys: group.map((item) => item.key),
        status: group[0]!.status,
        at: Math.min(...group.map((item) => item.read.at)),
        reread: force && group.some((item) => item.read.fetched),
        primary: group.some((item) => item.key.id === primaryId),
        name: group[0]!.key.name,
    }))
    const reference = subscriptions[goReferenceIndex(subscriptions)]!
    const startMs = Date.parse(reference.status.access.startsAt)
    const endMs = Date.parse(reference.status.access.endsAt)
    const meters = sumGoMeters(subscriptions.map((item) => item.status))
    const monthRatio = meterRatio(meters.month.usedMicroCents, meters.month.limitMicroCents)
    const forecast = goForecast({ startMs, endMs, nowMs, percent: monthRatio })

    const cycle = goCycleFor({ startMs, endMs }, filterEndMs(query, nowMs))
    const historyFrom = addDaysKey(utcDateKey(nowMs), -GO_HISTORY_DAYS)
    const dates = cycleDayKeys(cycle, nowMs).filter((date) => date >= historyFrom)

    // Catálogo de cotas uma vez por produto, lido com a primeira chave daquele produto.
    const allowancesByProduct = new Map<string, Promise<Map<string, number | null> | null>>()
    const allowancesFor = (sub: Subscription) => {
        const product = sub.status.product
        if (!allowancesByProduct.has(product)) {
            allowancesByProduct.set(
                product,
                // Prazo próprio: um catálogo que não responde vira "gráfico indisponível" sem prender os medidores.
                opencodeGoAllowances(product, { apiKey: sub.keys[0]!.apiKey, signal: AbortSignal.timeout(GO_REQUEST_TIMEOUT_MS) }).catch((error: unknown) => {
                    log().warn({ product, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] catálogo de cotas indisponível")
                    return null
                }),
            )
        }
        return allowancesByProduct.get(product)!
    }

    const [series, costs] = await Promise.all([
        (async () => {
            // Uma assinatura por vez: cada uma já usa `GO_SERIES_CONCURRENCY` chamadas simultâneas.
            const result: (Map<string, GoDayValue> | null)[] = []
            for (const sub of subscriptions) {
                const allowances = await allowancesFor(sub)
                const key = sub.keys[0]!
                result.push(allowances ? await loadGoDays({ apiKey: key.apiKey, keyId: key.id, dates, allowances, nowMs, forceToday: sub.reread }) : null)
            }
            return result
        })(),
        Promise.all(subscriptions.map((sub) => loadGoCycleCost({ apiKey: sub.keys[0]!.apiKey, keyId: sub.keys[0]!.id, startMs: Date.parse(sub.status.access.startsAt), nowMs, force: sub.reread }))),
    ])

    let chart: OpencodeGoUsageDto["chart"] = null
    let chartMessage: string | null = null
    if (series.some(Boolean)) {
        const days = combineGoDays(
            series.map((item, index) => ({ days: item, weight: subscriptions[index]!.status.access.meters.month.limitMicroCents })),
            dates,
        )
        chart = buildGoChart({ cycle, nowMs, days, monthRatio, forecast, historyFrom })
    } else chartMessage = "Não foi possível ler o catálogo de modelos do OpenCode Go (cota de cada modelo): o gráfico diário ficou indisponível."

    const knownCosts = costs.filter((cost): cost is number => cost !== null)
    const realCostUsd = knownCosts.length ? Math.round(knownCosts.reduce((total, cost) => total + cost, 0) * 100) / 100 : null
    const okKeys = ok.map((item) => item.key)
    const scope: GoKeyScopeDto = {
        mode,
        keys: subscriptions.flatMap((sub, index) => sub.keys.map((key) => ({ name: key.name, subscription: index }))),
        subscriptions: subscriptions.length,
        failed,
        cycleKeyName: subscriptions.length > 1 ? reference.name : null,
        cyclesDiffer: subscriptions.some((sub) => sub.status.access.startsAt !== reference.status.access.startsAt || sub.status.access.endsAt !== reference.status.access.endsAt),
    }

    return {
        state: "ok",
        message: null,
        // A leitura mais antiga: o aviso de "desatualizado" vale para a soma inteira.
        checkedAt: new Date(Math.min(...subscriptions.map((sub) => sub.at))).toISOString(),
        keyName: mode === "key" || okKeys.length === 1 ? okKeys[0]!.name : null,
        scope,
        cycle: { startsAt: reference.status.access.startsAt, endsAt: reference.status.access.endsAt },
        meters: metersOf(meters),
        monthPercent: meterPercent(meters.month.usedMicroCents, meters.month.limitMicroCents),
        limitReached: forecast.limitReached,
        forecast: {
            dailyAverage: round1(forecast.dailyAverage),
            projectedPercent: round1(forecast.projectedPercent),
            crossesAt: forecast.crossesAtMs === null ? null : new Date(forecast.crossesAtMs).toISOString(),
        },
        realCostUsd,
        realCostPartial: realCostUsd !== null && knownCosts.length < costs.length,
        chart,
        chartMessage,
    }
}

/** Consumo da assinatura para o período e a chave do filtro (status em memória por até 1 min). */
export function getOpencodeGoUsage(query: UsageQuery = {}): Promise<OpencodeGoUsageDto> {
    return buildUsage(query, { force: false })
}

/** Botão Atualizar: relê o status e o dia de hoje (no máximo uma leitura forçada a cada 30 s por chave). */
export function refreshOpencodeGoUsage(query: UsageQuery = {}): Promise<OpencodeGoUsageDto> {
    return buildUsage(query, { force: true })
}

/** Rotina `opencode-go-usage-refresh`: relê o status de todas as chaves em uso e publica (uma vez) quando os percentuais mudam. */
export async function runOpencodeGoUsageRefresh(): Promise<string> {
    const keys = await getAiProviderKeyPool("ai_opencode_go")
    if (!keys.length) return "Sem chave do OpenCode Go em uso"
    const reads = await readStatuses(keys, { force: true, nowMs: Date.now() })
    const lines = reads.map((item) => {
        const text = "read" in item ? metersOf(item.read.status.access.meters).map((meter) => `${meter.label} ${meter.percent.toLocaleString("pt-BR")}%`).join(" · ") : item.error
        return keys.length === 1 ? text : `${item.key.name}: ${text}`
    })
    return lines.join(" | ")
}
