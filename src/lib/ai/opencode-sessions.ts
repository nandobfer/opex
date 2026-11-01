import { isSessionNotFoundError } from "@opencode/client"
import type { OpencodeClient } from "./opencode-client"

/** Prazo de uma exclusão de sessão no OpenCode. */
export const OPENCODE_SESSION_DELETE_TIMEOUT_MS = 15_000

/**
 * Exclui uma sessão no OpenCode por id explícito (SOMENTE servidor). Idempotente: uma sessão já
 * inexistente conta como excluída (`true`). Qualquer outra falha só vira aviso no log (`false`), sem
 * lançar — quem chama decide se a pendência fica para a próxima tentativa. O aviso vai para o logger do
 * fluxo que chamou (`log`), com `tag` identificando o fluxo na mensagem.
 */
export interface SessionRemovalLogger {
    warn: (obj: Record<string, unknown>, msg: string) => void
}

export async function removeOpencodeSessionSafe(client: OpencodeClient, sessionId: string, log: SessionRemovalLogger, tag: string): Promise<boolean> {
    try {
        await client.session.remove({ sessionID: sessionId }, { signal: AbortSignal.timeout(OPENCODE_SESSION_DELETE_TIMEOUT_MS) })
        return true
    } catch (error) {
        if (isSessionNotFoundError(error)) return true
        log.warn({ err: error, sessionId }, `[${tag}] Falha ao excluir a sessão do OpenCode`)
        return false
    }
}
