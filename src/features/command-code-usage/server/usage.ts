import { getAiProviderKeyById, getAiProviderKeyPool, getPrimaryAiProviderKey, type AiProviderKey } from "@/lib/ai/api-keys"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { API_KEY_ID_PATTERN, USAGE_KEY_ALL } from "@/features/ai/usage-key-filter"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { DAY_MS, buildCycleChart, cycleDayKeys, cycleForecast, dayStartMs, meterPercent, meterRatio, utcDateKey } from "@/features/subscription-usage/cycle-logic"
import { CC_MIN_REFRESH_MS, CC_READ_CACHE_MS, CC_READ_CONCURRENCY, COMMAND_CODE_USAGE_UPDATED_EVENT } from "../constants"
import { ccAccountKey, ccExtraCredits, ccMonthPool, ccReferenceIndex, combineCcDays, groupCcAccounts, hasCcWindows, sumCcMeters } from "../logic"
import type { CcCredits, CcSubscription } from "../schemas"
import type { CcKeyScopeDto, CommandCodeUsageDto } from "../types"
import { CommandCodeAlphaError, fetchCcCredits, fetchCcSubscription, fetchCcSummary, fetchCcWhoami } from "./api"
import { loadCcDays, mapLimit } from "./series"

/**
 * Consumo da assinatura Command Code (OPE-190), lido da API da CLI (`/alpha/*`) com as chaves do chaveiro
 * `ai_command_code`: janelas de 5h e semanal, pool mensal derivado, ciclo, previsão linear, valor de uso do ciclo e
 * o gráfico diário em %. Em "Todas as chaves" soma as contas das chaves em uso — chaves da mesma conta contam uma
 * vez —, com o ciclo da renovação mais próxima. Nada é gravado no banco; a leitura fica em memória por chave e a
 * rotina `command-code-usage-refresh` relê as chaves em uso e publica `command-code-usage-updated` quando algo muda.
 */

const log = () => loggerFor({ feature: "command-code-usage", source: "command-code" })

/** Leitura de uma conta por uma chave: só o que a tela usa (sem nome, e-mail nem cobrança). */
export interface CcAccountRead {
    account: string | null
    orgId: string | null
    credits: CcCredits
    subscription: CcSubscription | null
    /** Totais desde o início do ciclo (`totalMonthlyCredits` = usado do pool; `totalCost` = valor de uso). */
    cycleUsed: number | null
    cycleCost: number | null
}

interface ReadEntry {
    at: number
    read: CcAccountRead
}

interface UsageStore {
    reads: Map<string, ReadEntry>
    hash: Map<string, string>
}

const globalStore = globalThis as typeof globalThis & { __commandCodeUsage?: UsageStore }
const store = (): UsageStore => (globalStore.__commandCodeUsage ??= { reads: new Map(), hash: new Map() })

/** Somente testes: zera a memória das leituras. */
export function resetCcUsageCacheForTests(): void {
    globalStore.__commandCodeUsage = undefined
}

const blank = (state: CommandCodeUsageDto["state"], message: string, keyName: string | null = null): CommandCodeUsageDto => ({
    state,
    message,
    checkedAt: new Date().toISOString(),
    keyName,
    scope: null,
    planId: null,
    cycle: null,
    meters: [],
    monthPercent: null,
    limitReached: false,
    forecast: null,
    usageValueUsd: null,
    usageValuePartial: false,
    extraCreditsUsd: null,
    noWindows: false,
    chart: null,
    chartMessage: null,
})

type KeyResolution = { mode: CcKeyScopeDto["mode"]; keys: AiProviderKey[]; primaryId: string | null } | { dto: CommandCodeUsageDto }

async function resolveKeys(filter: string | undefined): Promise<KeyResolution> {
    if (!filter || filter === USAGE_KEY_ALL) {
        const [keys, primary] = await Promise.all([getAiProviderKeyPool("ai_command_code"), getPrimaryAiProviderKey("ai_command_code")])
        return keys.length ? { mode: "all", keys, primaryId: primary?.id ?? null } : { dto: blank("unconfigured", "Cadastre e coloque em uso uma chave do Command Code para ver o consumo da assinatura.") }
    }
    if (API_KEY_ID_PATTERN.test(filter)) {
        const key = await getAiProviderKeyById("ai_command_code", filter)
        return key ? { mode: "key", keys: [key], primaryId: key.id } : { dto: blank("no-key", "A chave selecionada não existe mais no chaveiro do Command Code.") }
    }
    return { dto: blank("no-key", "Este filtro de chave não aponta para uma assinatura: escolha “Todas as chaves” ou uma chave do chaveiro.") }
}

