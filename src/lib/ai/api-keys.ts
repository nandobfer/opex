import { decryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import { activeApiKeyOf } from "@/lib/integrations/config"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { loadStoredIntegration } from "@/lib/integrations/store"
import { AiProviderError } from "./errors"

/**
 * Chave de API **ativa** de um provedor de IA (SOMENTE servidor, OPE-155). Os clientes dos provedores
 * usam o segredo na chamada e o `id` para atribuir o consumo à chave (`apiKeyId` dos logs de uso).
 */
export interface ActiveAiProviderKey {
    id: string
    name: string
    apiKey: string
}

export async function getActiveAiProviderKey(integrationId: IntegrationId): Promise<ActiveAiProviderKey | null> {
    const active = activeApiKeyOf(await loadStoredIntegration(integrationId))
    if (!active || !isEncryptedSecret(active.secret)) return null
    let apiKey: string
    try {
        apiKey = decryptSecret(active.secret)
    } catch {
        return null
    }
    return apiKey.trim() ? { id: active.id, name: active.name, apiKey } : null
}

/** Uma chave do chaveiro pelo id (em uso ou não), decifrada só no servidor; `null` se não existe ou não decifra. */
export async function getAiProviderKeyById(integrationId: IntegrationId, keyId: string): Promise<ActiveAiProviderKey | null> {
    const stored = await loadStoredIntegration(integrationId)
    const item = stored?.apiKeys?.find((key) => key.id === keyId)
    if (!item || !isEncryptedSecret(item.secret)) return null
    let apiKey: string
    try {
        apiKey = decryptSecret(item.secret)
    } catch {
        return null
    }
    return apiKey.trim() ? { id: item.id, name: item.name, apiKey } : null
}

/** Uma chave do chaveiro com o segredo decifrado (`null` quando a caixa não decifra ou está vazia) e se está em uso. */
export interface AiProviderKeyRingEntry {
    id: string
    name: string
    active: boolean
    apiKey: string | null
}

function decryptKey(secret: unknown): string | null {
    if (!isEncryptedSecret(secret)) return null
    try {
        const value = decryptSecret(secret)
        return value.trim() ? value : null
    } catch {
        return null
    }
}

/** Todas as chaves do chaveiro, na ordem gravada (SOMENTE servidor): o chamador decide o que fazer com a que não decifra. */
export async function listAiProviderKeys(integrationId: IntegrationId): Promise<AiProviderKeyRingEntry[]> {
    const stored = await loadStoredIntegration(integrationId)
    const activeId = stored?.activeApiKeyId ?? null
    return (stored?.apiKeys ?? []).map((item) => ({ id: item.id, name: item.name, active: item.id === activeId, apiKey: decryptKey(item.secret) }))
}

/** Chave ativa ou erro acionável em pt-BR (provedor sem chave = não configurado). */
export async function requireActiveAiProviderKey(integrationId: IntegrationId, providerName: string): Promise<ActiveAiProviderKey> {
    const key = await getActiveAiProviderKey(integrationId)
    if (!key) throw new AiProviderError(`${providerName} sem chave de API ativa: cadastre e ative uma chave em Integrações › Inteligência Artificial › ${providerName}`)
    return key
}
