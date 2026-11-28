import { BOOTSTRAP_STALE_MS } from "./constants"

/**
 * Liveness do bootstrap em andamento (módulo puro). O trabalho vive em memória num processo; quem
 * decide se ele se perdeu é o batimento gravado no banco, nunca o mapa em memória. Conta-se a partir do
 * mais recente entre o batimento e o início do estado atual, para um batimento antigo não derrubar uma
 * retomada recém-gravada.
 */
export function isBootstrapStale(doc: { status: string; heartbeatAt: Date | string | null; stateAt: Date | string | null }, now = Date.now()): boolean {
    if (doc.status !== "running") return false
    const times = [doc.heartbeatAt, doc.stateAt].filter((value): value is Date | string => Boolean(value)).map((value) => new Date(value).getTime())
    const last = times.length ? Math.max(...times) : 0
    return now - last > BOOTSTRAP_STALE_MS
}