/** Uma conta inteira: identidade, créditos e janelas, assinatura (ciclo) e os totais desde o início do ciclo. */
async function fetchAccount(apiKey: string): Promise<CcAccountRead> {
    const whoami = await fetchCcWhoami(apiKey)
    const orgId = whoami.org?.id ?? null
    const [credits, subscription] = await Promise.all([
        fetchCcCredits(apiKey, orgId),
        // Sem assinatura (pago por uso) ou endpoint indisponível: segue sem ciclo; chave recusada continua falha.
        fetchCcSubscription(apiKey, orgId).catch((error: unknown) => {
            if (error instanceof CommandCodeAlphaError && !error.unavailable && error.status !== 404) throw error
            return null
        }),
    ])
    const startMs = subscription?.currentPeriodStart ? Date.parse(subscription.currentPeriodStart) : null
    const summary =
        startMs !== null
            ? await fetchCcSummary(apiKey, orgId, startMs).catch((error: unknown) => {
                  log().warn({ err: error instanceof Error ? error.message : String(error) }, "[command-code] totais do ciclo indisponíveis")
                  return null
              })
            : null
    return { account: ccAccountKey(whoami), orgId, credits, subscription, cycleUsed: summary?.totalMonthlyCredits ?? null, cycleCost: summary?.totalCost ?? null }
}

function monthOf(read: CcAccountRead) {
    return ccMonthPool(read.cycleUsed, read.credits.credits.monthlyCredits)
}

function readHash(read: CcAccountRead): string {
    const meters = sumCcMeters([{ credits: read.credits, month: monthOf(read) }])
    return meters.map((meter) => `${meter.id}:${meter.percent}:${meter.resetsAt ?? ""}`).join("|")
}

interface KeyRead {
    key: AiProviderKey
    at: number
    read: CcAccountRead
    fetched: boolean
    changed: boolean
}

type KeyResult = KeyRead | { key: AiProviderKey; error: CommandCodeAlphaError }

async function readKey(key: AiProviderKey, { force, nowMs }: { force: boolean; nowMs: number }): Promise<KeyRead> {
    const state = store()
    const hit = state.reads.get(key.id)
    if (hit && nowMs - hit.at < (force ? CC_MIN_REFRESH_MS : CC_READ_CACHE_MS)) return { key, ...hit, fetched: false, changed: false }
    const entry = { at: nowMs, read: await fetchAccount(key.apiKey) }
    state.reads.set(key.id, entry)
    const hash = readHash(entry.read)
    const changed = state.hash.get(key.id) !== hash
    if (changed) state.hash.set(key.id, hash)
    return { key, ...entry, fetched: true, changed }
}

/** Lê cada chave (concorrência limitada); a falha de uma não derruba as outras. Publica uma vez se algo mudou. */
async function readKeys(keys: readonly AiProviderKey[], options: { force: boolean; nowMs: number }): Promise<KeyResult[]> {
    const results = await mapLimit(keys, CC_READ_CONCURRENCY, async (key): Promise<KeyResult> => {
        try {
            return await readKey(key, options)
        } catch (error) {
            log().warn({ keyId: key.id, status: error instanceof CommandCodeAlphaError ? error.status : null, err: error instanceof Error ? error.message : String(error) }, "[command-code] uso da conta indisponível")
            return { key, error: error instanceof CommandCodeAlphaError ? error : new CommandCodeAlphaError("Não foi possível ler o uso do Command Code.", null, false) }
        }
    })
    const changed = results.filter((item): item is KeyRead => "read" in item && item.changed)
    if (changed.length) await publishAppEvent(COMMAND_CODE_USAGE_UPDATED_EVENT, { checkedAt: new Date(Math.max(...changed.map((item) => item.at))).toISOString() }).catch(() => undefined)
    return results
}

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10)
const round2 = (value: number) => Math.round(value * 100) / 100

interface Account {
    keys: AiProviderKey[]
    read: CcAccountRead
    at: number
    reread: boolean
    primary: boolean
    name: string
}

