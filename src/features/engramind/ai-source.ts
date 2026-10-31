import { DEEPSEEK_API_URL, OPENAI_API_URL } from "@/lib/ai/endpoints"
import type { IntegrationId } from "@/lib/integrations/catalog"

/**
 * "IA do Opex" no Engramind (módulo PURO): mapeamento entre o provedor escolhido no Opex e as chaves
 * do Engramind. Escolher o provedor já define a URL (nunca há campo de URL): Gemini e Anthropic usam a
 * URL oficial (`base_url` vazio); OpenAI e DeepSeek vão como `openai_compatible` com a URL oficial.
 */

export const AI_SOURCE_SECTIONS = ["redator", "embedding"] as const
export type AiSourceSection = (typeof AI_SOURCE_SECTIONS)[number]

export const REDATOR_SOURCE_PROVIDERS = ["gemini", "anthropic", "openai", "deepseek"] as const
export type RedatorSourceProvider = (typeof REDATOR_SOURCE_PROVIDERS)[number]

/** Provedores do Opex que geram embeddings. */
export const EMBEDDING_REMOTE_PROVIDERS = ["gemini", "openai"] as const
export type EmbeddingRemoteProvider = (typeof EMBEDDING_REMOTE_PROVIDERS)[number]
/** Opções do embedding que não são provedores do Opex (sem chave nem sincronização). */
export const EMBEDDING_EXTRA_PROVIDERS = ["local", "off"] as const
export const EMBEDDING_SOURCE_PROVIDERS = ["local", ...EMBEDDING_REMOTE_PROVIDERS, "off"] as const
export type EmbeddingSourceProvider = (typeof EMBEDDING_SOURCE_PROVIDERS)[number]

export type OpexKeyProvider = RedatorSourceProvider
export const MAX_FALLBACK_MODELS = 5

/** Integração do Opex que guarda a chave de cada provedor. */
export const OPEX_KEY_INTEGRATION: Record<OpexKeyProvider, IntegrationId> = {
    gemini: "ai_gemini",
    anthropic: "ai_anthropic",
    openai: "ai_openai",
    deepseek: "ai_deepseek",
}
export const OPEX_KEY_PROVIDER_NAMES: Record<OpexKeyProvider, string> = { gemini: "Gemini", anthropic: "Anthropic", openai: "OpenAI", deepseek: "DeepSeek" }

export function opexKeyProviderOf(integrationId: string): OpexKeyProvider | null {
    return (Object.entries(OPEX_KEY_INTEGRATION).find(([, id]) => id === integrationId)?.[0] as OpexKeyProvider | undefined) ?? null
}

/** Segredo do Engramind de cada seção. */
export const SECTION_SECRET_KEY = { redator: "redator.api_key", embedding: "embedding.api_key" } as const

/** Chaves do Engramind controladas pela seção (somente leitura na aba Configurações). */
export const SECTION_SETTING_KEYS = {
    redator: ["redator.provider", "redator.model", "redator.base_url", "redator.fallback_models", "redator.temperature"],
    embedding: ["embedding.provider", "embedding.model", "embedding.base_url", "embedding.dimensions"],
} as const satisfies Record<AiSourceSection, readonly string[]>

/** Chaves que só a aba Provedores edita na tela (as `base_url` são definidas pelo provedor). */
export const PROVIDER_MANAGED_SETTING_KEYS: readonly string[] = [...SECTION_SETTING_KEYS.redator, ...SECTION_SETTING_KEYS.embedding]
export const IMPLICIT_URL_SETTING_KEYS: readonly string[] = ["redator.base_url", "embedding.base_url"]

export interface RedatorSource {
    provider: RedatorSourceProvider
    model: string
    fallbackModels: string[]
    /** Temperatura (0 a 2); `null` omite o campo no corpo e usa o padrão do modelo (Engramind 0.10.0). */
    temperature: number | null
}

export interface EmbeddingSource {
    provider: EmbeddingSourceProvider
    model: string | null
    dimensions: number | null
}

const REDATOR_ENGRAMIND: Record<RedatorSourceProvider, { provider: string; baseUrl: string | null }> = {
    gemini: { provider: "gemini", baseUrl: null },
    anthropic: { provider: "anthropic", baseUrl: null },
    openai: { provider: "openai_compatible", baseUrl: OPENAI_API_URL },
    deepseek: { provider: "openai_compatible", baseUrl: DEEPSEEK_API_URL },
}

const EMBEDDING_ENGRAMIND: Record<EmbeddingSourceProvider, { provider: string; baseUrl: string | null }> = {
    local: { provider: "local", baseUrl: null },
    gemini: { provider: "gemini", baseUrl: null },
    openai: { provider: "openai_compatible", baseUrl: OPENAI_API_URL },
    off: { provider: "off", baseUrl: null },
}

/** O provedor usa uma chave do Opex (Local e Desligado não usam). */
export const usesOpexKey = (provider: string): provider is OpexKeyProvider => (REDATOR_SOURCE_PROVIDERS as readonly string[]).includes(provider)

