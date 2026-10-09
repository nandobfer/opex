import { format } from "date-fns"

/** Utilitários de tempo do controle de horas. Módulo puro. */

/** Segundos decorridos → "01:23:45". */
export function formatClock(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds))
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":")
}

export function elapsedSeconds(startIso: string, now: number = Date.now()): number {
    return (now - new Date(startIso).getTime()) / 1000
}

/** Minutos entre dois instantes (arredondado, mínimo 0). */
export function minutesBetween(startIso: string, endIso: string): number {
    return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000))
}

/** ISO → valor de `<input type="datetime-local">` no fuso do navegador. */
export function toLocalInput(iso: string | Date): string {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}

/** Valor de `datetime-local` → ISO. */
export function fromLocalInput(value: string): string {
    return new Date(value).toISOString()
}
