/** Regras puras do batimento das instâncias (OPE-147): ver `server/heartbeat.ts`. */

export const HEARTBEAT_INTERVAL_MS = 15_000
export const HEARTBEAT_STALE_MS = 90_000

/** Sem batimento (nem a data de início, para registros antigos) há mais de 90 s? */
export function isBeatStale(last: Date | string | null | undefined, now: Date): boolean {
    if (!last) return true
    return now.getTime() - new Date(last).getTime() > HEARTBEAT_STALE_MS
}
