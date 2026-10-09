/**
 * Ponto de entrada do banco: conexão cacheada + migrações executadas uma única vez por
 * processo (idempotentes). Use sempre `dbConnect()` antes de usar os modelos.
 */

import { connectMongo } from "./connection"
import { runMigrations } from "./migrations"

let migrationsPromise: Promise<void> | null = null

export async function dbConnect() {
    const conn = await connectMongo()
    if (!migrationsPromise) {
        migrationsPromise = runMigrations().catch((error: unknown) => {
            migrationsPromise = null
            throw error
        })
    }
    await migrationsPromise
    return conn
}

export { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
export { createAuditContext, auditPlugin } from "./plugins/audit.plugin"
