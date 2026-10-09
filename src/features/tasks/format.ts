import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

/** Minutos → "3h 20min" / "45min" / "0min". */
export function formatMinutes(minutes: number | null | undefined): string {
    const total = Math.max(0, Math.round(minutes ?? 0))
    const hours = Math.floor(total / 60)
    const rest = total % 60
    if (hours === 0) return `${rest}min`
    return rest ? `${hours}h ${rest}min` : `${hours}h`
}

export function formatDateTime(iso: string | null | undefined): string {
    return iso ? format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "—"
}

export function formatDate(iso: string | null | undefined): string {
    return iso ? format(new Date(iso), "dd/MM/yyyy", { locale: ptBR }) : "—"
}