async function buildUsage(query: UsageQuery, { force }: { force: boolean }): Promise<CommandCodeUsageDto> {
    const resolved = await resolveKeys(query.apiKey)
    if ("dto" in resolved) return resolved.dto
    const { mode, keys, primaryId } = resolved
    const nowMs = Date.now()
    const results = await readKeys(keys, { force, nowMs })
    const ok = results.filter((item): item is KeyRead => "read" in item)
    const errors = results.flatMap((item) => ("error" in item ? [item] : []))
    const failed = errors.map((item) => ({ name: item.key.name, message: item.error.message }))
    if (!ok.length) {
        const first = errors[0]?.error
        return blank(first?.unavailable ? "unavailable" : "error", first?.message ?? "Não foi possível ler o uso do Command Code.", keys.length === 1 ? keys[0]!.name : null)
    }

    const accounts: Account[] = groupCcAccounts(ok.map((item) => ({ ...item, account: item.read.account }))).map((group) => {
        // Chaves da mesma conta lidas em instantes diferentes: vale a leitura mais recente.
        const latest = group.reduce((best, item) => (item.at > best.at ? item : best))
        return {
            keys: group.map((item) => item.key),
            read: latest.read,
            at: Math.min(...group.map((item) => item.at)),
            reread: force && group.some((item) => item.fetched),
            primary: group.some((item) => item.key.id === primaryId),
            name: group[0]!.key.name,
        }
    })

    const meters = sumCcMeters(accounts.map((account) => ({ credits: account.read.credits, month: monthOf(account.read) })))
    const noWindows = accounts.every((account) => !hasCcWindows(account.read.credits)) && !meters.some((meter) => meter.id === "month")
    const costs = accounts.map((account) => account.read.cycleCost)
    const knownCosts = costs.filter((cost): cost is number => cost !== null)
    const usageValueUsd = knownCosts.length ? round2(knownCosts.reduce((total, cost) => total + cost, 0)) : null
    const plans = [...new Set(accounts.map((account) => account.read.subscription?.planId).filter((plan): plan is string => Boolean(plan)))]

    // Contas com ciclo e pool: são elas que entram no % do mês, na previsão e no gráfico.
    const cycled = accounts.flatMap((account) => {
        const sub = account.read.subscription
        const month = monthOf(account.read)
        if (!sub?.currentPeriodStart || !sub.currentPeriodEnd || !month) return []
        return [{ account, month, startMs: Date.parse(sub.currentPeriodStart), endMs: Date.parse(sub.currentPeriodEnd) }]
    })
    const withCycle = accounts.find((account) => account.read.subscription?.currentPeriodStart && account.read.subscription.currentPeriodEnd)
    const reference = cycled.length ? cycled[ccReferenceIndex(cycled.map((item) => ({ endMs: item.endMs, pool: item.month.pool, primary: item.account.primary, name: item.account.name })))]! : null

    const scope: CcKeyScopeDto = {
        mode,
        keys: accounts.flatMap((account, index) => account.keys.map((key) => ({ name: key.name, account: index }))),
        accounts: accounts.length,
        failed,
        cycleKeyName: cycled.length > 1 && reference ? reference.account.name : null,
        cyclesDiffer: Boolean(reference) && cycled.some((item) => item.startMs !== reference!.startMs || item.endMs !== reference!.endMs),
    }
    const okKeys = ok.map((item) => item.key)
    const base: CommandCodeUsageDto = {
        ...blank("ok", ""),
        message: null,
        checkedAt: new Date(Math.min(...accounts.map((account) => account.at))).toISOString(),
        keyName: mode === "key" || okKeys.length === 1 ? okKeys[0]!.name : null,
        scope,
        planId: plans.length === 1 ? plans[0]! : null,
        cycle: withCycle ? { startsAt: withCycle.read.subscription!.currentPeriodStart!, endsAt: withCycle.read.subscription!.currentPeriodEnd! } : null,
        meters,
        usageValueUsd,
        usageValuePartial: usageValueUsd !== null && knownCosts.length < costs.length,
        extraCreditsUsd: ccExtraCredits(accounts.map((account) => account.read.credits)),
        noWindows,
    }

    if (!reference) {
        const chartMessage = noWindows
            ? "Plano sem janelas de uso: não há teto mensal para o gráfico. O saldo e o valor de uso aparecem acima."
            : "A API da CLI não informou o ciclo ou o uso do pool mensal: o mensal e o gráfico ficaram indisponíveis."
        return { ...base, chartMessage }
    }

    const { startMs, endMs } = reference
    // % do mês no ciclo de referência: créditos usados desde o início dela, somados, sobre a soma dos pools. Com o
    // mesmo ciclo em todas, é `Σ usado / Σ pool`.
    const totalPool = cycled.reduce((total, item) => total + item.month.pool, 0)
    const sameCycle = !scope.cyclesDiffer
    const series = await Promise.all(
        cycled.map((item) =>
            loadCcDays({ apiKey: item.account.keys[0]!.apiKey, keyId: item.account.keys[0]!.id, orgId: item.account.read.orgId, cycleStartMs: startMs, nowMs, forceToday: item.account.reread }).catch(() => null),
        ),
    )
    const dates = cycleDayKeys({ startMs, endMs, current: true }, nowMs)
    const days = combineCcDays(
        series.map((item, index) => ({ days: item, pool: cycled[index]!.month.pool })),
        dates,
        startMs,
    )
    const usedInReference = sameCycle
        ? cycled.reduce((total, item) => total + item.month.used, 0)
        : // Ciclos diferentes: o usado desde o início da referência é a soma dos dias da série (sem dados contam 0).
          dates.reduce((total, date) => {
              const day = days.get(date)
              if (day?.percent == null) return total
              const share = date === utcDateKey(startMs) ? (dayStartMs(date) + DAY_MS - startMs) / DAY_MS : 1
              return total + (day.percent * share * totalPool) / 100
          }, 0)
    const monthRatio = meterRatio(usedInReference, totalPool)
    const forecast = cycleForecast({ startMs, endMs, nowMs, percent: monthRatio })
    const filterEnd = query.to ? Date.parse(query.to) : nowMs

    const dto: CommandCodeUsageDto = {
        ...base,
        cycle: { startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() },
        monthPercent: meterPercent(monthRatio, 100),
        limitReached: forecast.limitReached,
        forecast: {
            dailyAverage: round1(forecast.dailyAverage),
            projectedPercent: round1(forecast.projectedPercent),
            crossesAt: forecast.crossesAtMs === null ? null : new Date(forecast.crossesAtMs).toISOString(),
        },
    }
    if (filterEnd < startMs) return { ...dto, chartMessage: "Ciclos anteriores não são legíveis: o Command Code só informa o saldo do ciclo atual." }
    if (!series.some(Boolean)) return { ...dto, chartMessage: "Não foi possível ler os totais diários do Command Code: o gráfico ficou indisponível." }
    return { ...dto, chart: buildCycleChart({ cycle: { startMs, endMs, current: true }, nowMs, days, monthRatio, forecast, historyFrom: utcDateKey(startMs) }) }
}

