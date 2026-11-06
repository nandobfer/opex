import { format, formatDistanceToNowStrict } from "date-fns"
import { ptBR } from "date-fns/locale"

/** Formatação das telas dos agentes rotineiros (OPE-130, módulo PURO). */

export function formatDuration(ms: number | null | undefined): string {
    if (!ms || ms <= 0) return "—"
    const seconds = Math.round(ms / 1000)
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min ${seconds % 60 ? `${seconds % 60} s` : ""}`.trim()
    const hours = Math.floor(minutes / 60)
    return `${hours} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim()
}

export const formatDateTime = (iso: string | null | undefined) => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—")
export const formatTime = (iso: string) => format(new Date(iso), "HH:mm", { locale: ptBR })
export const formatRelative = (iso: string | null | undefined) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: ptBR }) : "—")

/** Custo com marcação de parcial (provedor sem custo informado). */
export function formatCost(costUsd: number | null, partial: boolean): string {
    if (costUsd === null) return "—"
    const value = `US$ ${costUsd.toFixed(costUsd < 1 ? 4 : 2)}`
    return partial ? `${value} (parcial)` : value
}

export function formatTokens(tokens: number): string {
    if (tokens < 1000) return String(tokens)
    const units = [
        { value: 1e9, suffix: "B" },
        { value: 1e6, suffix: "M" },
        { value: 1e3, suffix: "k" },
    ]
    const unit = units.find((item) => tokens >= item.value)!
    return `${Number((tokens / unit.value).toFixed(3)).toLocaleString("pt-BR")}${unit.suffix}`
}
