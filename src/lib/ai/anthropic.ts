import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { AI_REASONING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"
import { createKeyFailoverFetch, fetchWithKeyFailover, requireAiProviderKeyOrder, type AiProviderKey } from "./api-keys"

/**
 * Anthropic (Claude) — SOMENTE servidor. Lista de modelos pela REST `v1/models`; geração pelo
 * `@ai-sdk/anthropic` (Vercel AI SDK).
 */

import { ANTHROPIC_API_URL } from "./endpoints"

export { ANTHROPIC_API_URL }
const ANTHROPIC_VERSION = "2023-06-01"

const LABEL = "Anthropic"

interface AnthropicModelRaw {
    id: string
    display_name?: string
    created_at?: string
    max_input_tokens?: number
}

/** Os Claude 3.x anteriores ao 3.7 não raciocinam (sem extended thinking). */
export function anthropicSupportsReasoning(id: string): boolean {
    return !/^claude-(instant|2|3-(?!7))/i.test(id)
}

export function toAnthropicModel(raw: AnthropicModelRaw): AiModelDto {
    return {
        id: raw.id,
        name: raw.display_name ?? raw.id,
        variants: anthropicSupportsReasoning(raw.id) ? [...AI_REASONING_LEVELS] : [],
        group: null,
        contextWindow: raw.max_input_tokens ?? null,
        free: false,
    }
}

/**
 * Modelos da conta, do mais novo para o mais antigo. As chaves em uso giram e trocam em falha
 * (OPE-179); a que respondeu a primeira página segue nas demais. `key` confere só aquela chave.
 */
export async function listAnthropicModels(signal?: AbortSignal, key?: AiProviderKey): Promise<AiModelDto[]> {
    const models: AnthropicModelRaw[] = []
    let afterId: string | undefined
    let keys: AiProviderKey[] | undefined = key ? [key] : undefined
    do {
        const url = `${ANTHROPIC_API_URL}/models?limit=1000${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ""}`
        let res: Response
        try {
            const result = await fetchWithKeyFailover("ai_anthropic", LABEL, (attempt) => debugFetch(integrationDebug("ai_anthropic"), LABEL, url, { headers: { "x-api-key": attempt.apiKey, "anthropic-version": ANTHROPIC_VERSION }, cache: "no-store", signal }), { keys })
            res = result.response
            keys = [result.key]
        } catch (error) {
            if (error instanceof AiProviderError) throw error
            throw new AiProviderError(`Não foi possível conectar à Anthropic: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (res.status === 401 || res.status === 403) throw new AiProviderError(`A Anthropic recusou a API key (HTTP ${res.status})`)
        if (!res.ok) throw new AiProviderError(`A Anthropic respondeu HTTP ${res.status}`)
        const body = (await res.json()) as { data?: AnthropicModelRaw[]; has_more?: boolean; last_id?: string | null }
        models.push(...(body.data ?? []))
        afterId = body.has_more && body.last_id ? body.last_id : undefined
    } while (afterId)
    return models.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).map(toAnthropicModel)
}

/** Cliente da AI SDK com o rodízio das chaves em uso; `currentKeyId` é a chave que respondeu (consumo). */
export async function createAnthropicProvider(): Promise<{ provider: AnthropicProvider; currentKeyId: () => string }> {
    const keys = createKeyFailoverFetch({ order: await requireAiProviderKeyOrder("ai_anthropic", LABEL), label: LABEL })
    return { provider: createAnthropic({ apiKey: keys.initialApiKey, fetch: keys.fetch }), currentKeyId: () => keys.current().id }
}
