import { createGoogleGenerativeAI, type GoogleProvider } from "@ai-sdk/google"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { GEMINI_THINKING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"
import { createKeyFailoverFetch, fetchWithKeyFailover, requireAiProviderKeyOrder, type AiProviderKey } from "./api-keys"

/**
 * Google Gemini (API do Google AI Studio) — SOMENTE servidor. Lista de modelos pela REST
 * `v1beta/models`; geração pelo `@ai-sdk/google` (Vercel AI SDK).
 */

import { GEMINI_API_URL } from "./endpoints"

export { GEMINI_API_URL }

const LABEL = "Gemini"

interface GeminiModelRaw {
    name: string
    displayName?: string
    supportedGenerationMethods?: string[]
    inputTokenLimit?: number
    thinking?: boolean
}

export function toGeminiModel(raw: GeminiModelRaw): AiModelDto {
    return {
        id: raw.name.replace(/^models\//, ""),
        name: raw.displayName ?? raw.name.replace(/^models\//, ""),
        variants: raw.thinking ? [...GEMINI_THINKING_LEVELS] : [],
        group: null,
        contextWindow: raw.inputTokenLimit ?? null,
        free: false,
    }
}

/**
 * Modelos do Gemini (todas as páginas). As chaves em uso giram e trocam em falha (OPE-179); a chave
 * que respondeu a primeira página segue nas demais. `key` confere só aquela chave (teste por chave).
 */
async function fetchGeminiModelsRaw(signal?: AbortSignal, key?: AiProviderKey): Promise<GeminiModelRaw[]> {
    const models: GeminiModelRaw[] = []
    let pageToken: string | undefined
    let keys: AiProviderKey[] | undefined = key ? [key] : undefined
    do {
        const url = `${GEMINI_API_URL}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`
        let res: Response
        try {
            const result = await fetchWithKeyFailover("ai_gemini", LABEL, (attempt) => debugFetch(integrationDebug("ai_gemini"), LABEL, url, { headers: { "x-goog-api-key": attempt.apiKey }, cache: "no-store", signal }), { keys })
            res = result.response
            keys = [result.key]
        } catch (error) {
            if (error instanceof AiProviderError) throw error
            throw new AiProviderError(`Não foi possível conectar ao Gemini: ${error instanceof Error ? error.message : String(error)}`)
        }
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiProviderError(`O Gemini recusou a API key (HTTP ${res.status})`)
        if (!res.ok) throw new AiProviderError(`O Gemini respondeu HTTP ${res.status}`)
        const body = (await res.json()) as { models?: GeminiModelRaw[]; nextPageToken?: string }
        models.push(...(body.models ?? []))
        pageToken = body.nextPageToken
    } while (pageToken)
    return models
}

export async function listGeminiModels(signal?: AbortSignal, key?: AiProviderKey): Promise<AiModelDto[]> {
    return (await fetchGeminiModelsRaw(signal, key))
        .filter((model) => model.supportedGenerationMethods?.includes("generateContent") && /gemini|gemma/i.test(model.name) && !/(embedding|image|tts|audio|live)/i.test(model.name))
        .map(toGeminiModel)
        .sort((a, b) => b.id.localeCompare(a.id))
}

/** Modelos de embedding (`embedContent`), para o Engramind. Sem variantes. */
export async function listGeminiEmbeddingModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    return (await fetchGeminiModelsRaw(signal))
        .filter((model) => model.supportedGenerationMethods?.includes("embedContent"))
        .map((model) => ({ ...toGeminiModel(model), variants: [] }))
        .sort((a, b) => b.id.localeCompare(a.id))
}

/** Cliente da AI SDK com o rodízio das chaves em uso; `currentKeyId` é a chave que respondeu (consumo). */
export async function createGeminiProvider(): Promise<{ provider: GoogleProvider; currentKeyId: () => string }> {
    const keys = createKeyFailoverFetch({ order: await requireAiProviderKeyOrder("ai_gemini", LABEL), label: LABEL })
    return { provider: createGoogleGenerativeAI({ apiKey: keys.initialApiKey, fetch: keys.fetch }), currentKeyId: () => keys.current().id }
}
