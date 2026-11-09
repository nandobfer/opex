import { createDeepSeek, type DeepSeekProvider } from "@ai-sdk/deepseek"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { AI_REASONING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"
import { requireActiveAiProviderKey, type ActiveAiProviderKey } from "./api-keys"

/**
 * DeepSeek — SOMENTE servidor. Lista de modelos pela REST `/models`; geração pelo
 * `@ai-sdk/deepseek` (Vercel AI SDK).
 */

import { DEEPSEEK_API_URL } from "./endpoints"

export { DEEPSEEK_API_URL }

/** Chave de API ativa do chaveiro (OPE-155); sem chave ativa o provedor não está configurado. */
async function getDeepseekKey(): Promise<ActiveAiProviderKey> {
    return requireActiveAiProviderKey("ai_deepseek", "DeepSeek")
}

async function getDeepseekApiKey(): Promise<string> {
    return (await getDeepseekKey()).apiKey
}

/** `deepseek-chat` é o alias sem raciocínio; os demais modelos raciocinam. */
export function deepseekSupportsReasoning(id: string): boolean {
    return !/-chat$/i.test(id)
}

export function toDeepseekModel(raw: { id: string }): AiModelDto {
    return {
        id: raw.id,
        name: raw.id,
        variants: deepseekSupportsReasoning(raw.id) ? [...AI_REASONING_LEVELS] : [],
        group: null,
        contextWindow: null,
        free: false,
    }
}

export async function listDeepseekModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    const apiKey = await getDeepseekApiKey()
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_deepseek"), "DeepSeek", `${DEEPSEEK_API_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal })
    } catch (error) {
        throw new AiProviderError(`Não foi possível conectar à DeepSeek: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`A DeepSeek recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`A DeepSeek respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { id: string }[] }
    return (body.data ?? []).map(toDeepseekModel).sort((a, b) => a.id.localeCompare(b.id))
}

/** Cliente da AI SDK com a chave ativa e o id dela (o consumo é atribuído à chave usada). */
export async function createDeepseekProvider(): Promise<{ provider: DeepSeekProvider; apiKeyId: string }> {
    const key = await getDeepseekKey()
    return { provider: createDeepSeek({ apiKey: key.apiKey }), apiKeyId: key.id }
}
