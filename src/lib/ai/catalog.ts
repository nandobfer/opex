import { dbConnect } from "@/lib/db"
import { IntegrationStatus, type IIntegrationStatus } from "@/lib/db/models/IntegrationStatus"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import { getIntegration, isIntegrationConfigured } from "@/lib/integrations/config"
import { listAnthropicModels } from "./anthropic"
import { listDeepseekModels } from "./deepseek"
import { listGeminiEmbeddingModels, listGeminiModels } from "./gemini"
import { listJevModels } from "./jev"
import { listOpenaiEmbeddingModels, listOpenaiModels } from "./openai"
import { listOpencodeAgents, listOpencodeModels, listOpencodeSkills } from "./opencode"
import { AI_PROVIDERS, getAiProvider, type AiAgentDto, type AiModelDto, type AiSkillDto, type AiProviderId, type AiProviderStatusDto } from "./providers"

/**
 * Catálogo dos provedores de IA (SOMENTE servidor): situação de cada provedor e modelos/agentes
 * disponíveis, com cache curto por configuração (`version` da integração).
 */

const MODEL_LISTERS: Record<AiProviderId, (signal?: AbortSignal) => Promise<AiModelDto[]>> = {
    opencode: listOpencodeModels,
    gemini: listGeminiModels,
    anthropic: listAnthropicModels,
    openai: listOpenaiModels,
    deepseek: listDeepseekModels,
    jev: listJevModels,
}

/** Tipo da lista: modelos de texto (padrão) ou de embedding (só Gemini e OpenAI listam). */
export type AiModelKind = "chat" | "embedding"
export const AI_MODEL_KINDS = ["chat", "embedding"] as const

const EMBEDDING_MODEL_LISTERS: Partial<Record<AiProviderId, (signal?: AbortSignal) => Promise<AiModelDto[]>>> = {
    gemini: listGeminiEmbeddingModels,
    openai: listOpenaiEmbeddingModels,
}

/** O provedor lista modelos de embedding. */
export const supportsEmbeddingModels = (providerId: AiProviderId) => providerId in EMBEDDING_MODEL_LISTERS

const CACHE_MS = 2 * 60_000
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, load: () => Promise<T>, fresh: boolean): Promise<T> {
    const hit = cache.get(key)
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value as T
    const value = await load()
    cache.set(key, { at: Date.now(), value })
    return value
}

export function clearAiCatalogCache(): void {
    cache.clear()
}

export async function getAiProviderStatuses(): Promise<AiProviderStatusDto[]> {
    await dbConnect()
    const statuses = (await IntegrationStatus.find({ integrationId: { $in: AI_PROVIDERS.map((p) => p.integrationId) } }).lean()) as IIntegrationStatus[]
    return Promise.all(
        AI_PROVIDERS.map(async (provider) => {
            const resolved = await getIntegration(provider.integrationId)
            const configured = isIntegrationConfigured(getIntegrationDef(provider.integrationId), resolved)
            const status = statuses.find((item) => item.integrationId === provider.integrationId)?.status
            return {
                id: provider.id,
                integrationId: provider.integrationId,
                name: provider.name,
                configured,
                connected: configured && (status === "ok" || status === "warn"),
            }
        }),
    )
}

export async function listAiModels(providerId: AiProviderId, options: { fresh?: boolean; signal?: AbortSignal; kind?: AiModelKind } = {}): Promise<AiModelDto[]> {
    const { version } = await getIntegration(getAiProvider(providerId).integrationId)
    if (options.kind === "embedding") {
        const lister = EMBEDDING_MODEL_LISTERS[providerId]
        if (!lister) return []
        return cached(`models:embedding:${providerId}:${version}`, () => lister(options.signal), options.fresh === true)
    }
    return cached(`models:${providerId}:${version}`, () => MODEL_LISTERS[providerId](options.signal), options.fresh === true)
}

export async function listAiAgents(options: { fresh?: boolean; signal?: AbortSignal } = {}): Promise<AiAgentDto[]> {
    const { version } = await getIntegration("ai_opencode")
    return cached(`agents:${version}`, () => listOpencodeAgents(options.signal), options.fresh === true)
}

/** Skills instaladas no servidor OpenCode (cache curto, como os agentes). */
export async function listAiSkills(options: { fresh?: boolean; signal?: AbortSignal } = {}): Promise<AiSkillDto[]> {
    const { version } = await getIntegration("ai_opencode")
    return cached(`skills:${version}`, () => listOpencodeSkills(options.signal), options.fresh === true)
}