/** Consumo da assinatura para o período e a chave do filtro (leitura em memória por até 1 min). */
export function getCommandCodeUsage(query: UsageQuery = {}): Promise<CommandCodeUsageDto> {
    return buildUsage(query, { force: false })
}

/** Botão Atualizar: relê a conta e o dia de hoje (no máximo uma leitura forçada a cada 30 s por chave). */
export function refreshCommandCodeUsage(query: UsageQuery = {}): Promise<CommandCodeUsageDto> {
    return buildUsage(query, { force: true })
}

/** Rotina `command-code-usage-refresh`: relê todas as chaves em uso e publica (uma vez) quando os percentuais mudam. */
export async function runCommandCodeUsageRefresh(): Promise<string> {
    const keys = await getAiProviderKeyPool("ai_command_code")
    if (!keys.length) return "Sem chave do Command Code em uso"
    const results = await readKeys(keys, { force: true, nowMs: Date.now() })
    return results
        .map((item) => {
            const text =
                "read" in item
                    ? sumCcMeters([{ credits: item.read.credits, month: monthOf(item.read) }])
                          .map((meter) => `${meter.label} ${meter.percent.toLocaleString("pt-BR")}%`)
                          .join(" · ") || "sem janelas de uso"
                    : item.error.message
            return keys.length === 1 ? text : `${item.key.name}: ${text}`
        })
        .join(" | ")
}
