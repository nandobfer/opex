import { format, formatDistanceToNowStrict } from "date-fns"
import { ptBR } from "date-fns/locale"

/** Data e hora pt-BR (vazio → "—"). */
export function formatDateTime(value: string | null | undefined): string {
    if (!value) return "—"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })
}

export function formatRelative(value: string | null | undefined): string {
    if (!value) return "nunca"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : `há ${formatDistanceToNowStrict(date, { locale: ptBR })}`
}

export function formatBytes(bytes: number | null | undefined): string {
    if (typeof bytes !== "number") return "—"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
    return `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`
}

export function formatDuration(seconds: number | null | undefined): string {
    if (typeof seconds !== "number") return "—"
    if (seconds < 60) return `${Math.round(seconds)} s`
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`
    if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`
    return `${Math.round(seconds / 86_400)} d`
}

/** Valor de configuração legível (listas e objetos em JSON curto). */
export function formatSettingValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—"
    if (typeof value === "boolean") return value ? "Sim" : "Não"
    if (typeof value === "number") return value.toLocaleString("pt-BR")
    if (typeof value === "string") return value
    if (Array.isArray(value)) return value.length === 0 ? "(vazia)" : value.map((item) => (typeof item === "object" ? (item as { key?: string }).key ?? JSON.stringify(item) : String(item))).join(", ")
    return JSON.stringify(value)
}
