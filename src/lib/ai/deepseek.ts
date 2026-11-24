import { createDeepSeek, type DeepSeekProvider } from "@ai-sdk/deepseek"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { AI_REASONING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"
import { createKeyFailoverFetch, fetchWithKeyFailover, requireAiProviderKeyOrder, type AiProviderKey } from "./api-keys"

/**
 * DeepSeek — SOMENTE servidor. Lista de modelos pela REST `/models`; geração pelo
 * `@ai-sdk/deepseek` (Vercel AI SDK).
 */

import { DEEPSEEK_API_URL } from "./endpoints"

export { DEEPSEEK_API_URL }

const LABEL = "DeepSeek"

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

/** Modelos; as chaves em uso giram e trocam em falha (OPE-179). `key` confere só aquela chave. */
export async function listDeepseekModels(signal?: AbortSignal, key?: AiProviderKey): Promise<AiModelDto[]> {
    let res: Response
    try {
        res = (await fetchWithKeyFailover("ai_deepseek", LABEL, (attempt) => debugFetch(integrationDebug("ai_deepseek"), LABEL, `${DEEPSEEK_API_URL}/models`, { headers: { Authorization: `Bearer ${attempt.apiKey}` }, cache: "no-store", signal }), { keys: key ? [key] : undefined })).response
    } catch (error) {
        if (error instanceof AiProviderError) throw error
        throw new AiProviderError(`Não foi possível conectar à DeepSeek: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`A DeepSeek recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`A DeepSeek respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { id: string }[] }
    return (body.data ?? []).map(toDeepseekModel).sort((a, b) => a.id.localeCompare(b.id))
}

/** Cliente da AI SDK com o rodízio das chaves em uso; `currentKeyId` é a chave que respondeu (consumo). */
export async function createDeepseekProvider(): Promise<{ provider: DeepSeekProvider; currentKeyId: () => string }> {
    const keys = createKeyFailoverFetch({ order: await requireAiProviderKeyOrder("ai_deepseek", LABEL), label: LABEL })
    return { provider: createDeepSeek({ apiKey: keys.initialApiKey, fetch: keys.fetch }), currentKeyId: () => keys.current().id }
}
