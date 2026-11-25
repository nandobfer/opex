import { DAY_MS, dayStartMs, meterPercent, utcDateKey, type CycleDayValue } from "@/features/subscription-usage/cycle-logic"
import type { UsageMeterDto } from "@/features/subscription-usage/types"
import { CC_METER_LABELS, CC_WINDOW_IDS, type CcMeterId } from "./constants"
import type { CcCredits, CcWhoami, CcWindow } from "./schemas"
import type { CcKeyScopeDto } from "./types"

/**
 * Regras da assinatura Command Code (OPE-190), módulo PURO. A API da CLI informa as janelas de 5h e semanal
 * (`used`/`cap`), os créditos mensais RESTANTES e os totais desde um instante (`usage/summary?since=`). O mensal e a
 * série diária são derivados: pool do ciclo = usado no ciclo + restante; uso de um dia = `since(início do dia)` −
 * `since(início do dia seguinte)`.
 */

/** Identidade da conta para não somar duas vezes as chaves da mesma conta: a organização ou, sem ela, o usuário. */
export function ccAccountKey(whoami: CcWhoami): string | null {
    if (whoami.org?.id) return `org:${whoami.org.id}`
    if (whoami.user?.id) return `user:${whoami.user.id}`
    return null
}

/** Agrupa as leituras por conta, na ordem da primeira chave de cada uma; sem identidade, cada chave fica sozinha. */
export function groupCcAccounts<T extends { account: string | null }>(reads: readonly T[]): T[][] {
    const groups = new Map<string, T[]>()
    reads.forEach((read, index) => {
        const key = read.account ?? `key:${index}`
        const group = groups.get(key)
        if (group) group.push(read)
        else groups.set(key, [read])
    })
    return [...groups.values()]
}

/** Janela do plano (cap > 0); `resetAt` nulo quando a janela não foi usada. */
function windowOf(credits: CcCredits, id: (typeof CC_WINDOW_IDS)[number]): CcWindow | null {
    const window = credits.windowLimits?.[id]
    if (!window || !(window.cap > 0)) return null
    return { used: Math.max(0, window.used), cap: window.cap, resetAt: window.resetAt ?? null }
}

/** O plano tem janelas de uso (GOAT, Pro, Max, Team); o Provider (pago por uso) não tem. */
export function hasCcWindows(credits: CcCredits): boolean {
    if (credits.windowLimits?.limited === false) return false
    return CC_WINDOW_IDS.some((id) => windowOf(credits, id) !== null)
}

/** Pool mensal do ciclo: usado no ciclo + restante. `null` sem o usado (campo ausente) ou com pool vazio. */
export function ccMonthPool(usedCycle: number | null | undefined, remaining: number): { used: number; pool: number } | null {
    if (typeof usedCycle !== "number" || !Number.isFinite(usedCycle)) return null
    const used = Math.max(0, usedCycle)
    const pool = used + Math.max(0, remaining)
    return pool > 0 ? { used, pool } : null
}

export interface CcAccountMeters {
    credits: CcCredits
    month: { used: number; pool: number } | null
}

/**
 * Medidores somados entre as contas: 5h e Semanal por `Σ used / Σ cap` (o reset é o mais próximo) e Mensal por
 * `Σ usado / Σ pool`. Janela que nenhuma conta tem não aparece; Mensal só quando todas as contas têm o pool.
 */
export function sumCcMeters(accounts: readonly CcAccountMeters[]): UsageMeterDto<CcMeterId>[] {
    const meters: UsageMeterDto<CcMeterId>[] = []
    for (const id of CC_WINDOW_IDS) {
        const windows = accounts.map((account) => windowOf(account.credits, id)).filter((window): window is CcWindow => window !== null)
        if (!windows.length) continue
        const used = windows.reduce((total, window) => total + window.used, 0)
        const cap = windows.reduce((total, window) => total + window.cap, 0)
        const resets = windows.map((window) => window.resetAt).filter((reset): reset is string => reset !== null)
        const resetsAt = resets.length ? resets.reduce((nearest, reset) => (Date.parse(reset) < Date.parse(nearest) ? reset : nearest)) : null
        meters.push({ id, label: CC_METER_LABELS[id], percent: meterPercent(used, cap), resetsAt })
    }
    if (accounts.length && accounts.every((account) => account.month)) {
        const used = accounts.reduce((total, account) => total + account.month!.used, 0)
        const pool = accounts.reduce((total, account) => total + account.month!.pool, 0)
        meters.push({ id: "month", label: CC_METER_LABELS.month, percent: meterPercent(used, pool), resetsAt: null })
    }
    return meters
}

/** Créditos extras restantes (comprados + gratuitos) somados; `null` sem nenhum. */
export function ccExtraCredits(accounts: readonly CcCredits[]): number | null {
    const total = accounts.reduce((sum, item) => sum + Math.max(0, item.credits.purchasedCredits ?? 0) + Math.max(0, item.credits.freeCredits ?? 0), 0)
    return total > 0 ? Math.round(total * 100) / 100 : null
}

/**
 * Limites da série do ciclo: o início do ciclo e o início de cada dia UTC seguinte até hoje (inclusive). Cada
 * limite vira um `summary?since=`; o dia `i` é a diferença entre o limite dele e o do dia seguinte.
 */
export function ccSeriesBoundaries(cycleStartMs: number, nowMs: number): { date: string; sinceMs: number }[] {
    if (nowMs <= cycleStartMs) return []
    const boundaries = [{ date: utcDateKey(cycleStartMs), sinceMs: cycleStartMs }]
    for (let start = dayStartMs(utcDateKey(cycleStartMs)) + DAY_MS; start <= nowMs; start += DAY_MS) boundaries.push({ date: utcDateKey(start), sinceMs: start })
    return boundaries
}

