import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { removeOpencodeSessionSafe } from "@/lib/ai/opencode-sessions"
import { dbConnect } from "@/lib/db"
import { TaskRefinement } from "@/lib/db/models/Refinement"
import { loggerFor } from "@/lib/logger"

/**
 * Exclusão das sessões do OpenCode dos refinamentos concluídos. Ao concluir, a sessão é desvinculada
 * (`sessionId = null`) e registrada em `pendingSessionDeletions`; a exclusão é tentada em seguida e, se
 * falhar (OpenCode fora do ar etc.), fica pendente e é retomada pela rotina `agentic-queue-pump`.
 * O histórico do refinamento no Opex (especificação, saída, uso) nunca é apagado.
 *
 * A exclusão é idempotente e sempre por id explícito: uma sessão já inexistente conta como excluída, e
 * a retomada de uma pendência antiga nunca toca a sessão nova criada ao recomeçar o refinamento.
 */

const log = loggerFor({ module: "refinement-session" })
/** Exclui uma sessão no OpenCode; `true` quando ela já não existe (idempotente). */
const removeSession = (client: OpencodeClient, sessionId: string) => removeOpencodeSessionSafe(client, sessionId, log, "refinement-session")

/**
 * Tenta excluir agora uma sessão recém-desvinculada e, só em caso de sucesso, a remove da lista de
 * pendências. `false` = ficou pendente para a retomada pela rotina.
 */
export async function deleteRefinementSession(refinementId: string, sessionId: string): Promise<boolean> {
    let client: OpencodeClient
    try {
        client = await getOpencodeClient()
    } catch (error) {
        log.warn({ err: error, refinementId, sessionId }, "[refinement-session] OpenCode indisponível para excluir a sessão; ficou pendente")
        return false
    }
    if (!(await removeSession(client, sessionId))) return false
    await TaskRefinement.updateOne({ _id: refinementId }, { $pull: { pendingSessionDeletions: sessionId } })
    return true
}

/**
 * Melhor esforço: exclui as sessões pendentes antes de o refinamento ser apagado/recomeçado. Devolve os
 * ids que continuaram pendentes (para serem levados ao novo refinamento). Nunca lança.
 */
export async function flushRefinementSessionDeletions(refinementId: string, pending: string[]): Promise<string[]> {
    const ids = [...new Set(pending ?? [])].filter((id) => typeof id === "string" && id)
    if (!ids.length) return []
    let client: OpencodeClient
    try {
        client = await getOpencodeClient()
    } catch {
        return ids
    }
    const remaining: string[] = []
    for (const sessionId of ids) {
        if (!(await removeSession(client, sessionId))) {
            remaining.push(sessionId)
            continue
        }
        await TaskRefinement.updateOne({ _id: refinementId }, { $pull: { pendingSessionDeletions: sessionId } }).catch(() => undefined)
    }
    return remaining
}

let running = false

/**
 * Retoma as exclusões pendentes (rotina `agentic-queue-pump`). Processa em lote, isolando a falha de
 * uma sessão das demais, e nunca lança: um OpenCode indisponível só mantém as pendências. Devolve
 * quantas sessões foram excluídas.
 */
export async function processPendingRefinementSessionDeletions(limit = 20): Promise<number> {
    if (running) return 0
    running = true
    try {
        await dbConnect()
        const docs = await TaskRefinement.find({ pendingSessionDeletions: { $exists: true, $ne: [] } })
            .select({ _id: 1, pendingSessionDeletions: 1 })
            .limit(limit)
            .lean()
        let client: OpencodeClient | null = null
        let removed = 0
        for (const doc of docs) {
            const ids = [...new Set(doc.pendingSessionDeletions ?? [])].filter((id) => typeof id === "string" && id)
            if (!ids.length) continue
            if (!client) {
                try {
                    client = await getOpencodeClient()
                } catch (error) {
                    log.warn({ err: error }, "[refinement-session] OpenCode indisponível para retomar as exclusões pendentes")
                    return removed
                }
            }
            for (const sessionId of ids) {
                if (!(await removeSession(client, sessionId))) continue
                await TaskRefinement.updateOne({ _id: doc._id }, { $pull: { pendingSessionDeletions: sessionId } })
                removed++
            }
        }
        return removed
    } catch (error) {
        log.error({ err: error }, "[refinement-session] Falha ao retomar as exclusões pendentes")
        return 0
    } finally {
        running = false
    }
}
