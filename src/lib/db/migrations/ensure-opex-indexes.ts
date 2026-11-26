import { OpexFile, OpexJob, OpexMcpServer, OpexMessage, OpexPendingAction, OpexSession, OpexSkill, OpexWatch, OpexWatchFact } from "@/lib/db/models/Opex"

/** Índices das coleções do Agente Opex (models carregados antes da conexão podem não receber autoIndex). Idempotente. */
export async function ensureOpexIndexes(): Promise<void> {
    await Promise.all([OpexSession.createIndexes(), OpexMessage.createIndexes(), OpexPendingAction.createIndexes(), OpexFile.createIndexes(), OpexJob.createIndexes(), OpexWatch.createIndexes(), OpexWatchFact.createIndexes(), OpexMcpServer.createIndexes(), OpexSkill.createIndexes()])
}
