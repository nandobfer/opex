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

/** Espera entre as tentativas de leitura da sessão quando o OpenCode não responde. */
export const OPENCODE_SESSION_LOOKUP_DELAYS_MS: readonly number[] = [1_000, 3_000]

/** O OpenCode não respondeu (rede, DNS, transporte): a sessão gravada pode continuar existindo. */
export class OpencodeUnavailableError extends Error {
    constructor(cause: unknown) {
        const detail = cause instanceof Error ? cause.message : String(cause)
        super(`OpenCode inacessível: não foi possível confirmar a sessão da conversa (${detail}). A sessão foi mantida; use Tentar novamente quando o OpenCode voltar.`)
        this.name = "OpencodeUnavailableError"
    }
}

/** A leitura foi cancelada (o usuário interrompeu a etapa durante as tentativas): não é falha do OpenCode. */
export class OpencodeLookupAbortedError extends Error {
    constructor() {
        super("Interrompido antes de confirmar a sessão do OpenCode")
        this.name = "OpencodeLookupAbortedError"
    }
}

export type OpencodeSessionLookup<T> = { status: "found"; info: T } | { status: "missing" }

function wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0 || signal?.aborted) return Promise.resolve()
    return new Promise((resolve) => {
        const timer = setTimeout(done, ms)
        function done() {
            clearTimeout(timer)
            signal?.removeEventListener("abort", done)
            resolve()
        }
        signal?.addEventListener("abort", done, { once: true })
    })
}

/**
 * Lê uma sessão do OpenCode distinguindo "não existe" de "não respondeu" (OPE-178). Só a resposta
 * "sessão não encontrada" do OpenCode conta como `missing`; erro de rede/transporte é repetido com espera
 * (`delaysMs`) e, persistindo, lança `OpencodeUnavailableError` — quem chama NUNCA deve criar outra
 * sessão nesse caso, porque a gravada (com o histórico) pode continuar viva.
 */
export async function lookupOpencodeSession<T>(
    client: { session: { get: (input: { sessionID: string }) => Promise<T> } },
    sessionId: string,
    options: { delaysMs?: readonly number[]; signal?: AbortSignal } = {},
): Promise<OpencodeSessionLookup<T>> {
    const delays = options.delaysMs ?? OPENCODE_SESSION_LOOKUP_DELAYS_MS
    let lastError: unknown = null
    for (let attempt = 0; attempt <= delays.length; attempt++) {
        if (attempt > 0) await wait(delays[attempt - 1] ?? 0, options.signal)
        if (options.signal?.aborted) throw new OpencodeLookupAbortedError()
        try {
            const info = await client.session.get({ sessionID: sessionId })
            return info ? { status: "found", info } : { status: "missing" }
        } catch (error) {
            if (isSessionNotFoundError(error)) return { status: "missing" }
            lastError = error
        }
    }
    throw new OpencodeUnavailableError(lastError)
}
