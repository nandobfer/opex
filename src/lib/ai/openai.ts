import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai"
import { debugFetch, integrationDebug } from "@/lib/integrations/debug"
import { AI_REASONING_LEVELS, type AiModelDto } from "./providers"
import { AiProviderError } from "./errors"
import { requireActiveAiProviderKey, type ActiveAiProviderKey } from "./api-keys"

/**
 * OpenAI — SOMENTE servidor. Lista de modelos pela REST `v1/models` (filtrada para modelos de
 * texto); geração pelo `@ai-sdk/openai` (Vercel AI SDK, API Responses).
 */

import { OPENAI_API_URL } from "./endpoints"

export { OPENAI_API_URL }

/** Chave de API ativa do chaveiro (OPE-155); sem chave ativa o provedor não está configurado. */
async function getOpenaiKey(): Promise<ActiveAiProviderKey> {
    return requireActiveAiProviderKey("ai_openai", "OpenAI")
}

async function getOpenaiApiKey(): Promise<string> {
    return (await getOpenaiKey()).apiKey
}

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

async function fetchOpenaiModelsRaw(signal?: AbortSignal): Promise<OpenaiModelRaw[]> {
    const apiKey = await getOpenaiApiKey()
    let res: Response
    try {
        res = await debugFetch(integrationDebug("ai_openai"), "OpenAI", `${OPENAI_API_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal })
    } catch (error) {
        throw new AiProviderError(`Não foi possível conectar à OpenAI: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (res.status === 401 || res.status === 403) throw new AiProviderError(`A OpenAI recusou a API key (HTTP ${res.status})`)
    if (!res.ok) throw new AiProviderError(`A OpenAI respondeu HTTP ${res.status}`)
    const body = (await res.json()) as { data?: OpenaiModelRaw[] }
    return body.data ?? []
}

const newestFirst = (a: OpenaiModelRaw, b: OpenaiModelRaw) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id)

export async function listOpenaiModels(signal?: AbortSignal): Promise<AiModelDto[]> {
    return (await fetchOpenaiModelsRaw(signal))
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

/** Cliente da AI SDK com a chave ativa e o id dela (o consumo é atribuído à chave usada). */
export async function createOpenaiProvider(): Promise<{ provider: OpenAIProvider; apiKeyId: string }> {
    const key = await getOpenaiKey()
    return { provider: createOpenAI({ apiKey: key.apiKey }), apiKeyId: key.id }
}
