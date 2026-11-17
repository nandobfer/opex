import { getActiveAiProviderKey, getAiProviderKeyById, type ActiveAiProviderKey } from "@/lib/ai/api-keys"
import { opencodeGoAllowances } from "@/lib/ai/opencode-go"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { API_KEY_ID_PATTERN, USAGE_KEY_ALL } from "@/features/ai/usage-key-filter"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { GO_HISTORY_DAYS, GO_METER_IDS, GO_METER_LABELS, GO_MIN_REFRESH_MS, GO_STATUS_CACHE_MS, OPENCODE_GO_USAGE_UPDATED_EVENT, GO_REQUEST_TIMEOUT_MS } from "../go-constants"
import { addDaysKey, buildGoChart, cycleDayKeys, goCycleFor, goForecast, meterPercent, meterRatio, utcDateKey } from "../go-logic"
import type { GoStatus } from "../go-schemas"
import type { GoMeterDto, OpencodeGoUsageDto } from "../go-types"
import { fetchGoStatus, GoConsoleError } from "./go-api"
import { loadGoCycleCost, loadGoDays } from "./go-series"

/**
 * Consumo da assinatura OpenCode Go (OPE-167), lido da API do Console com uma chave do chaveiro
 * `ai_opencode_go`: medidores (5h, semana, mês), ciclo, previsão linear, gasto real do ciclo e o gráfico
 * diário em %. Nada é gravado no banco; o status fica em memória por chave e a rotina
 * `opencode-go-usage-refresh` relê a chave em uso e publica `opencode-go-usage-updated` quando muda.
 */

const log = () => loggerFor({ feature: "opencode-quota", source: "opencode-go" })

interface StatusEntry {
    at: number
    status: GoStatus
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
    cycle: null,
    meters: [],
    monthPercent: null,
    limitReached: false,
    forecast: null,
    realCostUsd: null,
    chart: null,
    chartMessage: null,
})

type KeyResolution = { key: ActiveAiProviderKey } | { dto: OpencodeGoUsageDto }

/** "Todas" usa a chave em uso; uma chave do chaveiro consulta a assinatura dela; "sem chave"/"removidas" não têm assinatura. */
async function resolveKey(filter: string | undefined): Promise<KeyResolution> {
    if (!filter || filter === USAGE_KEY_ALL) {
        const key = await getActiveAiProviderKey("ai_opencode_go")
        return key ? { key } : { dto: blank("unconfigured", "Cadastre e ative uma chave do OpenCode Go para ver o consumo da assinatura.") }
    }
    if (API_KEY_ID_PATTERN.test(filter)) {
        const key = await getAiProviderKeyById("ai_opencode_go", filter)
        return key ? { key } : { dto: blank("no-key", "A chave selecionada não existe mais no chaveiro do OpenCode Go.") }
    }
    return { dto: blank("no-key", "Este filtro de chave não aponta para uma assinatura: escolha “Todas as chaves” ou uma chave do chaveiro.") }
}

const statusHash = (status: GoStatus) =>
    GO_METER_IDS.map((id) => {
        const meter = status.access.meters[id]
        return `${id}:${meterPercent(meter.usedMicroCents, meter.limitMicroCents)}:${meter.resetsAt ?? ""}`
    }).join("|")

/** Status da chave: reaproveita a memória recente; `force` relê (respeitando o intervalo mínimo). Publica quando muda. */
async function readStatus(key: ActiveAiProviderKey, { force, nowMs }: { force: boolean; nowMs: number }): Promise<StatusEntry & { fetched: boolean }> {
    const state = store()
    const hit = state.status.get(key.id)
    if (hit && nowMs - hit.at < (force ? GO_MIN_REFRESH_MS : GO_STATUS_CACHE_MS)) return { ...hit, fetched: false }
    const entry = { at: nowMs, status: await fetchGoStatus(key.apiKey) }
    state.status.set(key.id, entry)
    const hash = statusHash(entry.status)
    if (state.hash.get(key.id) !== hash) {
        state.hash.set(key.id, hash)
        await publishAppEvent(OPENCODE_GO_USAGE_UPDATED_EVENT, { checkedAt: new Date(entry.at).toISOString() }).catch(() => undefined)
    }
    return { ...entry, fetched: true }
}

/**
 * Fim do período do filtro (padrão: agora). Ele escolhe o ciclo do gráfico (`goCycleFor`): o padrão "Último
 * mês" termina no fim do dia de hoje em São Paulo e cai sempre no ciclo atual — inclusive entre 21h e 24h,
 * quando já é o dia seguinte em UTC.
 */
