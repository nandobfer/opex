import { getAiProviderKeyById, listAiProviderKeys } from "@/lib/ai/api-keys"
import { opencodeGoAllowances } from "@/lib/ai/opencode-go"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { API_KEY_ID_PATTERN, USAGE_KEY_ALL } from "@/features/ai/usage-key-filter"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { GO_HISTORY_DAYS, GO_METER_IDS, GO_METER_LABELS, GO_MIN_REFRESH_MS, GO_STATUS_CACHE_MS, OPENCODE_GO_USAGE_UPDATED_EVENT, GO_REQUEST_TIMEOUT_MS } from "../go-constants"
import { addDaysKey, buildGoChart, cycleDayKeys, goCycleFor, goForecast, goReferenceCycle, meterPercent, meterRatio, sumGoMeters, utcDateKey, type GoMeterSet } from "../go-logic"
import type { GoStatus } from "../go-schemas"
import type { GoKeyReadDto, GoMeterDto, OpencodeGoUsageDto } from "../go-types"
import { fetchGoStatus, GoConsoleError } from "./go-api"
import { loadGoCycleCost, loadGoDays } from "./go-series"

/**
 * Consumo da assinatura OpenCode Go (OPE-167), lido da API do Console com as chaves do chaveiro
 * `ai_opencode_go`: medidores (5h, semana, mês), ciclo, previsão linear, gasto real do ciclo e o gráfico
 * diário em %. Em "Todas as chaves" (OPE-180) soma as assinaturas de todas as chaves do chaveiro num card e num
 * gráfico únicos, com um só teto de 100%; o filtro por chave lê só aquela. Nada é gravado no banco; o status fica em
 * memória por chave e a rotina `opencode-go-usage-refresh` relê todas as chaves e publica `opencode-go-usage-updated`
 * quando os percentuais de alguma mudam.
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

/** Chaves que saíram do chaveiro não ficam na memória do status. */
function pruneStatus(keyIds: readonly string[]): void {
    const keep = new Set(keyIds)
    const state = store()
    for (const id of state.status.keys()) if (!keep.has(id)) state.status.delete(id)
    for (const id of state.hash.keys()) if (!keep.has(id)) state.hash.delete(id)
}

const blank = (state: OpencodeGoUsageDto["state"], message: string, keyName: string | null = null, keys: GoKeyReadDto[] = []): OpencodeGoUsageDto => ({
    state,
    message,
    checkedAt: new Date().toISOString(),
    keyName,
    keys,
    cycleKeyName: null,
    cycle: null,
    meters: [],
    monthPercent: null,
    limitReached: false,
    forecast: null,
    realCostUsd: null,
    chart: null,
    chartMessage: null,
})

/** Chave a ler: `apiKey` nulo = segredo que não decifra (entra na cobertura como falha). */
interface ReadKey {
    id: string
    name: string
    apiKey: string | null
}

type KeyResolution = { keys: ReadKey[]; single: boolean } | { dto: OpencodeGoUsageDto }

const UNCONFIGURED_MESSAGE = "Cadastre e ative uma chave do OpenCode Go para ver o consumo da assinatura."

/** "Todas" soma todas as chaves do chaveiro; uma chave do chaveiro consulta a assinatura dela; "sem chave"/"removidas" não têm assinatura. */
async function resolveKeys(filter: string | undefined): Promise<KeyResolution> {
    if (!filter || filter === USAGE_KEY_ALL) {
        const ring = await listAiProviderKeys("ai_opencode_go")
        if (!ring.some((key) => key.active && key.apiKey)) return { dto: blank("unconfigured", UNCONFIGURED_MESSAGE) }
        pruneStatus(ring.map((key) => key.id))
        return { keys: ring.map(({ id, name, apiKey }) => ({ id, name, apiKey })), single: false }
    }
    if (API_KEY_ID_PATTERN.test(filter)) {
        const key = await getAiProviderKeyById("ai_opencode_go", filter)
        return key ? { keys: [key], single: true } : { dto: blank("no-key", "A chave selecionada não existe mais no chaveiro do OpenCode Go.") }
    }
    return { dto: blank("no-key", "Este filtro de chave não aponta para uma assinatura: escolha “Todas as chaves” ou uma chave do chaveiro.") }
}

const statusHash = (status: GoStatus) =>
    GO_METER_IDS.map((id) => {
        const meter = status.access.meters[id]
        return `${id}:${meterPercent(meter.usedMicroCents, meter.limitMicroCents)}:${meter.resetsAt ?? ""}`
    }).join("|")

