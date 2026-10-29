import { OPENCODE_QUOTA_STALE_MS, QUOTA_CRITICAL_PERCENT, QUOTA_PROVIDER_NAMES, QUOTA_WARNING_PERCENT } from "./constants"
import type { QuotaExport, QuotaExportEntry, QuotaExportProvider } from "./schemas"
import type { OpencodeQuotaDto, QuotaLevel, QuotaProviderDto, QuotaProviderStatus, QuotaWindowDto } from "./types"

/** Regras puras da quota do OpenCode (normalização do export, cores, contagem do reset). */

const toIso = (seconds: number | null | undefined): string | null => (typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null)

/** Percentual usado a partir do restante, inteiro entre 0 e 100. */
export function usedPercent(percentRemaining: number): number {
    return Math.min(100, Math.max(0, Math.round(100 - percentRemaining)))
}

export function quotaLevel(used: number): QuotaLevel {
    if (used >= QUOTA_CRITICAL_PERCENT) return "critical"
    if (used >= QUOTA_WARNING_PERCENT) return "warning"
    return "ok"
}

/** Maior prefixo comum, em palavras inteiras, dos nomes das linhas (o nome do provedor no formato 3). */
function commonWordPrefix(names: string[]): string {
    if (names.length < 2) return ""
    const split = names.map((name) => name.split(" "))
    const prefix: string[] = []
    for (let index = 0; index < split[0].length - 1; index++) {
        const word = split[0][index]
        if (split.every((words) => words.length - 1 > index && words[index] === word)) prefix.push(word)
        else break
    }
    return prefix.join(" ")
}

/** Nome do provedor: mapa conhecido → texto antes de "(conta)" → prefixo comum das linhas → id. */
function providerName(id: string, entries: QuotaExportEntry[]): string {
    const known = QUOTA_PROVIDER_NAMES[id]
    if (known) return known
    for (const entry of entries) {
        if (entry.account && entry.name) {
            const at = entry.name.indexOf(` (${entry.account})`)
            if (at > 0) return entry.name.slice(0, at)
        }
    }
    return commonWordPrefix(entries.map((entry) => entry.name ?? "")) || id
}

/** Janelas comuns em pt-BR; as demais ficam como o plugin escreve. */
const WINDOW_LABELS: Readonly<Record<string, string>> = { hourly: "Por hora", daily: "Diária", weekly: "Semanal", monthly: "Mensal", yearly: "Anual", session: "Sessão" }

/**
 * Rótulo da linha: o nome sem o provedor e a conta ("Anthropic (pro) Fable" → "Fable"); no formato 2,
 * sem o grupo entre colchetes ("[OpenCode Go] 5h" → "5h"). Sem nome, a janela ou o fim do id.
 */
function windowLabel(entry: QuotaExportEntry, provider: string, prefix: string): string {
    let name = (entry.name ?? "").trim()
    if (name.startsWith("[")) name = name.replace(/^\[[^\]]*\]\s*/, "")
    else {
        if (prefix && name.startsWith(`${prefix} `)) name = name.slice(prefix.length + 1)
        else if (name.startsWith(`${provider} `)) name = name.slice(provider.length + 1)
        if (entry.account && name.startsWith(`(${entry.account}) `)) name = name.slice(entry.account.length + 3)
    }
    name = name.replace(/:$/, "").trim() || entry.window?.trim() || entry.id?.split(".").pop() || "Quota"
    return WINDOW_LABELS[name.toLowerCase()] ?? name
}

function providerErrors(provider: QuotaExportProvider): string[] {
    const errors = (provider.errors ?? []).map((item) => (typeof item === "string" ? item : (item.message ?? ""))).filter(Boolean)
    if (provider.error) errors.unshift(provider.error)
    return errors
}

function normalizeProvider(id: string, provider: QuotaExportProvider): QuotaProviderDto | null {
    const status = provider.status as QuotaProviderStatus
    if (status !== "ok" && status !== "partial" && status !== "error") return null
    const entries = provider.entries ?? []
    const name = providerName(id, entries)
    const prefix = entries.some((entry) => entry.account) ? "" : commonWordPrefix(entries.map((entry) => entry.name ?? ""))
    const windows: QuotaWindowDto[] = []
    entries.forEach((entry, index) => {
        const percent = entry.renderType !== "value" && typeof entry.percentRemaining === "number" ? usedPercent(entry.percentRemaining) : null
        const value = percent === null ? entry.value?.trim() || null : null
        if (percent === null && value === null) return
        windows.push({
            id: `${entry.id ?? index}${entry.account ? `:${entry.account}` : ""}`,
            label: windowLabel(entry, name, prefix),
            account: entry.account ?? null,
            usedPercent: percent,
            value,
            resetAt: toIso(entry.resetAt),
        })
    })
    const errors = providerErrors(provider)
    if (!windows.length && !errors.length) return null
    return { id, name, status, errors, windows }
}

/** Export do plugin → DTO da UI: provedores `unavailable` (ou sem nada a mostrar) somem. */
export function normalizeQuotaExport(data: QuotaExport, checkedAt: Date): OpencodeQuotaDto {
    const providers = Object.entries(data.providers)
        .map(([id, provider]) => normalizeProvider(id, provider))
        .filter((provider): provider is QuotaProviderDto => provider !== null)
    return { state: "ok", message: null, exportedAt: toIso(data.exportedAt), checkedAt: checkedAt.toISOString(), providers }
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
 * O export do plugin grava só a verificação atual: um provedor que falhou sem linhas (ex.: 429 da
 * Anthropic) vem só com o erro. Como o TUI, mantém as janelas da última leitura boa desse provedor
 * como `partial`, com o erro atual de aviso. Só mescla com o arquivo lido (`state: "ok"`); provedor
 * que sumiu não volta e leitura com janelas substitui as antigas.
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

/**
 * Instante (s) da verificação mais recente do snapshot: o `show --json` data o documento com a hora
 * da leitura, então o "Desatualizado" passa a olhar o `fetchedAt` mais novo entre os provedores.
 */
export function snapshotFreshAt(data: QuotaExport): number | null {
    const times = Object.values(data.providers)
        .map((provider) => provider.fetchedAt)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    return times.length ? Math.max(...times) : null
}

/** O plugin não regrava o export (ou não verifica nenhum provedor) há mais de 30 min. */
export function isQuotaStale(exportedAt: string | null, now: number): boolean {
    if (!exportedAt) return false
    return now - new Date(exportedAt).getTime() > OPENCODE_QUOTA_STALE_MS
}

/** Assinatura do que a tela mostra (sem os instantes de leitura): muda → evento em tempo real. */
export function quotaHash(dto: OpencodeQuotaDto): string {
    return JSON.stringify([dto.state, dto.message, dto.providers])
}
