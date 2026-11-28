import { AiUsageLog } from "@nandobfer/integracoes/modules/integrations/ia/models/AiUsageLog"

/** Models carregados antes da conexão podem não receber autoIndex. Idempotente em cada boot. */
export async function ensureAiUsageIndexes(): Promise<void> {
    await AiUsageLog.createIndexes()
}
