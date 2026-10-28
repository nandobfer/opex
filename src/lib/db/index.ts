/**
 * Ponto de entrada do banco: conexão cacheada + migrações executadas uma única vez por
 * processo (idempotentes). Use sempre `dbConnect()` antes de usar os modelos.
 */

import { connectMongo } from "./connection"

let migrationsPromise: Promise<void> | null = null

export async function dbConnect() {
    const conn = await connectMongo()
    if (!migrationsPromise) {
        // Import dinâmico de propósito: o registry carrega todas as migrações (e os modelos que
        // elas importam), o que só é necessário quando alguém realmente conecta. Assim os testes
        // que mockam `@/lib/db` não pagam esse grafo de módulos.
        migrationsPromise = import("./migrations")
            .then(({ runMigrations }) => runMigrations())
            .catch((error: unknown) => {
                migrationsPromise = null
                throw error
            })
    }
    await migrationsPromise
    return conn
}

export { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
export { createAuditContext, auditPlugin } from "./plugins/audit.plugin"