/** Mapa de configurações do Redator gravado no Engramind (com a URL implícita). */
export function redatorSettingsOf(source: RedatorSource): Record<string, unknown> {
    const target = REDATOR_ENGRAMIND[source.provider]
    return { "redator.provider": target.provider, "redator.model": source.model, "redator.base_url": target.baseUrl, "redator.fallback_models": source.fallbackModels, "redator.temperature": source.temperature ?? null }
}

/** Mapa de configurações do embedding. Desligado não mexe no modelo (o Engramind exige um). */
export function embeddingSettingsOf(source: EmbeddingSource): Record<string, unknown> {
    const target = EMBEDDING_ENGRAMIND[source.provider]
    const settings: Record<string, unknown> = { "embedding.provider": target.provider, "embedding.base_url": target.baseUrl, "embedding.dimensions": source.provider === "gemini" || source.provider === "openai" ? source.dimensions : null }
    if (source.provider !== "off" && source.model) settings["embedding.model"] = source.model
    return settings
}

export function sectionSettingsOf(section: AiSourceSection, source: RedatorSource | EmbeddingSource): Record<string, unknown> {
    return section === "redator" ? redatorSettingsOf(source as RedatorSource) : embeddingSettingsOf(source as EmbeddingSource)
}

const sameUrl = (a: unknown, b: string | null) => (typeof a === "string" && a.trim() ? a.trim().replace(/\/+$/, "") : null) === (b ? b.replace(/\/+$/, "") : null)
const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)

/** Provedor do Opex que corresponde à configuração atual do Redator (null: configuração própria do Engramind). */
export function redatorProviderOf(settings: Record<string, unknown>): RedatorSourceProvider | null {
    const match = REDATOR_SOURCE_PROVIDERS.find((id) => REDATOR_ENGRAMIND[id].provider === settings["redator.provider"] && sameUrl(settings["redator.base_url"], REDATOR_ENGRAMIND[id].baseUrl))
    return match ?? null
}

export function embeddingProviderOf(settings: Record<string, unknown>): EmbeddingSourceProvider | null {
    const match = EMBEDDING_SOURCE_PROVIDERS.find((id) => EMBEDDING_ENGRAMIND[id].provider === settings["embedding.provider"] && sameUrl(settings["embedding.base_url"], EMBEDDING_ENGRAMIND[id].baseUrl))
    return match ?? null
}

/** Último snapshot aplicado pela tela (ou pela ferramenta), sem segredo. */
export interface AiSourceSnapshot {
    provider: string
    model: string | null
    fallbackModels?: string[]
    dimensions?: number | null
    temperature?: number | null
    syncedAt: string | null
    syncError: string | null
    appliedAt: string
}

export type AiSourceOrigin = "opex" | "engramind" | "none"

const KEY_CLOCK_SKEW_MS = 10_000
const norm = (value: unknown) => JSON.stringify(value ?? null)

/**
 * Origem exibida, derivada do valor EM USO (nunca de uma flag): "opex" quando as chaves da seção
 * ainda batem com o último snapshot aplicado e a chave do Engramind não foi trocada depois da última
 * cópia; "engramind" quando algo mudou por fora (ferramenta, CLI, outro admin, chave gravada à mão);
 * "none" sem snapshot e sem configuração equivalente.
 */
export function deriveOrigin(section: AiSourceSection, current: Record<string, unknown>, snapshot: AiSourceSnapshot | null, secretUpdatedAt: string | null): AiSourceOrigin {
    if (!snapshot) return "none"
    const expected = section === "redator"
        ? redatorSettingsOf({ provider: snapshot.provider as RedatorSourceProvider, model: snapshot.model ?? "", fallbackModels: snapshot.fallbackModels ?? [], temperature: snapshot.temperature ?? null })
        : embeddingSettingsOf({ provider: snapshot.provider as EmbeddingSourceProvider, model: snapshot.model, dimensions: snapshot.dimensions ?? null })
    for (const [key, value] of Object.entries(expected)) {
        if (key.endsWith(".base_url")) {
            if (!sameUrl(current[key], (value as string | null) ?? null)) return "engramind"
            continue
        }
        if (key.endsWith(".fallback_models")) {
            if (norm(current[key] ?? []) !== norm(value)) return "engramind"
            continue
        }
        if (norm(current[key]) !== norm(value)) return "engramind"
    }
    if (usesOpexKey(snapshot.provider) && secretUpdatedAt && snapshot.syncedAt) {
        if (Date.parse(secretUpdatedAt) > Date.parse(snapshot.syncedAt) + KEY_CLOCK_SKEW_MS) return "engramind"
    }
    return "opex"
}

/** Resumo legível da configuração atual (quando a origem é o Engramind). */
export function describeCurrent(section: AiSourceSection, current: Record<string, unknown>): { provider: string | null; model: string | null; temperature: number | null } {
    const temperature = section === "redator" && typeof current["redator.temperature"] === "number" ? current["redator.temperature"] : null
    return { provider: asText(current[`${section}.provider`]), model: asText(current[`${section}.model`]), temperature }
}
