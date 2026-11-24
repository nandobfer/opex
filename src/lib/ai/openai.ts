import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { AI_REASONING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"
import { createKeyFailoverFetch, fetchWithKeyFailover, requireAiProviderKeyOrder, type AiProviderKey } from "./api-keys"

/**
 * OpenAI — SOMENTE servidor. Lista de modelos pela REST `v1/models` (filtrada para modelos de
 * texto); geração pelo `@ai-sdk/openai` (Vercel AI SDK, API Responses).
 */

import { OPENAI_API_URL } from "./endpoints"

export { OPENAI_API_URL }

const LABEL = "OpenAI"

interface OpenaiModelRaw {
    id: string
    created?: number
}

/** Modelos de chat/texto: GPT, série o e ChatGPT, sem embedding, áudio, imagem, vídeo e moderação. */
export function isOpenaiTextModel(id: string): boolean {
    return /^(gpt-|o\d|chatgpt-)/i.test(id) && !/(embedding|tts|whisper|dall-e|image|realtime|audio|transcribe|moderation|search|instruct|sora)/i.test(id)
}

/** Modelos que raciocinam: série o e GPT-5 em diante (exceto as variantes `-chat`). */
export function openaiSupportsReasoning(id: string): boolean {
    if (/^o\d/i.test(id)) return true
    const gpt = /^gpt-(\d+)/i.exec(id)
    return gpt !== null && Number(gpt[1]) >= 5 && !/-chat/i.test(id)
}

export function toOpenaiModel(raw: OpenaiModelRaw): AiModelDto {
    return {
        id: raw.id,
        name: raw.id,
        variants: openaiSupportsReasoning(raw.id) ? [...AI_REASONING_LEVELS] : [],
        group: null,
        contextWindow: null,
        free: false,
    }
}

/** Lista crua; as chaves em uso giram e trocam em falha (OPE-179). `key` confere só aquela chave. */
async function fetchOpenaiModelsRaw(signal?: AbortSignal, key?: AiProviderKey): Promise<OpenaiModelRaw[]> {
    let res: Response
    try {
        res = (await fetchWithKeyFailover("ai_openai", LABEL, (attempt) => debugFetch(integrationDebug("ai_openai"), LABEL, `${OPENAI_API_URL}/models`, { headers: { Authorization: `Bearer ${attempt.apiKey}` }, cache: "no-store", signal }), { keys: key ? [key] : undefined })).response
    } catch (error) {
        if (error instanceof AiProviderError) throw error
        throw new AiProviderError(`Não foi possível conectar à OpenAI: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`A OpenAI recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`A OpenAI respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { data?: OpenaiModelRaw[] }
    return body.data ?? []
}

const newestFirst = (a: OpenaiModelRaw, b: OpenaiModelRaw) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id)

export async function listOpenaiModels(signal?: AbortSignal, key?: AiProviderKey): Promise<AiModelDto[]> {
    return (await fetchOpenaiModelsRaw(signal, key))
        .filter((model) => isOpenaiTextModel(model.id))
        .sort(newestFirst)
        .map(toOpenaiModel)
}

/** Modelos de embedding (`text-embedding-…`), para o Engramind. Sem variantes. */
export async function listOpenaiEmbeddingModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    return (await fetchOpenaiModelsRaw(signal))
        .filter((model) => /embedding/i.test(model.id))
        .sort(newestFirst)
        .map((model) => ({ ...toOpenaiModel(model), variants: [] }))
}

/** Cliente da AI SDK com o rodízio das chaves em uso; `currentKeyId` é a chave que respondeu (consumo). */
export async function createOpenaiProvider(): Promise<{ provider: OpenAIProvider; currentKeyId: () => string }> {
    const keys = createKeyFailoverFetch({ order: await requireAiProviderKeyOrder("ai_openai", LABEL), label: LABEL })
    return { provider: createOpenAI({ apiKey: keys.initialApiKey, fetch: keys.fetch }), currentKeyId: () => keys.current().id }
}
