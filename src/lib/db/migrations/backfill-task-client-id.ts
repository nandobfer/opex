import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoDraft } from "@/lib/db/models/Orcamento"
import { logger } from "@/lib/logger"

/**
 * Preenche o `clientId` das tarefas criadas pelo portal **antes da OPE-28**: cada rascunho aprovado
 * conhece o cliente que o pediu (`clientId`) e a tarefa criada (`taskId`), mas a tarefa ainda não
 * guardava o cliente. Sem isso, a lista do portal (que passou a filtrar por `clientId`) não mostraria
 * as tarefas pedidas anteriormente.
 *
 * Idempotente: só marca as tarefas que ainda estão sem `clientId`.
 */
export async function backfillTaskClientId(): Promise<void> {
    const drafts = await OrcamentoDraft.find({ status: "approved", taskId: { $ne: null } })
        .select({ clientId: 1, taskId: 1 })
        .lean()
    let updated = 0
    for (const draft of drafts) {
        if (!draft.taskId) continue
        const result = await DevTask.updateOne({ _id: draft.taskId, clientId: null }, { $set: { clientId: draft.clientId } })
        updated += result.modifiedCount ?? 0
    }
    if (updated) logger.warn({ updated }, "[migration] clientId das tarefas do portal preenchido")
}
