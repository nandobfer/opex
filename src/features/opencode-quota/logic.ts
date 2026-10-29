import { SCHEDULE_TIMEZONE } from "@/lib/integrations/schedule"
import { OPENCODE_QUOTA_STALE_MS, QUOTA_CRITICAL_PERCENT, QUOTA_ERROR_MESSAGES, QUOTA_PROVIDER_NAMES, QUOTA_WARNING_PERCENT } from "./constants"
import type { QuotaAmount, QuotaSnapshot, QuotaSnapshotError, QuotaSnapshotProvider, QuotaSnapshotRow } from "./schemas"
import type { OpencodeQuotaDto, QuotaLevel, QuotaProviderDto, QuotaProviderStatus, QuotaWindowDto } from "./types"

/** Regras puras da quota do OpenCode (normalização do snapshot v6, cores, contagem do reset). */

const isoOrNull = (value: string | null | undefined): string | null => {
    if (!value) return null
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/** Percentual usado a partir do restante, inteiro entre 0 e 100. */
export function usedPercent(percentRemaining: number): number {
    return Math.min(100, Math.max(0, Math.round(100 - percentRemaining)))
}

export function quotaLevel(used: number): QuotaLevel {
    if (used >= QUOTA_CRITICAL_PERCENT) return "critical"
    if (used >= QUOTA_WARNING_PERCENT) return "warning"
    return "ok"
}

/** Janelas comuns em pt-BR; as demais ficam como o plugin escreve. */
const WINDOW_LABELS: Readonly<Record<string, string>> = { hourly: "Por hora", daily: "Diária", weekly: "Semanal", monthly: "Mensal", yearly: "Anual", session: "Sessão" }

function windowLabel(row: QuotaSnapshotRow): string {
    const label = row.label?.trim() || row.id?.split(".").pop() || "Quota"
    return WINDOW_LABELS[label.toLowerCase()] ?? label
}

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

/** Valor exato do plugin (`{ decimal, unit }`) em pt-BR: moeda, contagem ("12 requests") ou símbolo próprio. */
function formatAmount(amount: QuotaAmount): string | null {
    const value = Number(amount.decimal)
    if (!Number.isFinite(value)) return null
    const unit = amount.unit
    if (unit?.kind === "currency" && unit.code) {
        try {
            return new Intl.NumberFormat("pt-BR", { style: "currency", currency: unit.code }).format(value)
        } catch {
            return `${numberFormat.format(value)} ${unit.code}`
        }
    }
    if (unit?.kind === "count" && unit.unit) return `${numberFormat.format(value)} ${unit.unit}${value === 1 ? "" : "s"}`
    if (unit?.kind === "custom" && unit.symbol) return `${unit.symbol}${numberFormat.format(value)}`
    return numberFormat.format(value)
}

/** Texto da linha sem %: `text` → `flag` (Ativo/Inativo) → `amount` → `remaining` ("… restante(s)"). */
export function rowValueText(row: QuotaSnapshotRow): string | null {
    const text = row.text?.trim()
    if (text) return text
    if (typeof row.flag === "boolean") return row.flag ? "Ativo" : "Inativo"
    if (row.amount) {
        const amount = formatAmount(row.amount)
        if (amount) return amount
    }
    if (row.remaining) {
        const remaining = formatAmount(row.remaining)
        if (remaining) return `${remaining} ${Number(row.remaining.decimal) === 1 ? "restante" : "restantes"}`
    }
    return null
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: SCHEDULE_TIMEZONE })

/** Erro do provedor em pt-BR pelo código do plugin; `rate_limited` com "tente após HH:mm"; status HTTP no fim. */
export function quotaErrorMessage(error: QuotaSnapshotError): string {
    let message = QUOTA_ERROR_MESSAGES[error.code] ?? QUOTA_ERROR_MESSAGES.internal
    if (error.code === "local_tool" && error.tool) message = error.missing ? `${error.tool} não encontrado na máquina do OpenCode` : `Falha no ${error.tool}`
    if (error.code === "rate_limited" && typeof error.retryAtMs === "number" && Number.isFinite(error.retryAtMs)) message = `${message}; tente após ${timeFormat.format(new Date(error.retryAtMs))}`
    if (typeof error.status === "number") message = `${message} (HTTP ${error.status})`
    return message
}

function normalizeProvider(provider: QuotaSnapshotProvider): QuotaProviderDto | null {
    const rows = provider.rows ?? []
    const error = provider.error ?? null
    // Provedor não configurado (sem linhas) ou que nunca respondeu não aparece.
    if (!rows.length && (!error || error.code === "not_configured")) return null
    const windows: QuotaWindowDto[] = []
    rows.forEach((row, index) => {
        const percent = typeof row.percentRemaining === "number" && Number.isFinite(row.percentRemaining) ? usedPercent(row.percentRemaining) : null
        const value = percent === null ? rowValueText(row) : null
        if (percent === null && value === null) return
        windows.push({
            id: `${row.id ?? `${provider.providerId}.${index}`}${row.account ? `:${row.account}` : ""}`,
            label: windowLabel(row),
            account: row.account ?? null,
            usedPercent: percent,
            value,
            resetAt: isoOrNull(row.resetsAt),
        })
    })
    if (!windows.length && !error) return null
    const status: QuotaProviderStatus = !error ? "ok" : windows.length ? "partial" : "error"
    const name = QUOTA_PROVIDER_NAMES[provider.providerId] ?? (provider.label?.trim() || provider.providerId)
    return { id: provider.providerId, name, status, errors: error ? [quotaErrorMessage(error)] : [], windows }
}

