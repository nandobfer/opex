/** Formatação da aba Controles — módulo puro. */

/** "3 d 4 h", "2 h 05 min", "12 min", "40 s". */
export function formatUptime(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—"
    const d = Math.floor(seconds / 86_400)
    const h = Math.floor((seconds % 86_400) / 3_600)
    const m = Math.floor((seconds % 3_600) / 60)
    if (d > 0) return `${d} d ${h} h`
    if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`
    if (m > 0) return `${m} min`
    return `${Math.floor(seconds)} s`
}

export const SERVICE_STATE_LABELS = {
    running: { label: "Em execução", variant: "success" },
    stopped: { label: "Parado", variant: "destructive" },
    unreachable: { label: "Sem resposta", variant: "warning" },
    unknown: { label: "Indisponível", variant: "outline" },
} as const