export interface CcDayCredits {
    /** Créditos do pool mensal usados no dia (no primeiro dia, só a parte do ciclo); `null` sem dados. */
    credits: number | null
    /** Diferença negativa entre duas leituras (consumo no meio): contou 0. */
    partial: boolean
}

/**
 * Créditos de cada dia pelos totais acumulados desde cada limite (`totals[i]` = `since(limite i)`, de agora para
 * trás): dia `i` = `totals[i] − totals[i+1]`; o último (hoje) = `totals[n−1]`. Falta de um dos dois → sem dados.
 */
export function ccDailyCredits(boundaries: readonly { date: string }[], totals: readonly (number | null)[]): Map<string, CcDayCredits> {
    const days = new Map<string, CcDayCredits>()
    boundaries.forEach((boundary, index) => {
        const current = totals[index] ?? null
        const next = index + 1 < boundaries.length ? (totals[index + 1] ?? null) : 0
        if (current === null || next === null) {
            days.set(boundary.date, { credits: null, partial: false })
            return
        }
        const diff = current - next
        days.set(boundary.date, diff < 0 ? { credits: 0, partial: true } : { credits: diff, partial: false })
    })
    return days
}

/**
 * Série diária em pontos percentuais do pool mensal somado: `Σ créditos do dia / Σ pools × 100`. O gráfico
 * pró-rateia o primeiro dia do ciclo pela fração que cai nele; como a API já mediu só essa fração, o valor do
 * primeiro dia é dividido por ela (o gráfico devolve o medido). Conta sem dados no dia conta 0 e marca o dia como
 * incompleto; sem dados de nenhuma, o dia fica sem dados.
 */
export function combineCcDays(series: readonly { days: ReadonlyMap<string, CcDayCredits> | null; pool: number }[], dates: readonly string[], cycleStartMs: number): Map<string, CycleDayValue> {
    const totalPool = series.reduce((total, item) => total + item.pool, 0)
    const firstDate = utcDateKey(cycleStartMs)
    const firstShare = (dayStartMs(firstDate) + DAY_MS - cycleStartMs) / DAY_MS
    const combined = new Map<string, CycleDayValue>()
    for (const date of dates) {
        let credits = 0
        let known = 0
        let partial = false
        for (const item of series) {
            const day = item.days?.get(date)
            if (!day || day.credits === null) continue
            known++
            credits += day.credits
            partial ||= day.partial
        }
        if (known === 0 || totalPool <= 0) {
            combined.set(date, { percent: null, partial: false })
            continue
        }
        const share = date === firstDate && firstShare > 0 ? firstShare : 1
        combined.set(date, { percent: (credits / totalPool) * 100 / share, partial, ...(known < series.length ? { incomplete: true } : {}) })
    }
    return combined
}

/** Conta cujo ciclo rege o gráfico, a previsão e o "Renova em": a da renovação mais próxima; empate pelo maior pool, depois a principal, depois o nome. */
export function ccReferenceIndex(accounts: readonly { endMs: number; pool: number; primary: boolean; name: string }[]): number {
    let best = 0
    for (let index = 1; index < accounts.length; index++) {
        const a = accounts[index]!
        const b = accounts[best]!
        const order = a.endMs - b.endMs || b.pool - a.pool || Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, "pt-BR")
        if (order < 0) best = index
    }
    return best
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Rótulo das chaves no subtítulo: "Chave: X" com uma chave; "Chaves: 3 (2 contas)" na soma. */
export function ccKeyLabel(scope: CcKeyScopeDto | null, keyName: string | null): string | null {
    if (!scope || scope.keys.length <= 1) {
        const name = scope?.keys[0]?.name ?? keyName
        return name ? `Chave: ${name}` : null
    }
    const keys = `Chaves: ${scope.keys.length}`
    return scope.accounts < scope.keys.length ? `${keys} (${plural(scope.accounts, "conta", "contas")})` : keys
}

/** Mensagem pt-BR para uma resposta de erro da API da CLI (`unavailable` = endpoint que sumiu). */
export function ccAlphaStatusMessage(status: number): { message: string; unavailable: boolean } {
    if (status === 401) return { message: "O Command Code recusou a chave na API da CLI (HTTP 401). Confira a chave em Integrações › Inteligência Artificial › Command Code.", unavailable: false }
    if (status === 403) return { message: "A chave não tem acesso aos dados de uso do Command Code (HTTP 403).", unavailable: false }
    if (status === 404)
        return {
            message: "A API da CLI do Command Code (/alpha) não respondeu este endpoint (HTTP 404): a assinatura não é legível por ela no momento. O consumo medido pelo Opex continua abaixo.",
            unavailable: true,
        }
    if (status === 429) return { message: "O Command Code limitou as consultas de uso (HTTP 429). Tente novamente em alguns minutos.", unavailable: false }
    return { message: `A API da CLI do Command Code respondeu HTTP ${status}.`, unavailable: false }
}

/** Formato não reconhecido: cita só os campos, nunca valores. */
export function ccFormatMessage(endpoint: string, fields: readonly string[]): string {
    return `A API da CLI do Command Code respondeu num formato não reconhecido em ${endpoint}${fields.length ? ` (campos: ${fields.join(", ")})` : ""}: a assinatura não é legível por ela no momento. O consumo medido pelo Opex continua abaixo.`
}
