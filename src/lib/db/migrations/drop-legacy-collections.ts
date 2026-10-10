import mongoose from "mongoose"
import { logger } from "@/lib/logger"

/**
 * Remove as coleções da era Go! Sipal. O Opex passou a ser a **fonte de verdade** das tarefas
 * (colunas configuráveis, projetos, tarefas e horas locais), então snapshots do quadro, estados
 * locais, pessoas do GitHub e rascunhos de tarefa não existem mais.
 *
 * Idempotente: coleção inexistente é ignorada (NamespaceNotFound).
 */

const LEGACY_COLLECTIONS = ["go_sipal_task_snapshots", "task_local_states", "github_people", "task_drafts"] as const

export async function dropLegacyCollections(): Promise<void> {
    const db = mongoose.connection.db
    if (!db) return
    const dropped: string[] = []
    for (const name of LEGACY_COLLECTIONS) {
        try {
            await db.dropCollection(name)
            dropped.push(name)
        } catch (error) {
            if ((error as { codeName?: string }).codeName === "NamespaceNotFound") continue
            logger.warn({ err: error, collection: name }, "[migration] Não foi possível remover a coleção legada")
        }
    }
    if (dropped.length) logger.warn({ dropped }, "[migration] Coleções legadas do Go! Sipal removidas")
}