/**
 * Instante (ISO) da consulta mais recente a algum provedor (`okAtMs`/`checkedAtMs`): o "Desatualizado"
 * aparece quando o OpenCode não consulta nenhum provedor há mais de 30 min.
 */
export function snapshotCheckedAt(snapshot: QuotaSnapshot): string | null {
    const times = snapshot.providers
        .flatMap((provider) => [provider.okAtMs, provider.checkedAtMs])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    return times.length ? new Date(Math.max(...times)).toISOString() : null
}

/** Snapshot v6 do plugin → DTO da UI, na ordem do snapshot; provedores sem nada a mostrar somem. */
export function normalizeQuotaSnapshot(snapshot: QuotaSnapshot, checkedAt: Date): OpencodeQuotaDto {
    const providers = snapshot.providers.map(normalizeProvider).filter((provider): provider is QuotaProviderDto => provider !== null)
    return { state: "ok", message: null, exportedAt: snapshotCheckedAt(snapshot), checkedAt: checkedAt.toISOString(), providers }
}

/**
 * Janelas-resumo do provedor (card recolhido e provedor recolhido): uma por conta, na ordem do
 * export — a primeira com % (quase sempre a de 5h) ou, sem nenhuma, a primeira linha de valor.
 * Conta só com erro não entra.
 */
export function summaryWindows(provider: QuotaProviderDto): QuotaWindowDto[] {
    const byAccount = new Map<string | null, QuotaWindowDto[]>()
    for (const window of provider.windows) {
        const group = byAccount.get(window.account)
        if (group) group.push(window)
        else byAccount.set(window.account, [window])
    }
    const picked: QuotaWindowDto[] = []
    for (const windows of byAccount.values()) {
        const chosen = windows.find((window) => window.usedPercent !== null) ?? windows.find((window) => window.value !== null)
        if (chosen) picked.push(chosen)
    }
    return picked
}

/** O provedor tem janelas de mais de uma conta (o rótulo do resumo passa a citar a conta). */
export function hasMultipleAccounts(provider: QuotaProviderDto): boolean {
    return new Set(provider.windows.map((window) => window.account)).size > 1
}

/** Rótulo da barra-resumo: "Anthropic · 5h" ou, com várias contas, "Anthropic (pro) · 5h". */
export function summaryLabel(provider: QuotaProviderDto, window: QuotaWindowDto, multiAccount: boolean): string {
    const name = multiAccount && window.account ? `${provider.name} (${window.account})` : provider.name
    return `${name} · ${window.label}`
}

/**
 * O snapshot v6 já guarda as últimas linhas boas de cada provedor; quando ainda assim um provedor
 * vem só com o erro (ex.: o plugin reiniciou sem o arquivo de estado), mantém as janelas da última
 * leitura boa desse provedor como `partial`, com o erro atual de aviso. Só mescla com uma leitura
 * `ok`; provedor que sumiu não volta e leitura com janelas substitui as antigas.
 */
export function keepLastGoodWindows(lastGood: OpencodeQuotaDto | null, next: OpencodeQuotaDto): OpencodeQuotaDto {
    if (next.state !== "ok" || !lastGood || lastGood.state !== "ok") return next
    let changed = false
    const providers = next.providers.map((provider) => {
        if (provider.windows.length) return provider
        const previous = lastGood.providers.find((item) => item.id === provider.id)
        if (!previous?.windows.length) return provider
        changed = true
        return { ...provider, status: "partial" as const, windows: previous.windows }
    })
    return changed ? { ...next, providers } : next
}

/** "2 h 15 min", "3 d 4 h", "12 min"; reset no passado vira "reiniciando…". */
export function formatResetIn(resetAt: string, now: number): string {
    const ms = new Date(resetAt).getTime() - now
    if (!Number.isFinite(ms) || ms <= 0) return "reiniciando…"
    const minutes = Math.max(1, Math.ceil(ms / 60_000))
    const days = Math.floor(minutes / 1440)
    const hours = Math.floor((minutes % 1440) / 60)
    const rest = minutes % 60
    if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
    if (hours > 0) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`
    return `${rest} min`
}

/** O plugin não consulta nenhum provedor há mais de 30 min. */
export function isQuotaStale(exportedAt: string | null, now: number): boolean {
    if (!exportedAt) return false
    return now - new Date(exportedAt).getTime() > OPENCODE_QUOTA_STALE_MS
}

/** Assinatura do que a tela mostra (sem os instantes de leitura): muda → evento em tempo real. */
export function quotaHash(dto: OpencodeQuotaDto): string {
    return JSON.stringify([dto.state, dto.message, dto.providers])
}
