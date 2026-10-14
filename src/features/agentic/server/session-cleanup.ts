import { isSessionNotFoundError } from "@opencode/client"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { dbConnect } from "@/lib/db"
import { AgenticWorkbench, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { logger } from "@/lib/logger"

/**
 * Exclusão das sessões do OpenCode das mesas concluídas (OPE-46). Ao concluir a mesa, a sessão é
 * desvinculada (`sessionId = null`) e registrada em `pendingSessionDeletions`; a exclusão é tentada
 * em seguida e, se falhar (OpenCode fora do ar, etc.), fica pendente e é retomada pela rotina
 * `agentic-queue-pump`. O histórico da mesa no Opex (planos, saída, PR, uso) nunca é apagado.
 *
 * A exclusão é idempotente e sempre por id explícito: uma sessão já inexistente conta como excluída,
 * e a retomada de uma pendência antiga nunca toca a sessão nova criada ao reabrir a mesa.
 */

const DELETE_TIMEOUT_MS = 15_000

/** Exclui uma sessão no OpenCode; `true` quando ela já não existe (idempotente). */
async function removeSession(client: OpencodeClient, sessionId: string): Promise<boolean> {
    try {
        await client.session.remove({ sessionID: sessionId }, { signal: AbortSignal.timeout(DELETE_TIMEOUT_MS) })
        return true
    } catch (error) {
        if (isSessionNotFoundError(error)) return true
        logger.warn({ err: error, sessionId }, "[agentic-session] Falha ao excluir a sessão do OpenCode")
        return false
    }
}

/**
 * Tenta excluir agora uma sessão recém-desvinculada e, só em caso de sucesso, a remove da lista de
 * pendências. `false` = ficou pendente para a retomada pela rotina.
 */
export async function deleteWorkbenchSession(workbenchId: string, sessionId: string): Promise<boolean> {
    let client: OpencodeClient
    try {
        client = await getOpencodeClient()
    } catch (error) {
        logger.warn({ err: error, workbenchId, sessionId }, "[agentic-session] OpenCode indisponível para excluir a sessão; ficou pendente")
        return false
    }
    if (!(await removeSession(client, sessionId))) return false
    await AgenticWorkbench.updateOne({ _id: workbenchId }, { $pull: { pendingSessionDeletions: sessionId } })
    return true
}

/**
 * Melhor esforço: exclui as sessões já pendentes antes de a mesa ser apagada (não lança). Devolve
 * `true` quando nenhuma pendência sobrou (todas excluídas ou já inexistentes); `false` quando alguma
 * ficou pendente (ex.: OpenCode indisponível) — nesse caso a referência NÃO pode ser descartada.
 */
export async function flushPendingSessionDeletions(workbench: Pick<IAgenticWorkbench, "_id" | "pendingSessionDeletions">): Promise<boolean> {
    const ids = [...new Set(workbench.pendingSessionDeletions ?? [])].filter((id) => typeof id === "string" && id)
    if (!ids.length) return true
    let client: OpencodeClient
    try {
        client = await getOpencodeClient()
    } catch {
        return false
    }
    let allRemoved = true
    for (const sessionId of ids) {
        if (!(await removeSession(client, sessionId))) {
            allRemoved = false
            continue
        }
        await AgenticWorkbench.updateOne({ _id: workbench._id }, { $pull: { pendingSessionDeletions: sessionId } })
    }
    return allRemoved
}

let running = false

/**
 * Retoma as exclusões pendentes (rotina `agentic-queue-pump`). Processa em lote, isolando a falha de
 * uma sessão das demais, e nunca lança: um OpenCode indisponível só mantém as pendências. Devolve
 * quantas sessões foram excluídas.
 */
export async function processPendingSessionDeletions(limit = 20): Promise<number> {
    if (running) return 0
    running = true
    try {
        await dbConnect()
        const docs = await AgenticWorkbench.find({ pendingSessionDeletions: { $exists: true, $ne: [] } })
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
                    logger.warn({ err: error }, "[agentic-session] OpenCode indisponível para retomar as exclusões pendentes")
                    return removed
                }
            }
            for (const sessionId of ids) {
                if (!(await removeSession(client, sessionId))) continue
                await AgenticWorkbench.updateOne({ _id: doc._id }, { $pull: { pendingSessionDeletions: sessionId } })
                removed++
            }
        }
        return removed
    } catch (error) {
        logger.error({ err: error }, "[agentic-session] Falha ao retomar as exclusões pendentes")
        return 0
    } finally {
        running = false
    }
}