export function filterEndMs(query: UsageQuery, nowMs: number): number {
    return query.to ? Date.parse(query.to) : nowMs
}

function metersOf(status: GoStatus): GoMeterDto[] {
    return GO_METER_IDS.map((id) => {
        const meter = status.access.meters[id]
        return { id, label: GO_METER_LABELS[id], percent: meterPercent(meter.usedMicroCents, meter.limitMicroCents), resetsAt: meter.resetsAt ?? null }
    })
}

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10)

interface BuildOptions {
    force: boolean
}

async function buildUsage(query: UsageQuery, { force }: BuildOptions): Promise<OpencodeGoUsageDto> {
    const resolved = await resolveKey(query.apiKey)
    if ("dto" in resolved) return resolved.dto
    const { key } = resolved
    const nowMs = Date.now()
    let entry: StatusEntry & { fetched: boolean }
    try {
        entry = await readStatus(key, { force, nowMs })
    } catch (error) {
        const message = error instanceof GoConsoleError ? error.message : "Não foi possível ler a assinatura do OpenCode Go."
        log().warn({ status: error instanceof GoConsoleError ? error.status : null, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] status da assinatura indisponível")
        return blank("error", message, key.name)
    }
    const { status } = entry
    // O Atualizar só relê hoje e o gasto quando o status foi relido de fato (fora do intervalo mínimo).
    const reread = force && entry.fetched
    const startMs = Date.parse(status.access.startsAt)
    const endMs = Date.parse(status.access.endsAt)
    const month = status.access.meters.month
    const monthRatio = meterRatio(month.usedMicroCents, month.limitMicroCents)
    const forecast = goForecast({ startMs, endMs, nowMs, percent: monthRatio })

    const cycle = goCycleFor({ startMs, endMs }, filterEndMs(query, nowMs))
    const historyFrom = addDaysKey(utcDateKey(nowMs), -GO_HISTORY_DAYS)
    const dates = cycleDayKeys(cycle, nowMs).filter((date) => date >= historyFrom)

    let chart: OpencodeGoUsageDto["chart"] = null
    let chartMessage: string | null = null
    const [series, realCostUsd] = await Promise.all([
        (async () => {
            try {
                // Prazo próprio: um catálogo que não responde vira "gráfico indisponível" sem prender os medidores.
                const allowances = await opencodeGoAllowances(status.product, { apiKey: key.apiKey, signal: AbortSignal.timeout(GO_REQUEST_TIMEOUT_MS) })
                return await loadGoDays({ apiKey: key.apiKey, keyId: key.id, dates, allowances, nowMs, forceToday: reread })
            } catch (error) {
                log().warn({ err: error instanceof Error ? error.message : String(error) }, "[opencode-go] catálogo de cotas indisponível")
                return null
            }
        })(),
        loadGoCycleCost({ apiKey: key.apiKey, keyId: key.id, startMs, nowMs, force: reread }),
    ])
    if (series) chart = buildGoChart({ cycle, nowMs, days: series, monthRatio, forecast, historyFrom })
    else chartMessage = "Não foi possível ler o catálogo de modelos do OpenCode Go (cota de cada modelo): o gráfico diário ficou indisponível."

    return {
        state: "ok",
        message: null,
        checkedAt: new Date(entry.at).toISOString(),
        keyName: key.name,
        cycle: { startsAt: status.access.startsAt, endsAt: status.access.endsAt },
        meters: metersOf(status),
        monthPercent: meterPercent(month.usedMicroCents, month.limitMicroCents),
        limitReached: forecast.limitReached,
        forecast: {
            dailyAverage: round1(forecast.dailyAverage),
            projectedPercent: round1(forecast.projectedPercent),
            crossesAt: forecast.crossesAtMs === null ? null : new Date(forecast.crossesAtMs).toISOString(),
        },
        realCostUsd,
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

/** Rotina `opencode-go-usage-refresh`: relê o status da chave em uso e publica quando os percentuais mudam. */
export async function runOpencodeGoUsageRefresh(): Promise<string> {
    const key = await getActiveAiProviderKey("ai_opencode_go")
    if (!key) return "Sem chave do OpenCode Go em uso"
    try {
        const { status } = await readStatus(key, { force: true, nowMs: Date.now() })
        const percents = metersOf(status).map((meter) => `${meter.label} ${meter.percent.toLocaleString("pt-BR")}%`)
        return percents.join(" · ")
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}
