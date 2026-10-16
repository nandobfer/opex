import { isSessionNotFoundError } from "@opencode/client"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { dbConnect } from "@/lib/db"
import { PrReview } from "@/lib/db/models/PrReview"
import { loggerFor } from "@/lib/logger"

/**
 * Exclusão das sessões do OpenCode das revisões encerradas (mesmo padrão do refinamento): a sessão é
 * desvinculada e registrada em `pendingSessionDeletions`; a exclusão é tentada na hora e, se falhar,
 * retomada pela rotina `agentic-queue-pump`. Sessão já inexistente conta como excluída.
 */

const log = loggerFor({ module: "pr-review-session" })
const DELETE_TIMEOUT_MS = 15_000

async function removeSession(client: OpencodeClient, sessionId: string): Promise<boolean> {
    try {
        await client.session.remove({ sessionID: sessionId }, { signal: AbortSignal.timeout(DELETE_TIMEOUT_MS) })
        return true
    } catch (error) {
        if (isSessionNotFoundError(error)) return true
        log.warn({ err: error, sessionId }, "[pr-review-session] Falha ao excluir a sessão do OpenCode")
        return false
    }
}

/** Desvincula e tenta excluir a sessão da revisão; `false` = ficou pendente. Nunca lança. */
export async function finishReviewSession(reviewId: string, sessionId: string): Promise<boolean> {
    try {
        await PrReview.updateOne({ _id: reviewId }, { $set: { sessionId: null }, $addToSet: { pendingSessionDeletions: sessionId } })
        const client = await getOpencodeClient()
        if (!(await removeSession(client, sessionId))) return false
        await PrReview.updateOne({ _id: reviewId }, { $pull: { pendingSessionDeletions: sessionId } })
        return true
    } catch (error) {
        log.warn({ err: error, reviewId, sessionId }, "[pr-review-session] Sessão pendente de exclusão")
        return false
    }
}

let running = false

/** Retoma as exclusões pendentes (rotina `agentic-queue-pump`). Devolve quantas foram excluídas. */
export async function processPendingReviewSessionDeletions(limit = 20): Promise<number> {
    if (running) return 0
    running = true
    try {
        await dbConnect()
        const docs = await PrReview.find({ pendingSessionDeletions: { $exists: true, $ne: [] } })
            .select({ _id: 1, pendingSessionDeletions: 1 })
            .limit(limit)
            .lean()
        if (!docs.length) return 0
        let client: OpencodeClient
        try {
            client = await getOpencodeClient()
        } catch {
            return 0
        }
        let removed = 0
        for (const doc of docs) {
            for (const sessionId of new Set(doc.pendingSessionDeletions ?? [])) {
                if (!sessionId || !(await removeSession(client, sessionId))) continue
                await PrReview.updateOne({ _id: doc._id }, { $pull: { pendingSessionDeletions: sessionId } })
                removed++
            }
        }
        return removed
    } catch (error) {
        log.error({ err: error }, "[pr-review-session] Falha ao retomar as exclusões pendentes")
        return 0
    } finally {
        running = false
    }
}
