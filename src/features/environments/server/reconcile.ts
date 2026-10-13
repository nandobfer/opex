import { dbConnect } from "@/lib/db"
import { EnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { logger } from "@/lib/logger"
import { publishOperationEvent } from "./realtime"
import { pumpEnvironmentQueue } from "./deploy"

/**
 * Reconciliação das operações do módulo Ambientes no **agendador interno** (Crons): operações
 * `running` com lease vencido (app reiniciou no meio) viram `failed` com aviso, sem repetir build/up
 * às cegas; em seguida reavalia a fila local. Idempotente e nunca lança.
 */

export async function reconcileEnvironmentOperations(): Promise<void> {
    try {
        await dbConnect()
        const stale = await EnvironmentOperation.find({ status: "running", "lease.expiresAt": { $lt: new Date() } })
        for (const operation of stale) {
            operation.status = "failed"
            operation.message = "Operação interrompida (o app reiniciou). Inicie de novo."
            operation.finishedAt = new Date()
            operation.lease = null
            for (const step of operation.steps) if (step.status === "running") step.status = "failed"
            await operation.save()
            await publishOperationEvent(operation.toObject())
            logger.warn({ operationId: String(operation._id) }, "[environments] Operação órfã reconciliada")
        }
    } catch (error) {
        logger.warn({ err: error }, "[environments] Falha na reconciliação das operações")
    }
    await pumpEnvironmentQueue()
}