/** Status da chave: reaproveita a memória recente; `force` relê (respeitando o intervalo mínimo). Publica quando muda. */
async function readStatus(key: { id: string; apiKey: string }, { force, nowMs }: { force: boolean; nowMs: number }): Promise<StatusEntry & { fetched: boolean }> {
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

type KeyRead = { key: ReadKey & { apiKey: string }; entry: StatusEntry & { fetched: boolean }; error: null } | { key: ReadKey; entry: null; error: string }

/** Lê o status de cada chave; a falha de uma vira erro só dela (as demais seguem). */
async function readAll(keys: readonly ReadKey[], options: { force: boolean; nowMs: number }): Promise<KeyRead[]> {
    return Promise.all(
        keys.map(async (key): Promise<KeyRead> => {
            if (!key.apiKey) return { key, entry: null, error: "Não foi possível decifrar esta chave do chaveiro." }
            try {
                return { key: { ...key, apiKey: key.apiKey }, entry: await readStatus({ id: key.id, apiKey: key.apiKey }, options), error: null }
            } catch (error) {
                log().warn({ keyId: key.id, status: error instanceof GoConsoleError ? error.status : null, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] status da assinatura indisponível")
                return { key, entry: null, error: error instanceof GoConsoleError ? error.message : "Não foi possível ler a assinatura do OpenCode Go." }
            }
        }),
    )
}

type OkRead = Extract<KeyRead, { error: null }>
const isOk = (read: KeyRead): read is OkRead => read.error === null

/** Mensagem de falha de todas as chaves: a da própria chave quando há uma só. */
function failureMessage(reads: readonly KeyRead[]): string {
    if (reads.length === 1) return reads[0]!.error ?? "Não foi possível ler a assinatura do OpenCode Go."
    return `Nenhuma chave do OpenCode Go respondeu: ${reads.map((read) => `${read.key.name} — ${read.error}`).join(" · ")}`
}

/**
 * Fim do período do filtro (padrão: agora). Ele escolhe o ciclo do gráfico (`goCycleFor`): o padrão "Último
 * mês" termina no fim do dia de hoje em São Paulo e cai sempre no ciclo atual — inclusive entre 21h e 24h,
 * quando já é o dia seguinte em UTC.
 */
export function filterEndMs(query: UsageQuery, nowMs: number): number {
    return query.to ? Date.parse(query.to) : nowMs
}

function metersOf(meters: GoMeterSet): GoMeterDto[] {
    return GO_METER_IDS.map((id) => {
        const meter = meters[id]
        return { id, label: GO_METER_LABELS[id], percent: meterPercent(meter.usedMicroCents, meter.limitMicroCents), resetsAt: meter.resetsAt ?? null }
    })
}

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10)

interface BuildOptions {
    force: boolean
}

const CATALOG_MESSAGE = "Não foi possível ler o catálogo de modelos do OpenCode Go (cota de cada modelo): o gráfico diário ficou indisponível."

async function buildUsage(query: UsageQuery, { force }: BuildOptions): Promise<OpencodeGoUsageDto> {
    const resolved = await resolveKeys(query.apiKey)
    if ("dto" in resolved) return resolved.dto
    const { keys, single } = resolved
    const keyName = single ? keys[0]!.name : null
    const nowMs = Date.now()
    const reads = await readAll(keys, { force, nowMs })
    const ok = reads.filter(isOk)
    const keyDtos = (costRead: ReadonlySet<string>): GoKeyReadDto[] => reads.map((read) => ({ id: read.key.id, name: read.key.name, error: read.error, cost: costRead.has(read.key.id) }))
    if (ok.length === 0) return blank("error", failureMessage(reads), keyName, keyDtos(new Set()))

    const meters = sumGoMeters(ok.map((read) => read.entry.status.access.meters))
    const reference = goReferenceCycle(
        ok.map((read) => ({ name: read.key.name, startsAt: read.entry.status.access.startsAt, endsAt: read.entry.status.access.endsAt, monthLimit: read.entry.status.access.meters.month.limitMicroCents })),
    )
    // No consolidado o reset do mês é o do ciclo exibido (o mesmo do "Renova em" do cabeçalho).
    if (ok.length > 1) meters.month = { ...meters.month, resetsAt: reference.endsAt }
    const startMs = Date.parse(reference.startsAt)
    const endMs = Date.parse(reference.endsAt)
    const monthRatio = meterRatio(meters.month.usedMicroCents, meters.month.limitMicroCents)
    const forecast = goForecast({ startMs, endMs, nowMs, percent: monthRatio })

    const cycle = goCycleFor({ startMs, endMs }, filterEndMs(query, nowMs))
    const historyFrom = addDaysKey(utcDateKey(nowMs), -GO_HISTORY_DAYS)
    const dates = cycleDayKeys(cycle, nowMs).filter((date) => date >= historyFrom)
    // O Atualizar só relê hoje e o gasto da chave cujo status foi relido de fato (fora do intervalo mínimo).
    const reread = (read: OkRead) => force && read.entry.fetched

    const [series, costs] = await Promise.all([
        (async (): Promise<{ days: Awaited<ReturnType<typeof loadGoDays>> } | { failed: string[] }> => {
            const catalogs = await Promise.all(
                ok.map(async (read) => {
                    try {
                        // Prazo próprio: um catálogo que não responde vira "gráfico indisponível" sem prender os medidores.
                        return { read, allowances: await opencodeGoAllowances(read.entry.status.product, { apiKey: read.key.apiKey, signal: AbortSignal.timeout(GO_REQUEST_TIMEOUT_MS) }) }
                    } catch (error) {
                        log().warn({ keyId: read.key.id, err: error instanceof Error ? error.message : String(error) }, "[opencode-go] catálogo de cotas indisponível")
                        return { read, allowances: null }
                    }
                }),
            )
            const failed = catalogs.filter((catalog) => !catalog.allowances).map((catalog) => catalog.read.key.name)
            if (failed.length) return { failed }
            try {
                const seriesKeys = catalogs.map(({ read, allowances }) => ({ keyId: read.key.id, apiKey: read.key.apiKey, allowances: allowances!, forceToday: reread(read) }))
                return { days: await loadGoDays({ keys: seriesKeys, dates, nowMs }) }
            } catch (error) {
                log().warn({ err: error instanceof Error ? error.message : String(error) }, "[opencode-go] série diária indisponível")
                return { failed: [] }
            }
        })(),
        Promise.all(ok.map((read) => loadGoCycleCost({ apiKey: read.key.apiKey, keyId: read.key.id, startMs, nowMs, force: reread(read) }))),
    ])

    let chart: OpencodeGoUsageDto["chart"] = null
    let chartMessage: string | null = null
    if ("days" in series) chart = buildGoChart({ cycle, nowMs, days: series.days, monthRatio, forecast, historyFrom })
    else if (single || series.failed.length === 0) chartMessage = CATALOG_MESSAGE
    else chartMessage = `Não foi possível ler o catálogo de modelos do OpenCode Go (cota de cada modelo) com ${series.failed.join(", ")}: o gráfico diário consolidado ficou indisponível.`

    const costRead = new Set(ok.filter((_, index) => costs[index] !== null).map((read) => read.key.id))
    const known = costs.filter((value): value is number => value !== null)
    const realCostUsd = known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) * 100) / 100 : null

    return {
        state: "ok",
        message: null,
        checkedAt: new Date(Math.max(...ok.map((read) => read.entry.at))).toISOString(),
        keyName,
        keys: keyDtos(costRead),
        cycleKeyName: reference.keyName,
        cycle: { startsAt: reference.startsAt, endsAt: reference.endsAt },
        meters: metersOf(meters),
        monthPercent: meterPercent(meters.month.usedMicroCents, meters.month.limitMicroCents),
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

/** Consumo da assinatura para o período e a chave do filtro (status em memória por até 1 min por chave). */
export function getOpencodeGoUsage(query: UsageQuery = {}): Promise<OpencodeGoUsageDto> {
    return buildUsage(query, { force: false })
}

/** Botão Atualizar: relê o status e o dia de hoje (no máximo uma leitura forçada a cada 30 s por chave). */
export function refreshOpencodeGoUsage(query: UsageQuery = {}): Promise<OpencodeGoUsageDto> {
    return buildUsage(query, { force: true })
}

/** Rotina `opencode-go-usage-refresh`: relê o status de todas as chaves e publica quando os percentuais de alguma mudam. */
export async function runOpencodeGoUsageRefresh(): Promise<string> {
    const resolved = await resolveKeys(USAGE_KEY_ALL)
    if ("dto" in resolved) return "Sem chave do OpenCode Go em uso"
    const reads = await readAll(resolved.keys, { force: true, nowMs: Date.now() })
    const ok = reads.filter(isOk)
    if (ok.length === 0) return failureMessage(reads)
    const meters = sumGoMeters(ok.map((read) => read.entry.status.access.meters))
    const summary = metersOf(meters)
        .map((meter) => `${meter.label} ${meter.percent.toLocaleString("pt-BR")}%`)
        .join(" · ")
    const failed = reads.length - ok.length
    return failed > 0 ? `${summary} · ${failed} de ${reads.length} chaves sem leitura` : summary
}
