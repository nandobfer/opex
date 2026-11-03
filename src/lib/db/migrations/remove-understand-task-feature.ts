import { AiFeatureSetting, AiUsageLog } from "@/lib/db/models/Ai"
import { AiConsumption } from "@/lib/db/models/AiConsumption"
import { logger } from "@/lib/logger"

/** Id da feature "Entender tarefas", removida na OPE-122. */
export const REMOVED_UNDERSTAND_TASK_FEATURE = "understand-task"

/**
 * Remove o que sobrou da feature "Entender tarefas" (OPE-122): a configuração gravada e o histórico
 * de uso e consumo de IA dela (os totais de consumo deixam de contá-lo). A auditoria fica.
 *
 * Idempotente: os filtros são exatos pelo id da feature, então rodar de novo não apaga nada e não
 * toca registros de outras features.
 */
export async function removeUnderstandTaskFeature(): Promise<void> {
    const [settings, usage, consumption] = await Promise.all([
        AiFeatureSetting.deleteOne({ feature: REMOVED_UNDERSTAND_TASK_FEATURE }),
        AiUsageLog.deleteMany({ feature: REMOVED_UNDERSTAND_TASK_FEATURE }),
        AiConsumption.deleteMany({ origin: REMOVED_UNDERSTAND_TASK_FEATURE }),
    ])
    const removed = settings.deletedCount + usage.deletedCount + consumption.deletedCount
    if (removed) logger.warn({ settings: settings.deletedCount, usage: usage.deletedCount, consumption: consumption.deletedCount }, '[migration] Dados de "Entender tarefas" removidos')
}
