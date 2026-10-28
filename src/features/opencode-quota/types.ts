/**
 * Quota do OpenCode normalizada para a UI (independente do formato do plugin).
 * - `ok`: export lido (pode não ter provedores com dados);
 * - `missing`: o arquivo de export não existe (export desligado no plugin);
 * - `unconfigured`: integração OpenCode sem URL do servidor;
 * - `error`: falha ao ler ou interpretar o export.
 */
export type OpencodeQuotaState = "ok" | "missing" | "unconfigured" | "error"

export type QuotaProviderStatus = "ok" | "partial" | "error"

export interface QuotaWindowDto {
    id: string
    label: string
    account: string | null
    /** Percentual usado (0–100); `null` em linhas de valor (ex.: saldo). */
    usedPercent: number | null
    /** Texto da linha de valor (ex.: "$12.50 left"). */
    value: string | null
    /** Reset em ISO; `null` quando o provedor não informa. */
    resetAt: string | null
}

export interface QuotaProviderDto {
    id: string
    name: string
    status: QuotaProviderStatus
    errors: string[]
    windows: QuotaWindowDto[]
}

export interface OpencodeQuotaDto {
    state: OpencodeQuotaState
    message: string | null
    /** Quando o plugin gravou o export (ISO). */
    exportedAt: string | null
    /** Quando o Opex leu o export (ISO). */
    checkedAt: string
    providers: QuotaProviderDto[]
}

export type QuotaLevel = "ok" | "warning" | "critical"
