/**
 * Barra de progresso da gaveta de deploy (OPE-202). Módulo puro: o % é o tempo decorrido sobre a
 * duração estimada (não é consumo) e nunca chega a 100% sozinho — só o status final fecha a barra.
 */

/** Teto do % quando o deploy passa do previsto. */
export const DEPLOY_PROGRESS_CAP = 99

export const DEPLOY_PROGRESS_ARIA_LABEL = "Progresso estimado do deploy: tempo decorrido sobre a duração prevista"

/** `mm:ss`, ou `h:mm:ss` a partir de 1 h; negativo vira `00:00`. */
export function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = String(total % 60).padStart(2, "0")
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${String(minutes).padStart(2, "0")}:${seconds}`
}

export interface DeployProgressInput {
    startedAt: string
    estimateMs: number | null
    initial: boolean
    now: number
}

export interface DeployProgressView {
    elapsedMs: number
    /** `null`: sem estimativa (barra indeterminada). */
    percent: number | null
    overdue: boolean
    detail: string
    ariaValueText: string
}

/** Decorrido = agora − início (nunca acumulado por tick). */
export function deployProgress({ startedAt, estimateMs, initial, now }: DeployProgressInput): DeployProgressView {
    const elapsedMs = Math.max(0, now - new Date(startedAt).getTime())
    const elapsed = formatElapsed(elapsedMs)
    if (estimateMs === null || estimateMs <= 0) {
        return { elapsedMs, percent: null, overdue: false, detail: `há ${elapsed}`, ariaValueText: `${elapsed} decorridos, sem estimativa de duração` }
    }
    const suffix = initial ? " (estimativa inicial)" : ""
    if (elapsedMs >= estimateMs) {
        return {
            elapsedMs,
            percent: DEPLOY_PROGRESS_CAP,
            overdue: true,
            detail: `há ${elapsed} · mais que o previsto (~${formatElapsed(estimateMs)})${suffix}`,
            ariaValueText: `${elapsed} decorridos, mais que o previsto de ~${formatElapsed(estimateMs)}`,
        }
    }
    const remaining = formatElapsed(estimateMs - elapsedMs)
    return {
        elapsedMs,
        percent: Math.min(DEPLOY_PROGRESS_CAP, (elapsedMs / estimateMs) * 100),
        overdue: false,
        detail: `há ${elapsed} · restam ~${remaining}${suffix}`,
        ariaValueText: `${elapsed} decorridos, restam cerca de ${remaining}`,
    }
}
