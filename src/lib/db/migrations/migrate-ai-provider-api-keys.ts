import { Integration } from "@/lib/db/models/Integration"
import { isEncryptedSecret } from "@/lib/crypto/secretBox"
import { KEY_RING_INTEGRATION_IDS, newApiKeyId } from "@/lib/integrations/key-ring"
import { invalidateStoredIntegrations } from "@/lib/integrations/store"
import { logger } from "@/lib/logger"

/**
 * OPE-155: a API key única dos provedores de IA (`secretValues.apiKey`) vira a primeira chave nomeada
 * do chaveiro ("Chave principal"), já ativa. A caixa cifrada é reaproveitada, sem decifrar.
 *
 * Só COPIA: o `secretValues.apiKey` legado fica intacto (e ignorado pelo código novo), porque as
 * prévias usam o mesmo banco da produção — apagá-lo derrubaria a chave da produção antiga enquanto a
 * prévia estivesse no ar. Idempotente: só toca o documento que ainda não tem chaveiro.
 */

export const MIGRATED_API_KEY_NAME = "Chave principal"

export async function migrateAiProviderApiKeys(): Promise<void> {
    let migrated = 0
    for (const integrationId of KEY_RING_INTEGRATION_IDS) {
        const doc = (await Integration.findOne({ integrationId }).lean()) as { secretValues?: Record<string, unknown>; apiKeys?: unknown[]; updatedAt?: Date; updatedBy?: string } | null
        const legacy = doc?.secretValues?.apiKey
        if (!doc || doc.apiKeys !== undefined || !isEncryptedSecret(legacy)) continue
        const id = newApiKeyId()
        const at = doc.updatedAt ? new Date(doc.updatedAt) : new Date()
        const result = await Integration.updateOne(
            { integrationId, apiKeys: { $exists: false } },
            { $set: { apiKeys: [{ id, name: MIGRATED_API_KEY_NAME, secret: legacy, createdAt: at, updatedAt: at, createdBy: doc.updatedBy ?? "local" }], activeApiKeyId: id } },
        )
        if (result.modifiedCount > 0) migrated++
    }
    if (migrated > 0) {
        invalidateStoredIntegrations()
        logger.warn({ migrated }, "[migration] API keys dos provedores de IA viraram a primeira chave nomeada do chaveiro")
    }
}
