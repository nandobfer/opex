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

/** Chave ativa ou erro acionável em pt-BR (provedor sem chave = não configurado). */
export async function requireActiveAiProviderKey(integrationId: IntegrationId, providerName: string): Promise<ActiveAiProviderKey> {
    const key = await getActiveAiProviderKey(integrationId)
    if (!key) throw new AiProviderError(`${providerName} sem chave de API ativa: cadastre e ative uma chave em Integrações › Inteligência Artificial › ${providerName}`)
    return key
}
