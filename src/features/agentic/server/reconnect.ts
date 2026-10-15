import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { probeAttachSession } from "@/lib/ai/opencode-run"
import type { ReconnectOutcome } from "../reconnect"

/**
 * Confere o estado da sessão do OpenCode antes de reconectar (mesa e refinamento) e traduz para o
 * desfecho estável do ciclo automático. Separar isso do acompanhamento em segundo plano deixa o
 * servidor responder na hora se há (ou não) execução para acompanhar, sem depender do texto da
 * mensagem.
 */

export const RECONNECT_MISSING_SESSION_MESSAGE = "A sessão do OpenCode não existe mais; reconectar não é possível (use Tentar novamente)"
export const RECONNECT_NOTHING_MESSAGE = "Não há execução em andamento nesta sessão do OpenCode"

export interface ReconnectProbe {
    /** Desfecho para o cliente: `attached`, `recovered`, `nothing` ou `transient`. */
    outcome: ReconnectOutcome
    /** Deve acompanhar a execução em segundo plano (attach)? */
    follow: boolean
    /** Motivo (pt-BR) quando não há o que acompanhar. */
    message: string | null
}

/** Estado da sessão antes de reconectar: define o desfecho e se o servidor deve acompanhar o turno. */
export async function probeReconnect(sessionId: string, startedAt: number): Promise<ReconnectProbe> {
    let probe: Awaited<ReturnType<typeof probeAttachSession>>
    try {
        probe = await probeAttachSession(await getOpencodeClient(), sessionId, startedAt)
    } catch {
        // OpenCode indisponível no momento: falha transitória (o ciclo tenta de novo).
        return { outcome: "transient", follow: false, message: null }
    }
    switch (probe.kind) {
        case "unavailable":
            return { outcome: "transient", follow: false, message: null }
        case "missing-session":
            return { outcome: "nothing", follow: false, message: RECONNECT_MISSING_SESSION_MESSAGE }
        case "idle":
            return { outcome: "nothing", follow: false, message: RECONNECT_NOTHING_MESSAGE }
        case "running":
            return { outcome: "attached", follow: true, message: null }
        case "finished":
            return { outcome: "recovered", follow: true, message: null }
    }
}
