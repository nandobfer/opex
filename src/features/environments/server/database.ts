import mongoose from "mongoose"
import { normalizeDbVersion } from "../logic"
import { DB_SCHEMA_COLLECTION, DB_SCHEMA_DOC_ID } from "../constants"
import { logger } from "@/lib/logger"

/**
 * Versão atual do banco do ambiente: o Opex conecta pela **connection string** do ambiente (override
 * cifrado) ou a padrão do repositório e lê a coleção **`_opex_schema`** (documento `_id: "schema"`,
 * campo `version`). Conexão separada, sem tocar na conexão global do Opex. `null` = desconhecida.
 */

export const DB_VERSION_TIMEOUT_MS = 8_000

interface OpexSchemaDoc {
    _id: string
    version?: unknown
}

export async function readDatabaseVersion(connectionString: string | null): Promise<string | null> {
    if (!connectionString) return null
    let conn: mongoose.Connection | null = null
    try {
        conn = mongoose.createConnection(connectionString, { serverSelectionTimeoutMS: DB_VERSION_TIMEOUT_MS })
        await conn.asPromise()
        if (!conn.db) return null
        const doc = await conn.db.collection<OpexSchemaDoc>(DB_SCHEMA_COLLECTION).findOne({ _id: DB_SCHEMA_DOC_ID })
        return normalizeDbVersion(doc?.version)
    } catch (error) {
        logger.warn({ err: error instanceof Error ? error.message : error }, "[environments] Falha ao ler a versão do banco do ambiente")
        return null
    } finally {
        if (conn) await conn.close().catch(() => undefined)
    }
}
